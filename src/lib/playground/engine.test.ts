import { describe, expect, it } from 'vitest'
import { DATASETS } from './datasets'
import { MAX_HIDDEN_LAYERS, MAX_NEURONS, ReferenceEngine } from './engine'
import type { NetworkConfig, Point } from './types'

const base: NetworkConfig = { hidden: [8], activation: 'tanh', optimizer: 'sgd', learningRate: 0.5, seed: 1 }

function setup(config: Partial<NetworkConfig> = {}, points = DATASETS.xor.generate(200, 0.1, 1)) {
  const engine = new ReferenceEngine()
  engine.initialize({ ...base, ...config })
  engine.setDataset(points)
  return { engine, points }
}

const flatten = (points: Point[]) => Float32Array.from(points.flatMap((p) => [p.x, p.y]))

function accuracy(engine: ReferenceEngine, points: Point[]) {
  const predictions = engine.predict(flatten(points))
  return points.filter((p, i) => (predictions[i] > 0.5 ? 1 : 0) === p.label).length / points.length
}

function train(engine: ReferenceEngine, steps: number) {
  const losses: number[] = []
  for (let i = 0; i < steps; i++) losses.push(engine.trainStep())
  return losses
}

describe('learning', () => {
  it.each([
    ['xor', { hidden: [8], activation: 'tanh', learningRate: 0.5 }],
    ['xor', { hidden: [8, 8], activation: 'relu', learningRate: 0.2 }],
    ['circles', { hidden: [8], activation: 'tanh', learningRate: 0.5 }],
    ['circles', { hidden: [8, 8], activation: 'relu', learningRate: 0.2 }],
  ] as const)('learns %s with %j', (dataset, config) => {
    const points = DATASETS[dataset].generate(200, 0.1, 1)
    const { engine } = setup({ ...config, hidden: [...config.hidden] }, points)
    const before = accuracy(engine, points)
    const losses = train(engine, 800)
    expect(losses[losses.length - 1]).toBeLessThan(0.15)
    expect(losses[losses.length - 1]).toBeLessThan(losses[0] / 4)
    expect(accuracy(engine, points)).toBeGreaterThan(0.95)
    expect(before).toBeLessThan(0.9)
  })

  it.each([
    ['sgd', 0.5],
    ['momentum', 0.1],
    ['adam', 0.05],
  ] as const)('learns XOR with the %s optimizer', (optimizer, learningRate) => {
    const { engine, points } = setup({ optimizer, learningRate })
    const losses = train(engine, 800)
    expect(losses[losses.length - 1]).toBeLessThan(0.1)
    expect(accuracy(engine, points)).toBeGreaterThan(0.95)
  })

  it('learns with sigmoid hidden layers too', () => {
    const points = DATASETS.circles.generate(200, 0.1, 1)
    const { engine } = setup({ activation: 'sigmoid', optimizer: 'adam', learningRate: 0.05 }, points)
    train(engine, 800)
    expect(accuracy(engine, points)).toBeGreaterThan(0.95)
  })

  it('the optimizers take different paths from the same start', () => {
    const runs = (['sgd', 'momentum', 'adam'] as const).map((optimizer) => {
      const { engine } = setup({ optimizer, learningRate: 0.1 })
      return train(engine, 20)
    })
    expect(runs[0]).not.toEqual(runs[1])
    expect(runs[1]).not.toEqual(runs[2])
    expect(runs[0]).not.toEqual(runs[2])
    // but they all begin at the same loss, since the weights are the same
    expect(runs[0][0]).toBe(runs[1][0])
    expect(runs[1][0]).toBe(runs[2][0])
  })

  it.each(['momentum', 'adam'] as const)(
    'reset also clears the %s optimizer state, so a rerun is identical',
    (optimizer) => {
      const { engine } = setup({ optimizer, learningRate: 0.05 })
      const firstRun = train(engine, 40)
      engine.reset()
      expect(train(engine, 40)).toEqual(firstRun)
    }
  )

  it('cannot learn XOR without a hidden layer, because no straight line separates it', () => {
    const { engine, points } = setup({ hidden: [] })
    train(engine, 800)
    expect(accuracy(engine, points)).toBeLessThan(0.7)
  })

  it('loss goes down over the first steps', () => {
    const { engine } = setup()
    const losses = train(engine, 50)
    expect(losses[49]).toBeLessThan(losses[0])
  })

  it('counts steps', () => {
    const { engine } = setup()
    expect(engine.stepCount).toBe(0)
    train(engine, 7)
    expect(engine.stepCount).toBe(7)
  })
})

