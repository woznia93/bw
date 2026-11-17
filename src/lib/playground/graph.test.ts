import { describe, expect, it } from 'vitest'
import { ReferenceEngine } from './engine'
import { buildTrace, layoutGraph, normalizeOp, summarize } from './graph'
import { inspectWithTs } from './inspect-ts'

const trace = (request: Parameters<typeof inspectWithTs>[0]) => buildTrace(inspectWithTs(request))
const byLabel = (t: ReturnType<typeof trace>, label: string) => t.nodes.find((n) => n.label === label)!

describe('worked example: a = ReLU(w x + b)', () => {
  const t = trace({ kind: 'worked', x: 2, w: 3, b: -1 })

  it('forward: wx = 6, z = 5, a = 5', () => {
    expect(byLabel(t, 'wx').value.values).toEqual([6])
    expect(byLabel(t, 'z').value.values).toEqual([5])
    expect(byLabel(t, 'a').value.values).toEqual([5])
  })

  it('backward: da/dw = 2, da/dx = 3, da/db = 1', () => {
    expect(byLabel(t, 'w').finalGrad!.values).toEqual([2])
    expect(byLabel(t, 'x').finalGrad!.values).toEqual([3])
    expect(byLabel(t, 'b').finalGrad!.values).toEqual([1])
  })

  it('goes from the output back, one node at a time', () => {
    expect(t.steps.map((s) => t.nodes[s.node].label)).toEqual(['a', 'z', 'wx'])
    expect(t.steps[0].upstream.values).toEqual([1])
    expect(t.steps[1].contributions.map((c) => [t.nodes[c.parent].label, c.delta.values])).toEqual([
      ['wx', [1]],
      ['b', [1]],
    ])
  })

  it('a negative z blocks the gradient', () => {
    const blocked = trace({ kind: 'worked', x: 1, w: 1, b: -3 })
    expect(byLabel(blocked, 'a').value.values).toEqual([0])
    expect(byLabel(blocked, 'w').finalGrad!.values).toEqual([0])
    expect(byLabel(blocked, 'b').finalGrad!.values).toEqual([0])
  })
})

describe('gradient accumulation', () => {
  it('f = x*x + x gives 2x + 1 as three contributions to x', () => {
    const t = trace({ kind: 'reuse', x: 3 })
    expect(byLabel(t, 'x').finalGrad!.values).toEqual([7])
    const mulStep = t.steps.find((s) => t.nodes[s.node].label === 'y')!
    expect(mulStep.contributions).toHaveLength(1)
    expect(mulStep.contributions[0].uses).toBe(2)
    expect(mulStep.contributions[0].delta.values).toEqual([6])
  })
})

describe('broadcasting', () => {
  it('b gets the gradient summed over the rows it was copied into', () => {
    const t = trace({ kind: 'broadcast' })
    expect(byLabel(t, 'b').finalGrad!.values).toEqual([3, 3])
    expect(byLabel(t, 'X').finalGrad).toBeNull()
  })
})

describe('network graph', () => {
  it('ends with the gradients trainStep computes for the same point', () => {
    const config = { hidden: [3, 2], activation: 'tanh' as const, optimizer: 'sgd' as const, learningRate: 0.1, seed: 7 }
    const engine = new ReferenceEngine()
    engine.initialize(config)
    engine.setDataset([{ x: 0.4, y: -0.6, label: 1 }])
    const raw = engine.inspect({ kind: 'network', x: 0.4, y: -0.6, label: 1 })
    engine.trainStep()
    const expected = engine.getGradientValues()
    const last = raw.steps[raw.steps.length - 1].grads
    // The gradients are computed before the optimizer step, so lr doesn't matter
    ;['W1', 'b1', 'W2', 'b2', 'W3', 'b3'].forEach((name, i) => {
      const node = raw.nodes.findIndex((n) => n.label === name)
      expect(Array.from(last[node]!)).toEqual(Array.from(expected[i]))
    })
  })

  it('does not change the network being trained', () => {
    const engine = new ReferenceEngine()
    engine.initialize({ hidden: [3], activation: 'relu', optimizer: 'sgd', learningRate: 0.1, seed: 1 })
    engine.setDataset([{ x: 0, y: 0, label: 0 }])
    const before = engine.getParameterValues().map((p) => Array.from(p))
    engine.inspect({ kind: 'network', x: 0.1, y: 0.2, label: 1 })
    expect(engine.getParameterValues().map((p) => Array.from(p))).toEqual(before)
  })
})

describe('helpers', () => {
  it('normalizes engine op names', () => {
    expect(normalizeOp('MulBackward')).toBe('mul')
    expect(normalizeOp('mul')).toBe('mul')
    expect(normalizeOp('ReLUBackward')).toBe('relu')
    expect(normalizeOp('LinearBackward')).toBe('linear')
    expect(normalizeOp('leaf')).toBe('leaf')
    expect(normalizeOp('Whatever')).toBe('other')
  })

  it('summarizes small tensors in full and big ones by statistics', () => {
    expect(summarize([1, -3], [2]).values).toEqual([1, -3])
    const big = summarize(new Float32Array(100).fill(2), [10, 10])
    expect(big.values).toBeNull()
    expect(big.stats).toMatchObject({ count: 100, mean: 2, min: 2, max: 2, norm: 20 })
  })

  it('lays out columns left to right without overlaps', () => {
    const t = trace({ kind: 'worked', x: 2, w: 3, b: -1 })
    const layout = layoutGraph(t)
    t.nodes.forEach((node) => node.parents.forEach((p) => expect(layout.column[p]).toBeLessThan(layout.column[node.id])))
    const keys = new Set(layout.positions.map((p) => `${p.x},${p.y}`))
    expect(keys.size).toBe(t.nodes.length)
  })
})
