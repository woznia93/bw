# The C++ engine in the browser

`public/playground/engine.wasm` is the C++ autograd engine
([woznia93/gpu_nn_framework](https://github.com/woznia93/gpu_nn_framework)) compiled to
WebAssembly. The playground loads it in a Web Worker and trains with it; if it can't be
loaded, the page falls back to the TypeScript reference engine and says so.

| File | What it is |
| --- | --- |
| `playground_adapter.cpp` | A C interface around the engine: build a network, set the data, train a step, predict, read weights and gradients. Plain functions on plain numbers. |
| `no_throw.h` | Makes the engine's `throw` statements work without exceptions (see below). |
| `build.sh` | Compiles the engine and the adapter into `engine.wasm`. |

The TypeScript side is `src/lib/playground/wasm-engine.ts` (calls the C functions, implements the
same `NetworkEngine` interface as the TypeScript engine) and `wasi.ts` (the few operating-system
functions the module asks for).

## Rebuilding

The compiled file is committed, so deploying the site doesn't need a C++ toolchain. Rebuild it
when the engine or the adapter changes:

```bash
# Ubuntu 24.04 (or WSL). Other systems: clang 18+ with the wasm32 target and wasm-ld, plus a
# wasm32-wasi sysroot (C library and libc++); set WASI_SYSROOT if it isn't in /usr
sudo apt-get install clang lld libc++-18-dev-wasm32 libc++abi-18-dev-wasm32 \
     libclang-rt-18-dev-wasm32 wasi-libc

git clone https://github.com/woznia93/gpu_nn_framework ../gpu_nn_framework
cpp/wasm/build.sh ../gpu_nn_framework
pnpm test
```

The build refuses to run if the engine checkout has uncommitted changes, and the commit it was
built from is stored in the module (the page shows it: "commit faee471").

**The build is reproducible**: the same source and compiler give a byte-identical file. To check that
the committed `engine.wasm` really is what the source produces:

```bash
cpp/wasm/build.sh ../gpu_nn_framework /tmp/engine.wasm && cmp /tmp/engine.wasm public/playground/engine.wasm
```

Built with Ubuntu's clang 18.1.3, the committed file is 273,885 bytes, SHA-256
`9adfebd0ab2ebccff16961b3a903e94c63abf3dc78fef033419686ddf03bca15`.

## How it differs from a normal build of the engine

The engine's own files are compiled unchanged. These are the differences:

- **WebAssembly with WASI, not Emscripten.** It uses clang's WebAssembly target and the WASI C
  library, and a hand-written C interface in place of Embind. WASI is the standard way for a
  WebAssembly module to ask its host for things like a console and the environment; the page
  provides the six it needs (`wasi.ts`) and they all answer "nothing there".
- **No exceptions.** The WebAssembly C++ library has none, and the engine throws in 91 places but
  catches nothing. `no_throw.h` is force-included before every file and turns
  `throw std::runtime_error("x");` into "remember the message, then trap". That only happens
  if the engine is used wrongly, and the C interface checks its arguments first so that it
  can't be. If it ever does, `WasmEngine` turns the trap into an ordinary `Error` with the
  engine's message, refuses to continue, and starts a fresh copy of the module on the next
  `initialize()`.
- **CPU only, one thread, no SIMD.** No CUDA, no OpenMP, and the matrix multiply uses the engine's
  scalar fallback instead of its AVX2 path. Still, it runs several times faster than the TypeScript
  engine (a 6 x 32 training step is about 1.6 ms against 9.5 ms in Node).
- Two small runtime stubs in the adapter: libc++'s out-of-memory error (a trap) and the hook for
  destroying `thread_local` variables when a thread exits (a no-op, since there is one thread and it
  lasts as long as the module).

## Checking it against the native engine

`cpp/golden/` has numbers produced by the real engine built natively. `golden.test.ts` runs both
the TypeScript engine and this WebAssembly build against them: the first gradients, the loss at each
of 20 steps, and the final weights and predictions, for ten networks. The WebAssembly build agrees
to float32 rounding (largest difference about 6e-6, in Adam's weights; everything else is under
3e-7) and is held to the strict tolerance everywhere.
