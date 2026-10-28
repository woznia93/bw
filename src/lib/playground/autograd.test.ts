import { describe, expect, it } from 'vitest'
import {
  Tensor,
  add,
  backward,
  bceLoss,
  linear,
  mul,
  noGrad,
  relu,
  sigmoid,
  sum,
  tanh,
  zeroGrad,
} from './autograd'

const leaf = (shape: number[], values: number[]) =>
  new Tensor(shape, new Float32Array(values), true)

// Checks backward() against finite differences: nudge each value up and down,
// see how much the loss moves, and compare with the gradient backward() computed.
// Float32 limits how small the nudge can be, so the tolerance is loose-ish.
function checkGradients(build: () => Tensor, leaves: Tensor[]) {
  const loss = build()
  zeroGrad(leaves)
  backward(loss)
  const analytic = leaves.map((tensor) => Array.from(tensor.grad ?? new Float32Array(tensor.size)))

  const eps = 1e-2
  leaves.forEach((tensor, t) => {
    for (let i = 0; i < tensor.size; i++) {
      const original = tensor.data[i]
      tensor.data[i] = original + eps
      const up = noGrad(build).data[0]
      tensor.data[i] = original - eps
      const down = noGrad(build).data[0]
      tensor.data[i] = original
      const numeric = (up - down) / (2 * eps)
      expect(
        Math.abs(analytic[t][i] - numeric),
        `leaf ${t}[${i}]: backward() gave ${analytic[t][i]}, finite difference ${numeric}`
      ).toBeLessThanOrEqual(2e-3 + 2e-3 * Math.abs(numeric))
    }
  })
}

// Turn any tensor into a scalar that depends on every element differently
const weightedSum = (t: Tensor) =>
  sum(mul(t, new Tensor(t.shape, Float32Array.from({ length: t.size }, (_, i) => 0.3 + 0.7 * i))))

describe('forward values', () => {
  it('linear computes x Wᵀ + b', () => {
    const x = new Tensor([2, 2], new Float32Array([1, 2, 3, 4]))
    const w = new Tensor([3, 2], new Float32Array([1, 0, 0, 1, 1, 1]))
    const b = new Tensor([3], new Float32Array([0.5, 0, -1]))
    expect(Array.from(linear(x, w, b).data)).toEqual([1.5, 2, 2, 3.5, 4, 6])
  })

  it('activations', () => {
    const x = new Tensor([4], new Float32Array([-2, -0.5, 0, 1.5]))
    expect(Array.from(relu(x).data)).toEqual([0, 0, 0, 1.5])
    expect(tanh(x).data[3]).toBeCloseTo(Math.tanh(1.5), 6)
    expect(sigmoid(x).data[2]).toBeCloseTo(0.5, 7)
    expect(sigmoid(x).data[0]).toBeCloseTo(1 / (1 + Math.exp(2)), 6)
  })

  it('bceLoss matches the formula', () => {
    const p = new Tensor([2], new Float32Array([0.9, 0.2]))
    const t = new Tensor([2], new Float32Array([1, 0]))
    expect(bceLoss(p, t).data[0]).toBeCloseTo(-(Math.log(0.9) + Math.log(0.8)) / 2, 6)
  })

  it('bceLoss stays finite when a prediction is exactly 0 or 1', () => {
    const p = leaf([2], [0, 1])
    const loss = bceLoss(p, new Tensor([2], new Float32Array([1, 0])))
    expect(Number.isFinite(loss.data[0])).toBe(true)
    // Predictions are clamped to [1e-7, 1 - 1e-7] in float32, like the C++ engine,
    // and 1 - 1e-7 rounds to 0.99999988 there
    const lower = Math.fround(1e-7)
    const upper = Math.fround(1 - lower)
    expect(loss.data[0]).toBeCloseTo((-Math.log(lower) - Math.log(1 - upper)) / 2, 3)
    backward(loss)
    expect(Array.from(p.grad!).every(Number.isFinite)).toBe(true)
  })
})

