import { validate } from './engine'
import type { NetworkConfig, NetworkEngine, Point } from './types'
import { createWasiImports } from './wasi'

// The C++ engine (woznia93/gpu_nn_framework), compiled to WebAssembly (see cpp/wasm), behind
// the same interface as the TypeScript reference engine. It talks to the module through the
// plain C functions in cpp/wasm/playground_adapter.cpp: numbers in, numbers out.

type Exports = {
  memory: WebAssembly.Memory
  _initialize(): void
  pg_version(): number
  pg_last_error(): number
  pg_alloc(bytes: number): number
  pg_free(pointer: number): void
  pg_init(hidden: number, count: number, activation: number, optimizer: number, learningRate: number, seed: number): number
  pg_set_dataset(inputs: number, targets: number, count: number): number
  pg_train_step(): number
  pg_predict(inputs: number, count: number, output: number): number
  pg_reset(): number
  pg_set_learning_rate(learningRate: number): number
  pg_param_count(): number
  pg_param_size(index: number): number
  pg_get_param(index: number, output: number): number
  pg_set_param(index: number, values: number): number
  pg_get_grad(index: number, output: number): number
}

// What the UI says about this engine
export const WASM_ENGINE_LABEL = 'C++ engine (WebAssembly)'
export const wasmEngineNote = (version: string) =>
  `My C++ autograd engine, gpu_nn_framework (commit ${version}), compiled to WebAssembly and running on the CPU in your browser.`

// The numbers the adapter uses for the choices in NetworkConfig
const ACTIVATIONS = { relu: 0, tanh: 1, sigmoid: 2 }
const OPTIMIZERS = { sgd: 0, momentum: 1, adam: 2 }

// Download and compile the module once. The result can make any number of engines.
export async function compileEngine(source: Response | BufferSource): Promise<WebAssembly.Module> {
  if (typeof Response !== 'undefined' && source instanceof Response) {
    // Compiling while the bytes arrive is quicker, but needs the right content type
    if (typeof WebAssembly.compileStreaming === 'function' && source.headers.get('content-type') === 'application/wasm') {
      return WebAssembly.compileStreaming(source)
    }
    return WebAssembly.compile(await source.arrayBuffer())
  }
  return WebAssembly.compile(source as BufferSource)
}

export class WasmEngine implements NetworkEngine {
  // The commit of gpu_nn_framework the module was built from
  version = ''

  private exports!: Exports
  private config: NetworkConfig | null = null
  private hasDataset = false
  private steps = 0
  // After an error stops the module partway through a call, it isn't trusted again until
  // initialize() starts a fresh copy
  private stopped = false

  constructor(private module: WebAssembly.Module) {
    this.start()
  }

  get stepCount() {
    return this.steps
  }

  initialize(config: NetworkConfig) {
    validate(config)
    // A fresh copy of the module each time: a clean slate, and the way out of a stopped one
    this.start()
    this.config = { ...config, hidden: config.hidden.slice() }
    this.hasDataset = false
    this.steps = 0
    this.withInts(config.hidden, (pointer) =>
      this.check(
        this.exports.pg_init(
          pointer,
          config.hidden.length,
          ACTIVATIONS[config.activation],
          OPTIMIZERS[config.optimizer],
          config.learningRate,
          config.seed >>> 0
        )
      )
    )
  }

  setDataset(points: Point[]) {
    this.requireInitialized()
    if (points.length === 0) throw new Error('the dataset has no points')
    const inputs = new Float32Array(points.length * 2)
    const targets = new Float32Array(points.length)
    points.forEach((point, i) => {
      inputs[2 * i] = point.x
      inputs[2 * i + 1] = point.y
      targets[i] = point.label
    })
    this.withFloats(inputs, (inputsPointer) =>
      this.withFloats(targets, (targetsPointer) =>
        this.check(this.exports.pg_set_dataset(inputsPointer, targetsPointer, points.length))
      )
    )
    this.hasDataset = true
  }

  setLearningRate(learningRate: number) {
    this.requireInitialized()
    validate({ ...this.config!, learningRate })
    this.check(this.call(() => this.exports.pg_set_learning_rate(learningRate)))
    this.config!.learningRate = learningRate
  }

  trainStep(): number {
    this.requireInitialized()
    if (!this.hasDataset) throw new Error('call setDataset() first')
    const loss = this.call(() => this.exports.pg_train_step())
    this.steps++
    return loss
  }

  predict(inputs: Float32Array): Float32Array {
    this.requireInitialized()
    if (inputs.length % 2 !== 0) throw new Error('inputs must be flattened [x0, y0, x1, y1, ...]')
    const count = inputs.length / 2
    if (count === 0) return new Float32Array(0)
    return this.withFloats(inputs, (inputsPointer) =>
      this.withBuffer(count, (outputPointer) => {
        this.check(this.exports.pg_predict(inputsPointer, count, outputPointer))
        return this.read(outputPointer, count)
      })
    )
  }

