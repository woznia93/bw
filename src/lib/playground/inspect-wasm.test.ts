import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ReferenceEngine } from './engine'
import { buildTrace, type InspectRequest } from './graph'
import { WasmEngine } from './wasm-engine'

// The same graphs and backward passes, built by the C++ engine (in WebAssembly) and by the
// TypeScript one. Same nodes, same order, same numbers.
const wasmModule = new WebAssembly.Module(readFileSync('public/playground/engine.wasm'))

const config = { hidden: [3, 2], activation: 'tanh' as const, optimizer: 'sgd' as const, learningRate: 0.1, seed: 5 }
const point = { x: 0.4, y: -0.6, label: 1 as const }

function engines() {
  const wasm = new WasmEngine(wasmModule)
  const ts = new ReferenceEngine()
  for (const engine of [wasm, ts]) {
    engine.initialize(config)
    engine.setDataset([point])
  }
  // The two engines draw different random weights, so give the TypeScript one the C++ ones
  ts.setParameterValues(wasm.getParameterValues())
  return { wasm, ts }
}

const requests: [string, InspectRequest][] = [
  ['worked', { kind: 'worked', x: 2, w: 3, b: -1 }],
  ['worked, blocked by ReLU', { kind: 'worked', x: 1, w: 1, b: -3 }],
  ['reuse', { kind: 'reuse', x: 3 }],
  ['broadcast', { kind: 'broadcast' }],
  ['network', { kind: 'network', ...point }],
]

describe('C++ engine vs TypeScript engine graphs', () => {
  it.each(requests)('%s', (_, request) => {
    const { wasm, ts } = engines()
    const a = wasm.inspect(request)
    const b = ts.inspect(request)

    expect(a.nodes.map((n) => n.label)).toEqual(b.nodes.map((n) => n.label))
    expect(a.nodes.map((n) => n.shape)).toEqual(b.nodes.map((n) => n.shape))
    expect(a.nodes.map((n) => n.parents)).toEqual(b.nodes.map((n) => n.parents))
    expect(a.nodes.map((n) => n.requiresGrad)).toEqual(b.nodes.map((n) => n.requiresGrad))
    expect(a.root).toBe(b.root)
    // Both name the operation in their own words, but they mean the same one
    expect(buildTrace(a).nodes.map((n) => n.op)).toEqual(buildTrace(b).nodes.map((n) => n.op))
    expect(a.steps.map((s) => s.node)).toEqual(b.steps.map((s) => s.node))

    const close = (x: Float32Array | null, y: Float32Array | null, where: string) => {
      expect(x === null, where).toBe(y === null)
      if (x && y) {
        expect(x.length, where).toBe(y.length)
        x.forEach((v, i) => expect(Math.abs(v - y[i]), `${where}[${i}]: ${v} vs ${y[i]}`).toBeLessThan(1e-5 + 1e-5 * Math.abs(v)))
      }
    }
    a.nodes.forEach((n, i) => close(n.value, b.nodes[i].value, `value of ${n.label}`))
    a.initial.forEach((g, i) => close(g, b.initial[i], `initial gradient of ${a.nodes[i].label}`))
    a.steps.forEach((s, k) =>
      s.grads.forEach((g, i) => close(g, b.steps[k].grads[i], `gradient of ${a.nodes[i].label} after step ${k}`))
    )
  })

  it('the network graph ends with the gradients the C++ engine trains with', () => {
    const { wasm } = engines()
    const raw = wasm.inspect({ kind: 'network', ...point })
    wasm.trainStep()
    const expected = wasm.getGradientValues()
    const last = raw.steps[raw.steps.length - 1].grads
    ;['W1', 'b1', 'W2', 'b2', 'W3', 'b3'].forEach((name, i) => {
      const node = raw.nodes.findIndex((n) => n.label === name)
      expect(Array.from(last[node]!)).toEqual(Array.from(expected[i]))
    })
  })

  it("leaves the C++ network's parameters alone", () => {
    const { wasm } = engines()
    const before = wasm.getParameterValues().map((p) => Array.from(p))
    wasm.inspect({ kind: 'network', x: 0.1, y: 0.2, label: 0 })
    expect(wasm.getParameterValues().map((p) => Array.from(p))).toEqual(before)
  })

  it('rebuilding replaces the previous graph', () => {
    const { wasm } = engines()
    const first = wasm.inspect({ kind: 'reuse', x: 3 })
    const second = wasm.inspect({ kind: 'worked', x: 2, w: 3, b: -1 })
    expect(first.nodes.map((n) => n.label)).toEqual(['x', 'y', 'f'])
    expect(second.nodes.map((n) => n.label)).toEqual(['w', 'x', 'wx', 'b', 'z', 'a'])
  })
})
