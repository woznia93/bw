// Generates reference numbers from the real C++ engine (woznia93/gpu_nn_framework)
// so the TypeScript reference engine can be tested against it.
//
// For each case it builds a small MLP, sets every weight to a known value, then
// records the initial predictions, the gradients after one forward/backward pass,
// the loss at each SGD step, and the weights and predictions at the end. The
// playground's network is: Linear -> activation per hidden layer, then
// Linear(.., 1) -> Sigmoid, trained with binary cross-entropy.
//
// Build and run: see cpp/golden/README.md. The optional first argument is
// recorded in the output as the source (for example the engine's commit).

#include "autograd.h"
#include "linear.h"
#include "optim.h"
#include "tensor.h"

#include <cmath>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>

struct Case {
    std::string name;
    std::vector<int> hidden;
    std::string activation;  // relu, tanh or sigmoid
    std::string optimizer;   // sgd, momentum or adam
    float lr;
};

static const int STEPS = 20;

// 12 training points, x, y, label
static const float DATA[12][3] = {
    {0.5f, 0.6f, 1}, {-0.4f, -0.7f, 1}, {0.8f, -0.3f, 0}, {-0.6f, 0.5f, 0},
    {0.2f, 0.9f, 1}, {-0.9f, -0.2f, 1}, {0.7f, -0.8f, 0}, {-0.3f, 0.4f, 0},
    {0.1f, 0.1f, 1}, {-0.5f, -0.5f, 1}, {0.6f, -0.1f, 0}, {-0.2f, 0.8f, 0},
};
static const float PROBE[6][2] = {
    {0.0f, 0.0f}, {0.5f, 0.5f}, {-0.5f, 0.5f}, {0.9f, -0.9f}, {-0.8f, -0.8f}, {0.3f, -0.6f},
};

static void print_array(const float* values, int n)
{
    std::printf("[");
    for (int i = 0; i < n; ++i) std::printf("%s%.9g", i ? "," : "", values[i]);
    std::printf("]");
}

static void print_tensors(const char* key, const std::vector<Tensor>& tensors, bool grads)
{
    std::printf("\"%s\":[", key);
    for (size_t k = 0; k < tensors.size(); ++k) {
        Tensor t = grads ? tensors[k].grad() : tensors[k];
        std::printf("%s", k ? "," : "");
        print_array(t.data_ptr(), t.numel());
    }
    std::printf("]");
}

static Tensor predict(Sequential& net)
{
    NoGradGuard guard;
    std::vector<float> probe;
    for (auto& p : PROBE) { probe.push_back(p[0]); probe.push_back(p[1]); }
    return net.forward(Tensor(probe, {6, 2}));
}

static void run_case(const Case& c, int case_index, bool last)
{
    Sequential net;
    std::vector<std::shared_ptr<Linear>> linears;
    int in = 2;
    for (int width : c.hidden) {
        auto layer = std::make_shared<Linear>(in, width);
        linears.push_back(layer);
        net.add(layer);
        if (c.activation == "relu") net.add(std::make_shared<ReLULayer>());
        else if (c.activation == "sigmoid") net.add(std::make_shared<SigmoidLayer>());
        else net.add(std::make_shared<TanhLayer>());
        in = width;
    }
    auto out = std::make_shared<Linear>(in, 1);
    linears.push_back(out);
    net.add(out);
    net.add(std::make_shared<SigmoidLayer>());

    // Known weights: smooth and deterministic, so the TypeScript test starts from
    // exactly the same numbers (they are also written to the output)
    std::vector<Tensor> params = net.parameters();
    for (size_t k = 0; k < params.size(); ++k) {
        float* data = params[k].data_ptr();
        for (int i = 0; i < params[k].numel(); ++i)
            data[i] = static_cast<float>(0.8 * std::sin(1.7 * i + 0.9 * k + 0.3 + case_index));
    }

    std::vector<float> inputs, targets;
    for (auto& row : DATA) { inputs.push_back(row[0]); inputs.push_back(row[1]); targets.push_back(row[2]); }
    Tensor x(inputs, {12, 2});
    Tensor y(targets, {12, 1});

    std::printf("{\"name\":\"%s\",\"hidden\":[", c.name.c_str());
    for (size_t i = 0; i < c.hidden.size(); ++i) std::printf("%s%d", i ? "," : "", c.hidden[i]);
    std::printf("],\"activation\":\"%s\",\"optimizer\":\"%s\",\"learningRate\":%.9g,\"steps\":%d,",
                c.activation.c_str(), c.optimizer.c_str(), c.lr, STEPS);

    print_tensors("initialParams", params, false);
    std::printf(",\"initialPredictions\":");
    print_array(predict(net).data_ptr(), 6);

    // One of the three optimizers, behind the common base class
    std::unique_ptr<Optimizer> optimizer;
    if (c.optimizer == "adam") optimizer = std::make_unique<Adam>(net.parameters(), c.lr);
    else if (c.optimizer == "momentum") optimizer = std::make_unique<SGD>(net.parameters(), c.lr, 0.9f);
    else optimizer = std::make_unique<SGD>(net.parameters(), c.lr);
    Optimizer& opt = *optimizer;

    std::vector<float> losses;
    for (int step = 0; step < STEPS; ++step) {
        opt.zero_grad();
        Tensor loss = binary_cross_entropy_loss(net.forward(x), y);
        loss.backward();
        losses.push_back(loss.data_ptr()[0]);
        if (step == 0) {
            std::printf(",");
            print_tensors("firstGrads", params, true);
        }
        opt.step();
    }

    std::printf(",\"losses\":");
    print_array(losses.data(), static_cast<int>(losses.size()));
    std::printf(",");
    print_tensors("finalParams", params, false);
    std::printf(",\"finalPredictions\":");
    print_array(predict(net).data_ptr(), 6);
    std::printf("}%s\n", last ? "" : ",");
}

int main(int argc, char** argv)
{
    const std::vector<Case> cases = {
        {"one hidden layer, relu", {3}, "relu", "sgd", 0.1f},
        {"two hidden layers, tanh", {4, 3}, "tanh", "sgd", 0.5f},
        {"three hidden layers, relu", {4, 3, 3}, "relu", "sgd", 0.1f},
        {"wide hidden layer, tanh, large step", {5}, "tanh", "sgd", 1.0f},
        {"two hidden layers, sigmoid", {4, 3}, "sigmoid", "sgd", 4.0f},
        {"momentum, tanh", {5}, "tanh", "momentum", 0.1f},
        {"momentum, two hidden layers, relu", {4, 3}, "relu", "momentum", 0.2f},
        {"adam, tanh", {5}, "tanh", "adam", 0.05f},
        {"adam, two hidden layers, relu", {6, 4}, "relu", "adam", 0.05f},
        {"adam, sigmoid", {4, 3}, "sigmoid", "adam", 0.3f},
    };

    std::printf("{\"source\":\"%s\",\"data\":[", argc > 1 ? argv[1] : "woznia93/gpu_nn_framework");
    for (int i = 0; i < 12; ++i)
        std::printf("%s[%.9g,%.9g,%d]", i ? "," : "", DATA[i][0], DATA[i][1], static_cast<int>(DATA[i][2]));
    std::printf("],\"probe\":[");
    for (int i = 0; i < 6; ++i)
        std::printf("%s[%.9g,%.9g]", i ? "," : "", PROBE[i][0], PROBE[i][1]);
    std::printf("],\"cases\":[\n");
    for (size_t i = 0; i < cases.size(); ++i)
        run_case(cases[i], static_cast<int>(i), i + 1 == cases.size());
    std::printf("]}\n");
    return 0;
}
