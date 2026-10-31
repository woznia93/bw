# Reference numbers from the C++ engine

`gen_golden.cpp` uses the real C++ engine ([woznia93/gpu_nn_framework](https://github.com/woznia93/gpu_nn_framework)),
built natively, to produce `src/lib/playground/__fixtures__/golden.json`. Both of the playground's engines are
tested against it (`src/lib/playground/golden.test.ts`): the C++ engine compiled to WebAssembly
(`cpp/wasm`), which shows the browser build computes what the native build does, and the
TypeScript reference engine, the fallback if the WebAssembly module can't be loaded.

It runs ten small networks (1 to 3 hidden layers; ReLU, tanh and sigmoid; SGD, SGD with momentum
0.9 and Adam; different learning rates) from fixed starting weights on 12 fixed points, and records
the initial predictions, the gradients after one backward pass, the loss at each of 20 optimizer
steps, and the final weights and predictions.

**The C++ engine in WebAssembly** agrees with the native build to float32 rounding: gradients to 3e-8,
losses to 6e-8, predictions to 1.2e-7, SGD and momentum weights to 2.4e-7, and Adam's final weights to
6e-6. It is held to the strict tolerance everywhere.

**The TypeScript engine** agrees with SGD and momentum to about 3e-7, but its Adam final weights
can differ by a few 1e-5. It computes in 64 bits and rounds to 32 on storing, and Adam divides each
update by the size of that weight's own gradient, which magnifies the rounding noise in very small
gradients. (The C++ build, which shares the native engine's 32-bit arithmetic, doesn't show this.)
The test allows for that on the TypeScript engine's Adam final weights only; its losses and
predictions still agree to a few 1e-7.

## Regenerating

The fixture is committed, so you only need this if the engine or the test cases change.

```bash
git clone https://github.com/woznia93/gpu_nn_framework
cmake -S gpu_nn_framework -B fw-build -DUSE_CUDA=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build fw-build -j
g++ -std=c++17 -O2 -fopenmp -I gpu_nn_framework/include cpp/golden/gen_golden.cpp \
    fw-build/libnn_core.a -o gen_golden
./gen_golden "woznia93/gpu_nn_framework @ $(git -C gpu_nn_framework rev-parse --short HEAD) (CPU build)" \
    > src/lib/playground/__fixtures__/golden.json
pnpm test
```

Drop `-fopenmp` if the engine was configured without OpenMP.
