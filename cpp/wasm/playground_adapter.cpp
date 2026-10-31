// A C interface around the C++ engine (woznia93/gpu_nn_framework), for the playground.
//
// It builds the same network as the TypeScript reference engine: for each hidden layer
// Linear -> activation, then Linear(.., 1) -> Sigmoid, trained with binary cross-entropy
// on the whole dataset each step, using SGD, SGD with momentum 0.9, or Adam. Everything
// the page needs goes through plain functions on plain numbers: no C++ types cross over.
//
// Conventions:
//   - Functions that can fail return 0 on success and a nonzero code on failure, and
//     pg_last_error() then says why. They check their arguments first, so the engine's
//     own error checks (which trap in this build, see no_throw.h) are never reached.
//   - Arrays are flattened row by row. Inputs are [x0, y0, x1, y1, ...].
//   - Parameters are numbered in layer order: weight [out, in], bias [out], weight, ...
//     which is the order of Sequential::parameters().
//   - Buffers the page fills in or reads back are allocated with pg_alloc/pg_free,
//     because the page can only reach WebAssembly's memory through addresses.

#include "autograd.h"
#include "linear.h"
#include "optim.h"
#include "tensor.h"

#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#ifndef PG_ENGINE_COMMIT
#define PG_ENGINE_COMMIT "unknown"
#endif

#define EXPORT(name) __attribute__((export_name(#name)))

namespace {

constexpr int kMaxHiddenLayers = 6;
constexpr int kMaxNeurons = 32;
constexpr float kMomentumCoefficient = 0.9f;

enum Activation { kRelu = 0, kTanh = 1, kSigmoid = 2 };
enum OptimizerKind { kSgd = 0, kMomentum = 1, kAdam = 2 };

std::string g_last_error;

int fail(const std::string& message)
{
    g_last_error = message;
    return 1;
}

struct Playground {
    std::vector<int> hidden;
    int activation = kTanh;
    int optimizer_kind = kSgd;
    float learning_rate = 0.1f;
    uint64_t seed = 0;

    Sequential net;
    std::vector<Tensor> params;
    std::unique_ptr<Optimizer> optimizer;
    // Kept so the learning rate can be changed without rebuilding the optimizer
    SGD* sgd = nullptr;
    Adam* adam = nullptr;

    Tensor inputs;   // [n, 2]
    Tensor targets;  // [n, 1]
    int count = 0;

    // Builds the layers (drawing the starting weights from the engine's seeded random
    // generator) and the optimizer. Called again by reset(), which gives the same weights.
    void build()
    {
        net = Sequential();
        manual_seed(seed);
        int in = 2;
        for (int width : hidden) {
            net.add(std::make_shared<Linear>(in, width));
            if (activation == kRelu) net.add(std::make_shared<ReLULayer>());
            else if (activation == kSigmoid) net.add(std::make_shared<SigmoidLayer>());
            else net.add(std::make_shared<TanhLayer>());
            in = width;
        }
        net.add(std::make_shared<Linear>(in, 1));
        net.add(std::make_shared<SigmoidLayer>());

        params = net.parameters();
        sgd = nullptr;
        adam = nullptr;
        if (optimizer_kind == kAdam) {
            auto adam_optimizer = std::make_unique<Adam>(params, learning_rate);
            adam = adam_optimizer.get();
            optimizer = std::move(adam_optimizer);
        } else {
            auto sgd_optimizer = std::make_unique<SGD>(
                params, learning_rate, optimizer_kind == kMomentum ? kMomentumCoefficient : 0.f);
            sgd = sgd_optimizer.get();
            optimizer = std::move(sgd_optimizer);
        }
    }
};

std::unique_ptr<Playground> g_playground;

bool valid_learning_rate(float lr) { return std::isfinite(lr) && lr > 0.f; }

int require_ready()
{
    if (!g_playground) return fail("call pg_init() first");
    return 0;
}

int require_parameter(int index)
{
    if (int error = require_ready()) return error;
    if (index < 0 || index >= static_cast<int>(g_playground->params.size()))
        return fail("parameter index out of range");
    return 0;
}

}  // namespace

namespace nn_wasm {
// Called by no_throw.h just before the engine traps
void record_error(const char* message) { g_last_error = message ? message : "engine error"; }
}  // namespace nn_wasm

