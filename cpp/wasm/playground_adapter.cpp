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

#include <algorithm>
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

// ── Computation graph inspection ─────────────────────────────────────────────────────
//
// For the autograd inspector. The page asks for a small graph, built here with the
// engine's own operators, and then reads back every node and the gradients after each
// step of the backward pass. The backward pass is AutogradEngine::backward written out
// one node at a time (same ordering, same GradFn::apply calls), so that the gradients
// can be copied between steps. The TypeScript engine reports the same things; the tests
// compare the two.

struct GradSnapshot {
    std::vector<std::vector<float>> values;
    std::vector<char> defined;
};

struct GraphTrace {
    std::vector<Tensor> nodes;                // inputs before the nodes computed from them
    std::vector<std::string> labels;
    std::vector<std::string> ops;
    std::vector<std::vector<int>> parents;
    int root = 0;
    GradSnapshot initial;
    std::vector<int> step_nodes;
    std::vector<GradSnapshot> step_grads;
};

std::unique_ptr<GraphTrace> g_graph;

struct Labeler {
    std::vector<std::pair<TensorImpl*, std::string>> names;
    Tensor name(const Tensor& tensor, const char* label)
    {
        names.emplace_back(tensor.impl().get(), label);
        return tensor;
    }
    std::string find(TensorImpl* impl) const
    {
        for (const auto& entry : names) if (entry.first == impl) return entry.second;
        return "?";
    }
};

void collect_forward(const Tensor& tensor, std::vector<TensorImpl*>& seen, std::vector<Tensor>& order)
{
    TensorImpl* node = tensor.impl().get();
    for (TensorImpl* other : seen) if (other == node) return;
    seen.push_back(node);
    if (node->grad_fn)
        for (const Tensor& input : node->grad_fn->inputs)
            if (input.defined()) collect_forward(input, seen, order);
    order.push_back(tensor);
}

// The order AutogradEngine::build_topo gives: inputs that don't need gradients are left out
void collect_backward(TensorImpl* node, std::vector<TensorImpl*>& seen, std::vector<TensorImpl*>& order)
{
    for (TensorImpl* other : seen) if (other == node) return;
    seen.push_back(node);
    if (node->grad_fn)
        for (const Tensor& input : node->grad_fn->inputs)
            if (input.defined() && input.requires_grad()) collect_backward(input.impl().get(), seen, order);
    order.push_back(node);
}

GradSnapshot snapshot_grads(const std::vector<TensorImpl*>& nodes)
{
    GradSnapshot snapshot;
    for (TensorImpl* node : nodes) {
        if (node->grad) {
            Tensor grad(node->grad);
            snapshot.values.emplace_back(grad.data_ptr(), grad.data_ptr() + grad.numel());
            snapshot.defined.push_back(1);
        } else {
            snapshot.values.emplace_back();
            snapshot.defined.push_back(0);
        }
    }
    return snapshot;
}

void trace_graph(const Tensor& root, const Labeler& labeler)
{
    auto trace = std::make_unique<GraphTrace>();
    std::vector<TensorImpl*> seen;
    collect_forward(root, seen, trace->nodes);
    const std::vector<Tensor>& order = trace->nodes;
    std::vector<TensorImpl*> impls;
    for (const Tensor& node : order) impls.push_back(node.impl().get());
    auto position = [&](TensorImpl* impl) {
        for (size_t i = 0; i < impls.size(); ++i) if (impls[i] == impl) return static_cast<int>(i);
        return -1;
    };

    for (TensorImpl* node : impls) {
        trace->labels.push_back(labeler.find(node));
        trace->ops.push_back(node->grad_fn ? node->grad_fn->name() : "leaf");
        std::vector<int> parents;
        if (node->grad_fn)
            for (const Tensor& input : node->grad_fn->inputs) parents.push_back(position(input.impl().get()));
        trace->parents.push_back(parents);
    }
    trace->root = position(root.impl().get());

    // The backward pass, one node at a time
    Tensor loss = root;
    NoGradGuard no_grad;
    loss.accumulate_grad(Tensor::ones({1}));
    trace->initial = snapshot_grads(impls);
    std::vector<TensorImpl*> seen_backward, topo;
    collect_backward(root.impl().get(), seen_backward, topo);
    std::reverse(topo.begin(), topo.end());
    for (TensorImpl* node : topo) {
        if (!node->grad_fn || !node->grad) continue;
        Tensor g(node->grad);
        node->grad_fn->apply(g);
        trace->step_nodes.push_back(position(node));
        trace->step_grads.push_back(snapshot_grads(impls));
    }
    g_graph = std::move(trace);
}