describe('predict', () => {
  it('returns one probability in (0, 1) per point', () => {
    const { engine, points } = setup()
    const out = engine.predict(flatten(points))
    expect(out).toBeInstanceOf(Float32Array)
    expect(out).toHaveLength(points.length)
    out.forEach((p) => {
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
    })
  })

  it('does not change the network or leave a graph behind', () => {
    const { engine, points } = setup()
    const before = engine.getParameterValues()
    const first = engine.predict(flatten(points))
    expect(engine.predict(flatten(points))).toEqual(first)
    expect(engine.getParameterValues()).toEqual(before)
    expect(engine.parameters().every((p) => p.grad === null)).toBe(true)
  })

  it('handles a large grid in one call, and an empty one', () => {
    const { engine } = setup()
    const grid = new Float32Array(2 * 80 * 80).map((_, i) => ((i * 7919) % 200) / 100 - 1)
    expect(engine.predict(grid)).toHaveLength(6400)
    expect(engine.predict(new Float32Array(0))).toHaveLength(0)
  })

  it('rejects input that is not x, y pairs', () => {
    const { engine } = setup()
    expect(() => engine.predict(new Float32Array(3))).toThrow(/flattened/)
  })
})

describe('seeds, reset and repeatability', () => {
  it('the same seed gives the same network and the same training run', () => {
    const a = setup()
    const b = setup()
    expect(a.engine.getParameterValues()).toEqual(b.engine.getParameterValues())
    expect(train(a.engine, 30)).toEqual(train(b.engine, 30))
  })

  it('a different seed gives a different network', () => {
    const a = setup({ seed: 1 })
    const b = setup({ seed: 2 })
    expect(a.engine.getParameterValues()).not.toEqual(b.engine.getParameterValues())
  })

  it('reset returns to the starting weights, so a rerun is identical', () => {
    const { engine, points } = setup()
    const start = engine.getParameterValues()
    const firstRun = train(engine, 40)
    expect(engine.getParameterValues()).not.toEqual(start)

    engine.reset()
    expect(engine.stepCount).toBe(0)
    expect(engine.getParameterValues()).toEqual(start)
    expect(train(engine, 40)).toEqual(firstRun)
    expect(accuracy(engine, points)).toBeGreaterThan(0)
  })

  it('reset keeps the dataset', () => {
    const { engine } = setup()
    engine.reset()
    expect(() => engine.trainStep()).not.toThrow()
  })

  it('weights start within +-1/sqrt(fan_in), like the C++ Linear layer', () => {
    const { engine } = setup({ hidden: [8, 4] })
    const [w1, b1, w2, b2, w3, b3] = engine.parameters()
    const fanIn = [2, 2, 8, 8, 4, 4]
    ;[w1, b1, w2, b2, w3, b3].forEach((param, i) => {
      const bound = 1 / Math.sqrt(fanIn[i])
      param.data.forEach((value) => expect(Math.abs(value)).toBeLessThanOrEqual(bound))
    })
    expect([w1.shape, b1.shape, w2.shape, b2.shape, w3.shape, b3.shape]).toEqual([
      [8, 2], [8], [4, 8], [4], [1, 4], [1],
    ])
  })

  it('initialize starts over with a new configuration', () => {
    const { engine } = setup()
    train(engine, 5)
    engine.initialize({ ...base, hidden: [3, 3], seed: 9 })
    expect(engine.stepCount).toBe(0)
    expect(engine.parameters()).toHaveLength(6)
  })
})

