import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DATASETS } from './datasets'
import { gridInputs } from './grid'
import { WASM_ENGINE_LABEL, WasmEngine, compileEngine, wasmEngineNote } from './wasm-engine'
import type { NetworkConfig } from './types'

const bytes = readFileSync(new URL('../../../public/playground/engine.wasm', import.meta.url))
const wasmModule = new WebAssembly.Module(bytes)

const config: NetworkConfig = { hidden: [8], activation: 'tanh', optimizer: 'sgd', learningRate: 0.5, seed: 1 }
const points = DATASETS.xor.generate(200, 0.1, 1)

function ready(overrides: Partial<NetworkConfig> = {}) {
  const engine = new WasmEngine(wasmModule)
  engine.initialize({ ...config, ...overrides })
  engine.setDataset(points)
  return engine
}

// Reach the raw exported functions, to cause things the wrapper would never do
const raw = (engine: WasmEngine) => (engine as unknown as { exports: Record<string, (...args: number[]) => number> }).exports

describe('the module', () => {
  it('asks the page for nothing but a few trivial operating-system functions', () => {
    const imports = WebAssembly.Module.imports(wasmModule).map((item) => `${item.module}.${item.name}`)
    expect(imports.sort()).toEqual(
      [
        'environ_get',
        'environ_sizes_get',
        'fd_close',
        'fd_seek',
        'fd_write',
        'proc_exit',
      ].map((name) => `wasi_snapshot_preview1.${name}`)
    )
  })

  it('exports exactly the functions the wrapper calls', () => {
    const exports = WebAssembly.Module.exports(wasmModule).map((item) => item.name)
    expect(exports.sort()).toEqual(
      [
        '_initialize', 'memory', 'pg_alloc', 'pg_free', 'pg_get_grad', 'pg_get_param', 'pg_init',
        'pg_last_error', 'pg_param_count', 'pg_param_size', 'pg_predict', 'pg_reset',
        'pg_set_dataset', 'pg_set_learning_rate', 'pg_set_param', 'pg_train_step', 'pg_version',
      ].sort()
    )
  })

  it('records which commit of the C++ engine it was built from', () => {
    const version = new WasmEngine(wasmModule).version
    expect(version).toMatch(/^[0-9a-f]{7,40}$/)
    expect(wasmEngineNote(version)).toContain(version)
    expect(WASM_ENGINE_LABEL).toMatch(/C\+\+/)
  })

  it('can be compiled from bytes or from a download', async () => {
    const fromBytes = await compileEngine(bytes)
    expect(new WasmEngine(fromBytes).version).toBe(new WasmEngine(wasmModule).version)
    const fromResponse = await compileEngine(new Response(bytes, { headers: { 'content-type': 'application/wasm' } }))
    expect(new WasmEngine(fromResponse).version).toBe(new WasmEngine(wasmModule).version)
    // The wrong content type can't be streamed, but still works
    const plain = await compileEngine(new Response(bytes))
    expect(new WasmEngine(plain).version).toBe(new WasmEngine(wasmModule).version)
  })

  it('rejects bytes that are not a WebAssembly module', async () => {
    await expect(compileEngine(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow()
  })
})

describe('separate engines', () => {
  it('do not affect each other', () => {
    const a = ready()
    const b = ready()
    for (let i = 0; i < 30; i++) a.trainStep()
    expect(b.stepCount).toBe(0)
    expect(b.getParameterValues()).toEqual(ready().getParameterValues())
    expect(a.getParameterValues()).not.toEqual(b.getParameterValues())
  })

  it('initialize gives a clean slate', () => {
    const engine = ready()
    for (let i = 0; i < 30; i++) engine.trainStep()
    engine.initialize({ ...config, hidden: [3], seed: 2 })
    expect(engine.getParameterValues().map((p) => p.length)).toEqual([6, 3, 3, 1])
    // and the dataset has to be set again, since it is a new network
    expect(() => engine.trainStep()).toThrow(/setDataset/)
  })
})

describe('memory', () => {
  it('does not grow with repeated predictions', () => {
    const engine = ready({ hidden: [16, 16] })
    const grid = gridInputs(64)
    const memory = () => (engine as unknown as { exports: { memory: WebAssembly.Memory } }).exports.memory.buffer.byteLength
    for (let i = 0; i < 5; i++) engine.predict(grid)
    const settled = memory()
    for (let i = 0; i < 300; i++) engine.predict(grid)
    expect(memory()).toBe(settled)
  })

  it('does not grow with repeated training steps and parameter reads', () => {
    const engine = ready()
    const memory = () => (engine as unknown as { exports: { memory: WebAssembly.Memory } }).exports.memory.buffer.byteLength
    for (let i = 0; i < 20; i++) {
      engine.trainStep()
      engine.getParameterValues()
      engine.getGradientValues()
    }
    const settled = memory()
    for (let i = 0; i < 500; i++) {
      engine.trainStep()
      engine.getParameterValues()
      engine.getGradientValues()
    }
    expect(memory()).toBe(settled)
  })

  it('copes with the biggest network and grid the page can ask for', () => {
    const engine = ready({ hidden: [32, 32, 32, 32, 32, 32], activation: 'relu', optimizer: 'adam', learningRate: 0.01 })
    for (let i = 0; i < 5; i++) expect(Number.isFinite(engine.trainStep())).toBe(true)
    const out = engine.predict(gridInputs(80))
    expect(out).toHaveLength(6400)
    expect(Array.from(out).every((p) => p > 0 && p < 1)).toBe(true)
  })
})

describe('when something goes wrong inside the engine', () => {
  it('the checks in the C interface report a clear message instead of reaching the engine', () => {
    const engine = ready()
    const exports = raw(engine)
    // pg_init with a hidden layer of 0 neurons, straight to the module
    const pointer = exports.pg_alloc(4)
    new Int32Array((engine as any).exports.memory.buffer, pointer, 1)[0] = 0
    expect(exports.pg_init(pointer, 1, 0, 0, 0.1, 1)).toBe(1)
    const message = (engine as any).readString(exports.pg_last_error())
    expect(message).toMatch(/1 to 32 neurons/)
  })

  it('a trap becomes an ordinary error, the engine refuses to continue, and initialize recovers', () => {
    const engine = ready()
    // Ask the module for an impossible amount of memory, which stops it (a trap)
    const exports = raw(engine)
    expect(() => (engine as any).call(() => exports.pg_set_dataset(0, 0, 0x7ffffff0))).toThrow(Error)
    // Nothing more is trusted until it is started afresh
    expect(() => engine.trainStep()).toThrow(/stopped after an error/)
    expect(() => engine.predict(new Float32Array(2))).toThrow(/stopped after an error/)
    engine.initialize(config)
    engine.setDataset(points)
    expect(Number.isFinite(engine.trainStep())).toBe(true)
  })

  it('the error from a trap is not a raw WebAssembly error', () => {
    const engine = ready()
    const exports = raw(engine)
    let error: unknown
    try {
      ;(engine as any).call(() => exports.pg_set_dataset(0, 0, 0x7ffffff0))
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(WebAssembly.RuntimeError)
    expect((error as Error).message.length).toBeGreaterThan(5)
  })
})