  reset() {
    this.requireInitialized()
    this.check(this.call(() => this.exports.pg_reset()))
    this.steps = 0
  }

  // Weights and biases in layer order: weight, bias, weight, bias, ...
  getParameterValues(): Float32Array[] {
    return this.readAll((index, pointer) => this.exports.pg_get_param(index, pointer))
  }

  // Gradients from the latest step, in the same order (zeros before the first step)
  getGradientValues(): Float32Array[] {
    return this.readAll((index, pointer) => this.exports.pg_get_grad(index, pointer))
  }

  // For tests and for loading saved networks
  setParameterValues(values: ArrayLike<number>[]) {
    this.requireInitialized()
    const count = this.call(() => this.exports.pg_param_count())
    if (values.length !== count) throw new Error(`expected ${count} parameter arrays, got ${values.length}`)
    for (let i = 0; i < count; i++) {
      const size = this.call(() => this.exports.pg_param_size(i))
      if (values[i].length !== size) throw new Error(`parameter ${i} needs ${size} values, got ${values[i].length}`)
    }
    values.forEach((array, i) => {
      this.withFloats(Float32Array.from(array), (pointer) => this.check(this.exports.pg_set_param(i, pointer)))
    })
  }

  private start() {
    const instance = new WebAssembly.Instance(
      this.module,
      createWasiImports(() => (instance.exports as unknown as Exports).memory)
    )
    this.exports = instance.exports as unknown as Exports
    this.exports._initialize()
    this.version = this.readString(this.exports.pg_version())
    this.stopped = false
  }

  private requireInitialized() {
    if (!this.config) throw new Error('call initialize() first')
    if (this.stopped) {
      throw new Error('The C++ engine stopped after an error. Change a setting to start it again.')
    }
  }

  // Run something in the module. If it traps (the engine hit an error and trapped, see
  // cpp/wasm/no_throw.h) turn that into an ordinary error with the engine's message.
  private call<T>(run: () => T): T {
    try {
      return run()
    } catch (error) {
      if (error instanceof WebAssembly.RuntimeError) {
        this.stopped = true
        throw new Error(this.readString(this.exports.pg_last_error()) || 'The C++ engine stopped unexpectedly')
      }
      throw error
    }
  }

  // The functions that can fail return 0 for success, otherwise pg_last_error says why
  private check(code: number) {
    if (code !== 0) throw new Error(this.readString(this.exports.pg_last_error()) || 'The C++ engine reported an error')
  }

  private readString(pointer: number) {
    const bytes = new Uint8Array(this.exports.memory.buffer, pointer)
    let end = 0
    while (bytes[end] !== 0) end++
    return new TextDecoder().decode(bytes.subarray(0, end))
  }

  // Memory is only reachable through addresses, so data going in or out is copied into
  // space the module allocates. The views are made after the call because the module
  // growing its memory replaces the underlying buffer.
  private withBuffer<T>(floats: number, use: (pointer: number) => T): T {
    const pointer = this.call(() => this.exports.pg_alloc(floats * 4))
    try {
      return this.call(() => use(pointer))
    } finally {
      if (!this.stopped) this.exports.pg_free(pointer)
    }
  }

  private withFloats<T>(values: Float32Array, use: (pointer: number) => T): T {
    return this.withBuffer(values.length, (pointer) => {
      new Float32Array(this.exports.memory.buffer, pointer, values.length).set(values)
      return use(pointer)
    })
  }

  private withInts<T>(values: number[], use: (pointer: number) => T): T {
    const pointer = this.call(() => this.exports.pg_alloc(Math.max(values.length, 1) * 4))
    try {
      new Int32Array(this.exports.memory.buffer, pointer, values.length).set(values)
      return this.call(() => use(pointer))
    } finally {
      if (!this.stopped) this.exports.pg_free(pointer)
    }
  }

  private read(pointer: number, count: number) {
    return new Float32Array(this.exports.memory.buffer, pointer, count).slice()
  }

  private readAll(fetch: (index: number, pointer: number) => number): Float32Array[] {
    this.requireInitialized()
    const count = this.call(() => this.exports.pg_param_count())
    const result: Float32Array[] = []
    for (let i = 0; i < count; i++) {
      const size = this.call(() => this.exports.pg_param_size(i))
      result.push(
        this.withBuffer(size, (pointer) => {
          this.check(fetch(i, pointer))
          return this.read(pointer, size)
        })
      )
    }
    return result
  }
}
