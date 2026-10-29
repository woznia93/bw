# Reference numbers from the C++ engine

`gen_golden.cpp` uses the real C++ engine ([woznia93/gpu_nn_framework](https://github.com/woznia93/gpu_nn_framework))
to produce `src/lib/playground/__fixtures__/golden.json`. The playground's TypeScript
reference engine is tested against it (`src/lib/playground/golden.test.ts`), which is how we
know the stand-in behaves like the real engine: same layers, loss, optimizer and gradients.

It runs ten small networks (1 to 3 hidden layers; ReLU, tanh and sigmoid; SGD, SGD with momentum
0.9 and Adam; different learning rates) from fixed starting weights on 12 fixed points, and records
the initial predictions, the gradients after one backward pass, the loss at each of 20 optimizer
steps, and the final weights and predictions.

SGD and momentum agree with the TypeScript engine to about 3e-7. Adam's final weights can differ
by a few 1e-5, because Adam divides each update by the size of that weight's own gradient, which
magnifies float32 rounding noise in very small gradients. The test allows for that on Adam's final
weights only. Its losses and predictions still agree to a few 1e-7.

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