describe('gradients match finite differences', () => {
  it('linear, for inputs, weights and bias', () => {
    const x = leaf([3, 2], [0.5, -1, 0.3, 0.8, -0.6, 0.2])
    const w = leaf([2, 2], [0.7, -0.4, 0.1, 0.9])
    const b = leaf([2], [0.2, -0.3])
    checkGradients(() => weightedSum(linear(x, w, b)), [x, w, b])
  })

  it.each([
    ['relu', relu, [-1.2, -0.4, 0.3, 0.9, 1.7]],
    ['tanh', tanh, [-1.2, -0.4, 0.3, 0.9, 1.7]],
    ['sigmoid', sigmoid, [-1.2, -0.4, 0.3, 0.9, 1.7]],
  ] as const)('%s', (_, activation, values) => {
    const x = leaf([5], [...values])
    checkGradients(() => weightedSum(activation(x)), [x])
  })

  it('add and mul', () => {
    const a = leaf([4], [0.5, -0.2, 1.1, 0.7])
    const b = leaf([4], [-0.8, 0.4, 0.3, 1.2])
    checkGradients(() => weightedSum(add(mul(a, b), a)), [a, b])
  })

  it('binary cross-entropy', () => {
    const logits = leaf([4], [-1.1, 0.4, 0.9, -0.3])
    const targets = new Tensor([4], new Float32Array([1, 0, 1, 0]))
    checkGradients(() => bceLoss(sigmoid(logits), targets), [logits])
  })

  it.each(['relu', 'tanh'] as const)('a whole network with %s', (name) => {
    const activate = name === 'relu' ? relu : tanh
    const x = new Tensor([4, 2], new Float32Array([0.5, 0.6, -0.4, -0.7, 0.8, -0.3, -0.6, 0.5]))
    const targets = new Tensor([4, 1], new Float32Array([1, 1, 0, 0]))
    const w1 = leaf([3, 2], [0.6, -0.5, 0.3, 0.8, -0.7, 0.4])
    const b1 = leaf([3], [0.1, -0.2, 0.3])
    const w2 = leaf([1, 3], [0.5, -0.9, 0.7])
    const b2 = leaf([1], [0.05])
    checkGradients(
      () => bceLoss(sigmoid(linear(activate(linear(x, w1, b1)), w2, b2)), targets),
      [w1, b1, w2, b2]
    )
  })
})

describe('gradient accumulation', () => {
  it('adds up the paths when a tensor is used more than once', () => {
    // loss = sum(a*a + a*c): d/da = 2a + c, d/dc = a
    const a = leaf([3], [1, -2, 0.5])
    const c = leaf([3], [4, 5, -6])
    backward(sum(add(mul(a, a), mul(a, c))))
    expect(Array.from(a.grad!)).toEqual([6, 1, -5])
    expect(Array.from(c.grad!)).toEqual([1, -2, 0.5])
  })

  it('handles a diamond: one tensor feeding two branches that rejoin', () => {
    const x = leaf([2], [0.4, -0.7])
    const h = tanh(x)
    backward(sum(mul(h, h)))
    // d/dx of tanh(x)^2 = 2 tanh(x) (1 - tanh(x)^2)
    for (let i = 0; i < 2; i++) {
      const t = Math.tanh(x.data[i])
      expect(x.grad![i]).toBeCloseTo(2 * t * (1 - t * t), 6)
    }
  })

  it('zeroGrad clears gradients so steps do not leak into each other', () => {
    const w = leaf([2], [1, 2])
    backward(sum(mul(w, w)))
    expect(Array.from(w.grad!)).toEqual([2, 4])
    zeroGrad([w])
    backward(sum(mul(w, w)))
    expect(Array.from(w.grad!)).toEqual([2, 4])
  })
})

describe('graph recording', () => {
  it('records how each tensor was made', () => {
    const x = leaf([2], [1, 2])
    const y = relu(x)
    expect(y.op).toBe('relu')
    expect(y.parents).toEqual([x])
  })

  it('noGrad builds no graph', () => {
    const x = leaf([2], [1, 2])
    const y = noGrad(() => relu(x))
    expect(y.requiresGrad).toBe(false)
    expect(y.parents).toEqual([])
    expect(() => backward(sum(y))).toThrow(/requires gradients/)
  })

  it('noGrad restores recording afterwards, even after an error', () => {
    const x = leaf([2], [1, 2])
    expect(() =>
      noGrad(() => {
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(relu(x).requiresGrad).toBe(true)
  })

  it('rejects bad shapes and non-scalar losses', () => {
    expect(() => add(leaf([2], [1, 2]), leaf([3], [1, 2, 3]))).toThrow(/shape mismatch/)
    expect(() => linear(leaf([2, 3], [1, 2, 3, 4, 5, 6]), leaf([2, 2], [1, 2, 3, 4]))).toThrow(
      /cannot multiply/
    )
    expect(() => backward(relu(leaf([2], [1, 2])))).toThrow(/single value/)
    expect(() => new Tensor([2, 2], new Float32Array(3))).toThrow(/needs 4 values/)
  })
})
