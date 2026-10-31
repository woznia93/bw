#!/usr/bin/env bash
# Builds the C++ engine (woznia93/gpu_nn_framework) plus playground_adapter.cpp into the
# WebAssembly module the playground loads: public/playground/engine.wasm.
#
#   cpp/wasm/build.sh /path/to/gpu_nn_framework [output.wasm]
#
# Needs clang 18 or newer with the WebAssembly target and wasm-ld, and a wasm32-wasi
# sysroot (C library and libc++). On Ubuntu 24.04:
#   sudo apt-get install clang lld libc++-18-dev-wasm32 libc++abi-18-dev-wasm32 \
#        libclang-rt-18-dev-wasm32 wasi-libc
# Set WASI_SYSROOT if the sysroot isn't in /usr, and CLANGXX to use a specific clang++.
# See cpp/wasm/README.md.
set -euo pipefail

ENGINE="${1:?usage: build.sh /path/to/gpu_nn_framework [output.wasm]}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${2:-$HERE/../../public/playground/engine.wasm}"
CLANGXX="${CLANGXX:-clang++}"
SYSROOT="${WASI_SYSROOT:-/usr}"
COMMIT="$(git -C "$ENGINE" rev-parse --short HEAD)"

# Refuse to build from an engine with uncommitted changes, so the version recorded in
# the module always names exactly the code inside it
if [ -n "$(git -C "$ENGINE" status --porcelain --untracked-files=no)" ]; then
  echo "error: $ENGINE has uncommitted changes" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# -fno-exceptions: the WebAssembly C++ library has none. no_throw.h turns the engine's
#   throws into traps (see that file). -fno-rtti: the engine doesn't use it.
# No CUDA and no OpenMP: those are skipped, as in a plain CPU build of the engine.
FLAGS=(
  --target=wasm32-wasi --sysroot="$SYSROOT"
  -std=c++17 -O3 -DNDEBUG -fno-exceptions -fno-rtti
  -Wno-unknown-pragmas -Wno-pass-failed
  -I "$ENGINE/include"
  -include "$HERE/no_throw.h"
  -DPG_ENGINE_COMMIT="\"$COMMIT\""
  -ffile-prefix-map="$ENGINE"=engine -ffile-prefix-map="$HERE"=wasm
)

OBJECTS=()
for source in "$ENGINE"/src/{gemm,tensor,autograd,linear,optim}.cpp "$HERE/playground_adapter.cpp"; do
  object="$WORK/$(basename "$source" .cpp).o"
  "$CLANGXX" "${FLAGS[@]}" -c "$source" -o "$object"
  OBJECTS+=("$object")
done

# A reactor module: no main(), the page calls the exported pg_* functions
"$CLANGXX" --target=wasm32-wasi --sysroot="$SYSROOT" -mexec-model=reactor \
  -Wl,--no-entry -Wl,--gc-sections -Wl,--strip-all \
  -Wl,-z,stack-size=1048576 -Wl,--initial-memory=8388608 \
  "${OBJECTS[@]}" -o "$WORK/engine.wasm"

mkdir -p "$(dirname "$OUT")"
cp "$WORK/engine.wasm" "$OUT"
echo "built $OUT ($(wc -c <"$OUT") bytes) from gpu_nn_framework @ $COMMIT"