describe('parameters and gradients', () => {
  it('getParameterValues and getGradientValues return copies in layer order', () => {
    const { engine } = setup({ hidden: [4] })
    engine.trainStep()
    const parameters = engine.getParameterValues()
    const gradients = engine.getGradientValues()
    // weight [4, 2], bias [4], weight [1, 4], bias [1]
    expect(parameters.map((p) => p.length)).toEqual([8, 4, 4, 1])
    expect(gradients.map((g) => g.length)).toEqual([8, 4, 4, 1])
    parameters[0][0] = 99
    expect(engine.getParameterValues()[0][0]).not.toBe(99)
  })

  it('gradients are zero before the first step', () => {
    const { engine } = setup()
    expect(engine.getGradientValues().every((g) => g.every((v) => v === 0))).toBe(true)
  })

  it('can be read and written as plain arrays', () => {
    const { engine, points } = setup()
    const saved = engine.getParameterValues()
    train(engine, 50)
    engine.setParameterValues(saved)
    expect(engine.getParameterValues()).toEqual(saved)
    expect(accuracy(engine, points)).toBeLessThan(0.9)
  })

  it('rejects the wrong number or size of arrays', () => {
    const { engine } = setup()
    expect(() => engine.setParameterValues([[1]])).toThrow(/expected 4 parameter arrays/)
    const values = engine.getParameterValues().map((v) => Array.from(v))
    values[0].pop()
    expect(() => engine.setParameterValues(values)).toThrow(/parameter 0 needs/)
  })

  it('exposes the gradients of the last step', () => {
    const { engine } = setup()
    engine.trainStep()
    const grads = engine.getGradientValues()
    expect(grads).toHaveLength(4)
    expect(grads.some((g) => g.some((v) => v !== 0))).toBe(true)
  })
})

describe('errors', () => {
  it('needs initialize() and a dataset before training', () => {
    const engine = new ReferenceEngine()
    expect(() => engine.trainStep()).toThrow(/initialize/)
    expect(() => engine.predict(new Float32Array(2))).toThrow(/initialize/)
    expect(() => engine.reset()).toThrow(/initialize/)
    engine.initialize(base)
    expect(() => engine.trainStep()).toThrow(/setDataset/)
    expect(() => engine.setDataset([])).toThrow(/no points/)
  })

  it.each([
    [{ learningRate: 0 }, /learning rate/],
    [{ learningRate: -1 }, /learning rate/],
    [{ learningRate: NaN }, /learning rate/],
    [{ hidden: [0] }, /neurons/],
    [{ hidden: [2.5] }, /neurons/],
    [{ hidden: [MAX_NEURONS + 1] }, /neurons/],
    [{ hidden: new Array(MAX_HIDDEN_LAYERS + 1).fill(2) }, /at most/],
    [{ activation: 'softmax' as never }, /activation/],
    [{ optimizer: 'rmsprop' as never }, /optimizer/],
    [{ seed: Infinity }, /seed/],
  ])('rejects the configuration %j', (change, message) => {
    expect(() => new ReferenceEngine().initialize({ ...base, ...change })).toThrow(message)
  })

  it('does not change if the caller edits the config afterwards', () => {
    const config = { ...base, hidden: [4] }
    const engine = new ReferenceEngine()
    engine.initialize(config)
    config.hidden.push(99)
    engine.reset()
    expect(engine.parameters()).toHaveLength(4)
  })

  it('an absurd learning rate breaks learning without throwing or producing NaN', () => {
    const { engine } = setup({ learningRate: 1e6, hidden: [8], activation: 'relu' })
    const losses = train(engine, 20)
    // The loss is clamped like the C++ engine's, so it stays a number, but it
    // ends far worse than it started and the network is stuck
    expect(losses.every((loss) => Number.isFinite(loss))).toBe(true)
    expect(losses[19]).toBeGreaterThan(losses[0] * 3)
    expect(losses[19]).toBeCloseTo(losses[18], 6)
  })
})
