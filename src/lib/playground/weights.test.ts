import { describe, expect, it } from 'vitest'
import { ReferenceEngine } from './engine'
import { edgeStyle, layerSizes, layerSummaries, maxAbs, parametersMatch } from './weights'

const engineFor = (hidden: number[]) => {
  const engine = new ReferenceEngine()
  engine.initialize({ hidden, activation: 'tanh', optimizer: 'sgd', learningRate: 0.1, seed: 3 })
  return engine
}

describe('layerSizes', () => {
  it('adds the two inputs and the one output around the hidden layers', () => {
    expect(layerSizes([])).toEqual([2, 1])
    expect(layerSizes([8, 4])).toEqual([2, 8, 4, 1])
  })
})

describe('parametersMatch', () => {
  it('accepts what the engine produces for the same architecture', () => {
    for (const hidden of [[], [8], [8, 4], [3, 3, 3, 3, 3, 3]]) {
      expect(parametersMatch(hidden, engineFor(hidden).getParameterValues())).toBe(true)
    }
  })

  it('rejects arrays from a different architecture', () => {
    const parameters = engineFor([8]).getParameterValues()
    expect(parametersMatch([4], parameters)).toBe(false)
    expect(parametersMatch([8, 8], parameters)).toBe(false)
    expect(parametersMatch([], parameters)).toBe(false)
    expect(parametersMatch([8], parameters.slice(0, 3))).toBe(false)
  })
})

describe('edgeStyle', () => {
  it('is thickest and most opaque for the largest weight, and thinner for smaller ones', () => {
    const big = edgeStyle(2, 2)
    const small = edgeStyle(0.5, 2)
    expect(big.width).toBeGreaterThan(small.width)
    expect(big.alpha).toBeGreaterThan(small.alpha)
    expect(big.alpha).toBeLessThanOrEqual(1)
  })

  it('treats positive and negative the same size but marks the sign', () => {
    expect(edgeStyle(-1, 2).width).toBe(edgeStyle(1, 2).width)
    expect(edgeStyle(1, 2).positive).toBe(true)
    expect(edgeStyle(-1, 2).positive).toBe(false)
  })

  it('copes with a network whose weights are all zero', () => {
    expect(edgeStyle(0, 0).width).toBeGreaterThan(0)
    expect(Number.isFinite(edgeStyle(0, 0).alpha)).toBe(true)
  })
})

describe('layerSummaries', () => {
  it('summarizes each layer of a real network', () => {
    const engine = engineFor([4])
    const summaries = layerSummaries([4], engine.getParameterValues(), [0.5, 0.25])!
    expect(summaries.map((s) => s.name)).toEqual(['Hidden 1', 'Output'])
    expect(summaries.map((s) => [s.inputs, s.outputs, s.weightCount])).toEqual([[2, 4, 8], [4, 1, 4]])
    expect(summaries.map((s) => s.gradientNorm)).toEqual([0.5, 0.25])

    const weights = engine.getParameterValues()[0]
    expect(summaries[0].meanAbsWeight).toBeCloseTo(Array.from(weights).reduce((t, w) => t + Math.abs(w), 0) / 8, 6)
    expect(summaries[0].maxAbsWeight).toBe(Math.max(...Array.from(weights).map(Math.abs)))
  })

  it('has no gradient norms before the first step', () => {
    const summaries = layerSummaries([4], engineFor([4]).getParameterValues(), null)!
    expect(summaries.every((s) => s.gradientNorm === null)).toBe(true)
  })

  it('is null when the arrays do not match the architecture', () => {
    expect(layerSummaries([5], engineFor([4]).getParameterValues(), null)).toBeNull()
  })

  it('maxAbs finds the biggest magnitude across arrays', () => {
    expect(maxAbs([[1, -3], new Float32Array([2])])).toBe(3)
    expect(maxAbs([])).toBe(0)
  })
})
