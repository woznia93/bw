// Force-included before every source file when building the engine for WebAssembly
// (see build.sh). Do not include it by hand.
//
// The WebAssembly C++ library has no exceptions, and the engine's source throws
// std::runtime_error, std::invalid_argument and std::out_of_range in 91 places (and
// catches nothing). Rather than edit the engine, `throw X(message);` is turned into
// "remember the message, then trap". A trap ends the WebAssembly call immediately, and
// the page reports the remembered message. That only happens when the engine is used
// wrongly (a shape mismatch, say), which the C interface in playground_adapter.cpp
// checks for before calling it.

// Every standard header the engine includes comes first, so that the macro below can't
// touch the library's own code
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <new>
#include <numeric>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

namespace nn_wasm {

// Defined in playground_adapter.cpp
void record_error(const char* message);

struct Thrower {
  template <class E>
  [[noreturn]] void operator<<(const E& error) const {
    record_error(error.what());
    __builtin_trap();
  }
};

}  // namespace nn_wasm

// `throw std::runtime_error("x");` becomes `::nn_wasm::Thrower() << std::runtime_error("x");`
#define throw ::nn_wasm::Thrower() <<