Tensor leaf_tensor(const std::vector<float>& values, const std::vector<int>& shape, bool requires_grad)
{
    return Tensor(values, shape, Device::CPU, requires_grad);
}

enum GraphKind { kWorked = 0, kReuse = 1, kBroadcast = 2, kNetwork = 3 };

int require_graph()
{
    if (!g_graph) return fail("call pg_graph_build() first");
    return 0;
}

int require_node(int index)
{
    if (int error = require_graph()) return error;
    if (index < 0 || index >= static_cast<int>(g_graph->nodes.size())) return fail("node index out of range");
    return 0;
}

// step -1 is the state before the backward pass
const GradSnapshot* find_snapshot(int step)
{
    if (step == -1) return &g_graph->initial;
    if (step < 0 || step >= static_cast<int>(g_graph->step_grads.size())) return nullptr;
    return &g_graph->step_grads[step];
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

// ── Computation graph inspection ─────────────────────────────────────────────────────

// Builds one of the example graphs and runs its backward pass, step by step.
//   kind 0, worked:    a = relu(w * x + b)         arguments: x, w, b
//   kind 1, reuse:     f = x * x + x               arguments: x
//   kind 2, broadcast: loss = sum(X + b)           no arguments (X is 3 x 2, b has 2 values)
//   kind 3, network:   the current network's forward pass and loss for one point
//                      arguments: x, y, class (0 or 1)
// The network is run on copies of its weights, so training is not affected.
EXPORT(pg_graph_build)
int pg_graph_build(int kind, float a, float b, float c)
{
    Labeler labeler;
    if (kind == kWorked) {
        Tensor x = labeler.name(leaf_tensor({a}, {1}, true), "x");
        Tensor w = labeler.name(leaf_tensor({b}, {1}, true), "w");
        Tensor bias = labeler.name(leaf_tensor({c}, {1}, true), "b");
        Tensor wx = labeler.name(w * x, "wx");
        Tensor z = labeler.name(wx + bias, "z");
        Tensor out = labeler.name(z.relu(), "a");
        trace_graph(out, labeler);
        return 0;
    }
    if (kind == kReuse) {
        Tensor x = labeler.name(leaf_tensor({a}, {1}, true), "x");
        Tensor y = labeler.name(x * x, "y");
        Tensor f = labeler.name(y + x, "f");
        trace_graph(f, labeler);
        return 0;
    }
    if (kind == kBroadcast) {
        Tensor x = labeler.name(leaf_tensor({1, 2, 3, 4, 5, 6}, {3, 2}, false), "X");
        Tensor bias = labeler.name(leaf_tensor({0.5f, -1.f}, {2}, true), "b");
        Tensor y = labeler.name(x + bias, "Y");
        Tensor loss = labeler.name(y.sum(), "loss");
        trace_graph(loss, labeler);
        return 0;
    }
    if (kind != kNetwork) return fail("unknown graph kind");
    if (int error = require_ready()) return error;
    if (c != 0.f && c != 1.f) return fail("the class must be 0 or 1");
    const Playground& p = *g_playground;

    Tensor h = labeler.name(leaf_tensor({a, b}, {1, 2}, false), "x");
    int in = 2;
    const int layers = static_cast<int>(p.hidden.size()) + 1;
    for (int i = 0; i < layers; ++i) {
        const int out = i < layers - 1 ? p.hidden[i] : 1;
        // A layer holding copies of the current weights
        Linear layer(in, out);
        std::memcpy(layer.weight().data_ptr(), p.params[2 * i].data_ptr(), sizeof(float) * in * out);
        std::memcpy(layer.bias().data_ptr(), p.params[2 * i + 1].data_ptr(), sizeof(float) * out);
        Tensor w = labeler.name(layer.weight(), ("W" + std::to_string(i + 1)).c_str());
        Tensor bias = labeler.name(layer.bias(), ("b" + std::to_string(i + 1)).c_str());
        Tensor z = labeler.name(layer.forward(h), ("z" + std::to_string(i + 1)).c_str());
        if (i == layers - 1) h = labeler.name(z.sigmoid(), "p");
        else if (p.activation == kRelu) h = labeler.name(z.relu(), ("h" + std::to_string(i + 1)).c_str());
        else if (p.activation == kSigmoid) h = labeler.name(z.sigmoid(), ("h" + std::to_string(i + 1)).c_str());
        else h = labeler.name(z.tanh(), ("h" + std::to_string(i + 1)).c_str());
        (void)w;
        (void)bias;
        in = out;
    }
    Tensor target = leaf_tensor({c}, {1, 1}, false);
    Tensor loss = labeler.name(binary_cross_entropy_loss(h, target), "loss");
    trace_graph(loss, labeler);
    return 0;
}

EXPORT(pg_graph_node_count) int pg_graph_node_count() { return g_graph ? static_cast<int>(g_graph->nodes.size()) : 0; }
EXPORT(pg_graph_step_count) int pg_graph_step_count() { return g_graph ? static_cast<int>(g_graph->step_nodes.size()) : 0; }
EXPORT(pg_graph_root) int pg_graph_root() { return g_graph ? g_graph->root : -1; }

// Text is valid until the next pg_graph_build
EXPORT(pg_graph_node_label)
const char* pg_graph_node_label(int index) { return require_node(index) ? "" : g_graph->labels[index].c_str(); }

EXPORT(pg_graph_node_op)
const char* pg_graph_node_op(int index) { return require_node(index) ? "" : g_graph->ops[index].c_str(); }

EXPORT(pg_graph_node_rank)
int pg_graph_node_rank(int index)
{
    return require_node(index) ? -1 : static_cast<int>(g_graph->nodes[index].impl()->shape.size());
}

EXPORT(pg_graph_node_dim)
int pg_graph_node_dim(int index, int axis)
{
    if (require_node(index)) return -1;
    const auto& shape = g_graph->nodes[index].impl()->shape;
    return axis < 0 || axis >= static_cast<int>(shape.size()) ? -1 : shape[axis];
}

EXPORT(pg_graph_node_numel)
int pg_graph_node_numel(int index) { return require_node(index) ? -1 : g_graph->nodes[index].impl()->numel; }

EXPORT(pg_graph_node_requires_grad)
int pg_graph_node_requires_grad(int index) { return require_node(index) ? 0 : g_graph->nodes[index].impl()->requires_grad ? 1 : 0; }

EXPORT(pg_graph_node_parent_count)
int pg_graph_node_parent_count(int index) { return require_node(index) ? -1 : static_cast<int>(g_graph->parents[index].size()); }

EXPORT(pg_graph_node_parent)
int pg_graph_node_parent(int index, int which)
{
    if (require_node(index)) return -1;
    const auto& parents = g_graph->parents[index];
    return which < 0 || which >= static_cast<int>(parents.size()) ? -1 : parents[which];
}

EXPORT(pg_graph_node_value)
int pg_graph_node_value(int index, float* output)
{
    if (int error = require_node(index)) return error;
    const Tensor& t = g_graph->nodes[index];
    std::memcpy(output, t.data_ptr(), static_cast<size_t>(t.numel()) * sizeof(float));
    return 0;
}

// The node whose backward function ran in this step
EXPORT(pg_graph_step_node)
int pg_graph_step_node(int step)
{
    if (require_graph() || step < 0 || step >= static_cast<int>(g_graph->step_nodes.size())) return -1;
    return g_graph->step_nodes[step];
}

// Whether a node has a gradient after a step (step -1: before the first step)
EXPORT(pg_graph_grad_defined)
int pg_graph_grad_defined(int step, int index)
{
    if (require_node(index)) return 0;
    const GradSnapshot* snapshot = find_snapshot(step);
    return snapshot && snapshot->defined[index] ? 1 : 0;
}

EXPORT(pg_graph_grad)
int pg_graph_grad(int step, int index, float* output)
{
    if (int error = require_node(index)) return error;
    const GradSnapshot* snapshot = find_snapshot(step);
    if (!snapshot) return fail("step out of range");
    if (!snapshot->defined[index]) return fail("this node has no gradient");
    const auto& values = snapshot->values[index];
    std::memcpy(output, values.data(), values.size() * sizeof(float));
    return 0;
}

}  // extern "C"
