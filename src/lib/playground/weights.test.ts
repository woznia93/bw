import { describe, expect, it } from 'vitest'
import { ReferenceEngine } from './engine'
import {
  EDGE_BUCKETS,
  bucketStyle,
  edgeBucket,
  edgeStyle,
  layerSizes,
  layerSummaries,
  maxAbs,
  parametersMatch,
  strongestEdges,
} from './weights'

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

describe('edge groups', () => {
  it('puts the biggest weight in the last group and tiny ones in the first', () => {
    expect(edgeBucket(2, 2).bucket).toBe(EDGE_BUCKETS - 1)
    expect(edgeBucket(-2, 2).bucket).toBe(EDGE_BUCKETS - 1)
    expect(edgeBucket(0.001, 2).bucket).toBe(0)
    expect(edgeBucket(0, 2).bucket).toBe(0)
  })

  it('groups never run past the ends, whatever the weight', () => {
    for (const w of [0, 1e-9, 0.5, 1, 1.0000001, 100]) {
      const { bucket } = edgeBucket(w, 1)
      expect(bucket).toBeGreaterThanOrEqual(0)
      expect(bucket).toBeLessThan(EDGE_BUCKETS)
    }
  })

  it('bigger weights go in later groups, and the sign is kept', () => {
    let previous = -1
    for (const w of [0.05, 0.2, 0.4, 0.6, 0.8, 1]) {
      const { bucket, positive } = edgeBucket(w, 1)
      expect(bucket).toBeGreaterThanOrEqual(previous)
      expect(positive).toBe(true)
      previous = bucket
    }
    expect(edgeBucket(-0.5, 1).positive).toBe(false)
  })

  it('a group is drawn at about the thickness of the weights in it', () => {
    // Every weight lands in a group whose style is close to its own style
    for (let w = 0; w <= 1; w += 0.013) {
      const own = edgeStyle(w, 1)
      const grouped = bucketStyle(edgeBucket(w, 1).bucket)
      expect(Math.abs(grouped.width - own.width)).toBeLessThan(3.2 / EDGE_BUCKETS + 1e-9)
      expect(Math.abs(grouped.alpha - own.alpha)).toBeLessThan(0.78 / EDGE_BUCKETS + 1e-9)
    }
  })

  it('later groups are thicker and more opaque', () => {
    for (let b = 1; b < EDGE_BUCKETS; b++) {
      expect(bucketStyle(b).width).toBeGreaterThan(bucketStyle(b - 1).width)
      expect(bucketStyle(b).alpha).toBeGreaterThan(bucketStyle(b - 1).alpha)
    }
  })

  it('copes with a network whose weights are all zero', () => {
    expect(edgeBucket(0, 0).bucket).toBe(0)
  })
})

describe('strongestEdges', () => {
  it('keeps everything when there are few enough', () => {
    expect(strongestEdges([0.1, 0.9, 0.5], 5)).toEqual([0, 1, 2])
    expect(strongestEdges([0.1, 0.9, 0.5], 3)).toEqual([0, 1, 2])
    expect(strongestEdges([], 3)).toEqual([])
  })

  it('keeps the strongest when there are too many, in their original order', () => {
    expect(strongestEdges([0.1, 0.9, 0.5, 0.7, 0.2], 3)).toEqual([1, 2, 3])
  })

  it('returns exactly the requested number, even with ties, and the same ones every time', () => {
    const ties = new Array(100).fill(0.5)
    const first = strongestEdges(ties, 10)
    expect(first).toHaveLength(10)
    expect(strongestEdges(ties, 10)).toEqual(first)
    expect(first).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('every kept connection is at least as strong as every dropped one', () => {
    const strengths = Array.from({ length: 5000 }, (_, i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1)
    const kept = new Set(strongestEdges(strengths, 1200))
    expect(kept.size).toBe(1200)
    const weakestKept = Math.min(...Array.from(kept).map((i) => strengths[i]))
    const strongestDropped = Math.max(...strengths.filter((_, i) => !kept.has(i)))
    expect(weakestKept).toBeGreaterThanOrEqual(strongestDropped)
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