// The C++ runtime pieces this build doesn't have:
//  - libc++ throws only when memory runs out (operator new). With no exceptions, that is a trap.
//  - gemm.cpp keeps packing buffers in thread_local variables, which need a hook to be
//    destroyed when a thread exits. There is one thread here, and it lives as long as the
//    module, so there is nothing to destroy early.
extern "C" {
void* __cxa_allocate_exception(unsigned long) { __builtin_trap(); }
void __cxa_throw(void*, void*, void (*)(void*)) { __builtin_trap(); }
int __cxa_thread_atexit(void (*)(void*), void*, void*) { return 0; }

EXPORT(pg_version) const char* pg_version() { return PG_ENGINE_COMMIT; }

EXPORT(pg_last_error) const char* pg_last_error() { return g_last_error.c_str(); }

EXPORT(pg_alloc) void* pg_alloc(int bytes) { return std::malloc(bytes > 0 ? static_cast<size_t>(bytes) : 1); }

EXPORT(pg_free) void pg_free(void* pointer) { std::free(pointer); }

// Builds a fresh network. activation: 0 relu, 1 tanh, 2 sigmoid. optimizer: 0 sgd, 1
// momentum, 2 adam. Replaces any earlier network and its dataset.
EXPORT(pg_init)
int pg_init(const int* hidden, int hidden_count, int activation, int optimizer, float learning_rate, unsigned seed)
{
    if (hidden_count < 0 || hidden_count > kMaxHiddenLayers)
        return fail("hidden must list at most " + std::to_string(kMaxHiddenLayers) + " layers");
    for (int i = 0; i < hidden_count; i++) {
        if (hidden[i] < 1 || hidden[i] > kMaxNeurons)
            return fail("each hidden layer needs 1 to " + std::to_string(kMaxNeurons) + " neurons");
    }
    if (activation < kRelu || activation > kSigmoid) return fail("unknown activation");
    if (optimizer < kSgd || optimizer > kAdam) return fail("unknown optimizer");
    if (!valid_learning_rate(learning_rate)) return fail("learning rate must be a positive number");

    auto next = std::make_unique<Playground>();
    next->hidden.assign(hidden, hidden + hidden_count);
    next->activation = activation;
    next->optimizer_kind = optimizer;
    next->learning_rate = learning_rate;
    next->seed = seed;
    next->build();
    g_playground = std::move(next);
    return 0;
}

EXPORT(pg_set_dataset)
int pg_set_dataset(const float* inputs, const float* targets, int count)
{
    if (int error = require_ready()) return error;
    if (count < 1) return fail("the dataset has no points");
    g_playground->inputs = Tensor(std::vector<float>(inputs, inputs + 2 * count), {count, 2});
    g_playground->targets = Tensor(std::vector<float>(targets, targets + count), {count, 1});
    g_playground->count = count;
    return 0;
}

// One step over the whole dataset. Returns the loss, or NaN if it couldn't run (the
// reason is in pg_last_error()).
EXPORT(pg_train_step)
float pg_train_step()
{
    if (require_ready() || g_playground->count == 0) {
        if (g_playground && g_playground->count == 0) g_last_error = "call pg_set_dataset() first";
        return NAN;
    }
    Playground& p = *g_playground;
    p.optimizer->zero_grad();
    Tensor loss = binary_cross_entropy_loss(p.net.forward(p.inputs), p.targets);
    loss.backward();
    const float value = loss.data_ptr()[0];
    p.optimizer->step();
    return value;
}

// Writes the probability of class 1 for each of `count` points to `output`
EXPORT(pg_predict)
int pg_predict(const float* inputs, int count, float* output)
{
    if (int error = require_ready()) return error;
    if (count < 0) return fail("count must not be negative");
    if (count == 0) return 0;
    NoGradGuard no_grad;
    Tensor result = g_playground->net.forward(Tensor(std::vector<float>(inputs, inputs + 2 * count), {count, 2}));
    std::memcpy(output, result.data_ptr(), static_cast<size_t>(count) * sizeof(float));
    return 0;
}

// Back to the starting weights for the same seed and settings, keeping the dataset
EXPORT(pg_reset)
int pg_reset()
{
    if (int error = require_ready()) return error;
    g_playground->build();
    return 0;
}

EXPORT(pg_set_learning_rate)
int pg_set_learning_rate(float learning_rate)
{
    if (int error = require_ready()) return error;
    if (!valid_learning_rate(learning_rate)) return fail("learning rate must be a positive number");
    g_playground->learning_rate = learning_rate;
    if (g_playground->adam) g_playground->adam->set_lr(learning_rate);
    if (g_playground->sgd) g_playground->sgd->set_lr(learning_rate);
    return 0;
}

EXPORT(pg_param_count) int pg_param_count() { return g_playground ? static_cast<int>(g_playground->params.size()) : 0; }

EXPORT(pg_param_size)
int pg_param_size(int index)
{
    return require_parameter(index) ? -1 : g_playground->params[index].numel();
}

EXPORT(pg_get_param)
int pg_get_param(int index, float* output)
{
    if (int error = require_parameter(index)) return error;
    const Tensor& t = g_playground->params[index];
    std::memcpy(output, t.data_ptr(), static_cast<size_t>(t.numel()) * sizeof(float));
    return 0;
}

EXPORT(pg_set_param)
int pg_set_param(int index, const float* values)
{
    if (int error = require_parameter(index)) return error;
    Tensor& t = g_playground->params[index];
    std::memcpy(t.data_ptr(), values, static_cast<size_t>(t.numel()) * sizeof(float));
    return 0;
}

// The gradient from the latest step, or zeros if there hasn't been one
EXPORT(pg_get_grad)
int pg_get_grad(int index, float* output)
{
    if (int error = require_parameter(index)) return error;
    const Tensor& t = g_playground->params[index];
    Tensor grad = t.grad();
    if (grad.defined()) std::memcpy(output, grad.data_ptr(), static_cast<size_t>(t.numel()) * sizeof(float));
    else std::memset(output, 0, static_cast<size_t>(t.numel()) * sizeof(float));
    return 0;
}

}  // extern "C"
