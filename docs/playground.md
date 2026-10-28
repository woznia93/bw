# Neural Network Playground: design and build plan

> **Status:** being built in 8 ordered PRs, tracked in [#13](https://github.com/woznia93/bw/issues/13).
> Each PR is labeled `playground` and `step N`, and merges after the previous step.
>
> | Step | What | Needs the C++ source? |
> | --- | --- | --- |
> | 1 | Scaffold, shared types, datasets, scatter plot | No |
> | 2 | TypeScript reference engine with gradient checks | No |
> | 3 | Training in a Web Worker and controls | No |
> | 4 | Decision boundary and loss curve | No |
> | 5 | Configurability and polish | No |
> | 6 | C++ engine compiled to WebAssembly | **Yes** |
> | 7 | Autograd inspector | Partly (real graphs) |
> | 8 | Launch: homepage, nav, write-up | No |
>
> The design below is the original proposal. Where it describes the C++/WebAssembly
> engine, steps 2 to 5 use a TypeScript stand-in behind the same interface
> (`NetworkEngine` in `src/lib/playground/types.ts`) so the UI can be built and tested
> first. Paths below use the Next.js App Router layout this site actually has.

---

# Interactive Neural Network Playground

An interactive portfolio feature for **[bradywoz.com](https://www.bradywoz.com)**, powered by a custom **C++ reverse-mode automatic differentiation engine**.

## Overview

Build a browser-based playground where visitors can configure, train, and inspect neural networks. Instead of only describing the C++ neural network framework, the site demonstrates it through live visualizations of training, decision boundaries, and gradient propagation.

**Proposed page:** `https://www.bradywoz.com/playground`

**Homepage feature:**

> **Neural Networks, Built From Scratch.**  
> Explore a neural network powered by my custom C++ automatic differentiation engine. Modify its architecture, train it on sample datasets, and inspect how gradients flow through the computation graph.

## Goals

- Demonstrate the underlying C++/autograd implementation, not just a third-party ML library.
- Let visitors experiment without installing software.
- Visualize what happens during forward and backward passes.
- Keep the site responsive and minimize ongoing hosting costs.
- Provide a compelling project case study for systems, C++, and ML engineering roles.

## Core User Experience

The playground has three primary panels:

1. **Network editor:** Choose the number of hidden layers and neurons, activation function, learning rate, and (eventually) optimizer.
2. **Training dashboard:** Select a dataset, start/pause/reset training, and watch the decision boundary and training metrics update.
3. **Autograd inspector:** Click nodes or edges to view activations, weights, gradients, and the operations that produced them.

### Suggested controls

| Control | Initial implementation | Later expansion |
| --- | --- | --- |
| Dataset | XOR, circles | Spirals, Gaussian clusters |
| Architecture | 1–2 hidden layers, adjustable width | Arbitrary supported layer configurations |
| Activation | ReLU, Tanh | Sigmoid, others |
| Learning rate | Slider or numeric input | Presets and schedules |
| Optimizer | SGD | Momentum, Adam |
| Training | Start, pause, reset, step | Epoch speed, batch size |
| Inspection | Loss, accuracy, decision boundary | Gradient norms, per-node activations, weight heatmaps |

## Main Visualizations

### 1. Decision boundary

Display the selected 2D dataset as colored points. Evaluate the current model across a grid of `(x, y)` coordinates and color the background according to its predictions. Refresh the visualization at intervals during training to show how the boundary changes.

**Implementation notes:**
- Keep the grid reasonably small (for example, 80 × 80) and batch inference calls.
- Use Canvas or WebGL for efficient rendering; SVG is also feasible for small datasets.
- Distinguish predicted class regions from actual labeled points.
- Show a legend and clearly indicate whether training is running.

### 2. Training metrics

Graph loss against training step or epoch. Optionally add validation loss, classification accuracy, and gradient norms. Show the learning rate and current step count alongside the chart.

**Implementation notes:**
- Throttle UI updates rather than rendering after every optimizer step.
- Store a bounded history of metrics.
- Use a chart library such as Recharts or a lightweight custom Canvas implementation.

### 3. Autograd computation graph

Show the computation graph generated during the forward pass. Highlight dependencies and demonstrate the reverse traversal that computes gradients.

For a simple example:

\[
z = wx + b, \qquad a = \operatorname{ReLU}(z)
\]

With `x = 2`, `w = 3`, and `b = -1`:

- Multiply: `wx = 6`.
- Add bias: `z = 5`.
- Apply activation: `a = ReLU(5) = 5`.
- Backpropagate: `da/dz = 1` because `z > 0`.
- Apply the chain rule: `da/dw = (da/dz) * x = 2`.

Allow visitors to step forward and backward through these operations. Eventually, support real graphs exported by the engine, including gradient accumulation and broadcast-aware gradient reduction.

## Architecture

### Preferred: C++ compiled to WebAssembly

```text
React / TypeScript UI
        |
        v
Web Worker (training + inference)
        |
        v
Emscripten WebAssembly bindings
        |
        v
Custom C++ tensor / autograd / neural network engine
        |
        v
Metrics + batched predictions + inspection snapshots
        |
        v
React visualizations (decision boundary, loss, graph)
```

**Why WebAssembly:**
- Runs the actual CPU C++ engine in the visitor's browser.
- Avoids per-user server-side training costs.
- Makes the portfolio demo accessible without a separate backend.
- Demonstrates C++ interoperability and systems engineering.

**Tradeoffs:**
- The C++ engine and dependencies must be compatible with Emscripten.
- JS/WASM data exchange and memory ownership require care.
- Large models or frequent full-graph snapshots may slow down the browser.
- CUDA kernels cannot be used directly through this CPU-only WASM path.

Run training in a **Web Worker** so the main UI stays responsive. Send compact snapshots to the UI periodically, rather than transferring the entire model state after every step.

### Alternative: Native C++ backend

```text
React UI -> FastAPI -> Python bindings / native C++ engine
                         |
                         v
                CPU or CUDA execution
```

This can be preferable if the framework depends on native libraries or you want to demonstrate CUDA. It introduces hosting, rate limiting, resource quotas, concurrency, and network latency considerations.

## C++ Interface Sketch

The following is a **proposed adapter interface**, not an assertion that these methods already exist in the framework:

```cpp
class Playground {
public:
    void initialize(
        const std::vector<int>& layers,
        float learning_rate
    );

    void set_dataset(
        const std::vector<float>& inputs,
        const std::vector<float>& targets
    );

    float train_step();

    std::vector<float> predict(
        const std::vector<float>& inputs
    );

    void reset();
};
```

Wrap this interface with **Embind** or a C-compatible ABI. Define input/output shapes and ownership rules explicitly. For example, flattened 2D input samples may use `[x0, y0, x1, y1, ...]`, while targets and output dimensions depend on the classification loss and architecture.

The adapter will also need a way to retrieve training metrics and, for advanced inspection, selected tensor values and gradients.

## Suggested Project Structure

```text
src/
├── components/
│   └── playground/
│       ├── Playground.tsx
│       ├── NetworkEditor.tsx
│       ├── NetworkGraph.tsx
│       ├── DecisionBoundary.tsx
│       ├── TrainingControls.tsx
│       ├── MetricsChart.tsx
│       └── AutogradInspector.tsx
├── workers/
│   └── training.worker.ts
├── lib/
│   └── playground/
│       ├── wasm-client.ts
│       ├── datasets.ts
│       ├── types.ts
│       └── graph-layout.ts
└── pages/
    └── playground.tsx

cpp/
├── playground_adapter.cpp
├── playground_adapter.hpp
└── CMakeLists.txt
```

Adjust this layout to the website's actual framework and routing conventions.

## Implementation Roadmap

### Phase 1 — MVP (roughly 1–2 weeks)

- [ ] Verify the CPU engine can build with Emscripten.
- [ ] Expose initialization, one training step, and batched prediction.
- [ ] Create XOR and circles datasets.
- [ ] Add architecture and learning-rate controls.
- [ ] Implement start, pause, reset, and step actions.
- [ ] Render the live decision boundary and loss curve.
- [ ] Run training in a Web Worker.
- [ ] Add loading states and helpful error messages.

**Definition of done:** A visitor can choose a dataset, configure a small MLP, train it, and see the decision boundary and loss evolve without freezing the page.

### Phase 2 — More configurable training (roughly 1–2 additional weeks)

- [ ] Support multiple hidden layers and activation functions.
- [ ] Add optimizer selection when supported by the engine.
- [ ] Show classification accuracy and gradient norms.
- [ ] Visualize weights between neurons.
- [ ] Add a resettable, reproducible random seed.
- [ ] Improve mobile layout and keyboard accessibility.

### Phase 3 — Autograd inspector (roughly 2+ additional weeks)

- [ ] Export selected computation-graph nodes and edges.
- [ ] Display tensor values, shapes, and gradients.
- [ ] Step through forward and backward operations.
- [ ] Visualize gradient accumulation and broadcasting.
- [ ] Add optional benchmark comparisons and saved configurations.
- [ ] Write a technical article explaining the engine and WASM integration.

**Timing caveat:** These are rough estimates assuming the current CPU framework already has the required training primitives. WASM compatibility or missing tensor operations could increase the work substantially.

## Technical Considerations

- **Responsiveness:** Keep training off the main thread; throttle metric and visualization updates.
- **Performance:** Batch grid predictions and avoid repeatedly copying large tensors between WASM and JavaScript.
- **Memory:** Reuse buffers where possible and clean up WASM-owned objects explicitly.
- **Reproducibility:** Allow fixed random seeds and a deterministic reset path where feasible.
- **Numerical correctness:** Validate gradients against finite differences on small graphs; compare model behavior against a trusted reference implementation.
- **Browser support:** Test Chromium, Firefox, Safari, and mobile devices.
- **Accessibility:** Provide labeled controls, keyboard navigation, and non-color-only class indicators.
- **Scope:** Begin with small CPU models; reserve large models and CUDA demonstrations for a future backend-based version.

## Portfolio Integration

Place a compact interactive preview on the homepage and link to `/playground` for the full experience. Alongside the demo, include:

- A link to the C++ framework's GitHub repository.
- An architecture diagram showing the autograd engine and browser integration.
- Benchmark methodology and measured results (once collected).
- A write-up on reverse-mode autograd, broadcasting, and gradient accumulation.

## Recommended Build Order

**Start with a working decision-boundary demo backed by the real C++ engine.** Then add network configuration and training metrics. Once that foundation is reliable, build the autograd stepper—the feature that most clearly demonstrates the internals of the framework.
