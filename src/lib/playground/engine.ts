import {
  Tensor,
  backward,
  bceLoss,
  linear,
  noGrad,
  relu,
  sigmoid,
  tanh,
  zeroGrad,
} from './autograd'
import { createRandom } from './datasets'
import type { NetworkConfig, NetworkEngine, Point } from './types'

// What the UI says about this engine, so nobody mistakes it for the C++ build
// (which replaces it in step 6 of the plan in docs/playground.md)
export const REFERENCE_ENGINE_LABEL = 'TypeScript reference engine'
export const REFERENCE_ENGINE_NOTE =
  'A TypeScript stand-in that follows the C++ autograd engine and is tested against its numbers. The C++ build running in the browser comes later.'

// The same settings as the C++ engine's SGD (momentum) and Adam
export const MOMENTUM = 0.9
export const ADAM = { beta1: 0.9, beta2: 0.999, epsilon: 1e-8 }

export const MAX_HIDDEN_LAYERS = 6
export const MAX_NEURONS = 32

function validate(config: NetworkConfig) {
  if (!Array.isArray(config.hidden) || config.hidden.length > MAX_HIDDEN_LAYERS) {
    throw new Error(`hidden must list at most ${MAX_HIDDEN_LAYERS} layers`)
  }
  config.hidden.forEach((width) => {
    if (!Number.isInteger(width) || width < 1 || width > MAX_NEURONS) {
      throw new Error(`each hidden layer needs 1 to ${MAX_NEURONS} neurons, got ${width}`)
    }
  })
  if (!['relu', 'tanh', 'sigmoid'].includes(config.activation)) {
    throw new Error(`unknown activation "${config.activation}"`)
  }
  if (!['sgd', 'momentum', 'adam'].includes(config.optimizer)) {
    throw new Error(`unknown optimizer "${config.optimizer}"`)
  }
  if (!Number.isFinite(config.learningRate) || config.learningRate <= 0) {
    throw new Error(`learning rate must be a positive number, got ${config.learningRate}`)
  }
  if (!Number.isFinite(config.seed)) {
    throw new Error(`seed must be a number, got ${config.seed}`)
  }
}

// A small network: Linear -> activation for each hidden layer, then Linear to
// one output and a sigmoid, trained with binary cross-entropy on the whole
// dataset each step, using SGD, SGD with momentum or Adam. It follows the C++ engine's design (same layers,
// loss and initialization scheme) and is tested against it, but it's a
// TypeScript stand-in: it is not the C++ code running in the browser.
export class ReferenceEngine implements NetworkEngine {
  private config: NetworkConfig | null = null
  // weight [out, in] and bias [out] for each Linear layer, in order
  private weights: Tensor[] = []
  private biases: Tensor[] = []
  private inputs: Tensor | null = null
  private targets: Tensor | null = null
  private steps = 0
  // Optimizer state, one array per parameter: momentum's velocity, or Adam's two moments
  private velocity: Float32Array[] = []
  private moment1: Float32Array[] = []
  private moment2: Float32Array[] = []

  get stepCount() {
    return this.steps
  }

  initialize(config: NetworkConfig) {
    validate(config)
    this.config = { ...config, hidden: config.hidden.slice() }
    this.build()
  }

  setDataset(points: Point[]) {
    if (points.length === 0) throw new Error('the dataset has no points')
    const inputs = new Float32Array(points.length * 2)
    const targets = new Float32Array(points.length)
    points.forEach((point, i) => {
      inputs[2 * i] = point.x
      inputs[2 * i + 1] = point.y
      targets[i] = point.label
    })
    this.inputs = new Tensor([points.length, 2], inputs)
    this.targets = new Tensor([points.length, 1], targets)
  }

  setLearningRate(learningRate: number) {
    if (!this.config) throw new Error('call initialize() first')
    validate({ ...this.config, learningRate })
    this.config.learningRate = learningRate
  }

  trainStep(): number {
    const { inputs, targets } = this
    if (!this.config) throw new Error('call initialize() first')
    if (!inputs || !targets) throw new Error('call setDataset() first')

    const params = this.parameters()
    zeroGrad(params)
    const loss = bceLoss(this.forward(inputs), targets)
    backward(loss)

    this.applyOptimizer(params)
    this.steps++
    return loss.data[0]
  }

  private applyOptimizer(params: Tensor[]) {
    const { learningRate: lr, optimizer } = this.config!

    if (optimizer === 'sgd') {
      // p <- p - lr * grad
      params.forEach((param) => {
        const grad = param.grad
        if (!grad) return
        for (let i = 0; i < param.size; i++) param.data[i] -= lr * grad[i]
      })
    } else if (optimizer === 'momentum') {
      // v <- mu * v + grad;  p <- p - lr * v
      params.forEach((param, k) => {
        const grad = param.grad
        if (!grad) return
        const v = this.velocity[k]
        for (let i = 0; i < param.size; i++) {
          v[i] = MOMENTUM * v[i] + grad[i]
          param.data[i] -= lr * v[i]
        }
      })
    } else {
      // Adam, with bias-corrected moments:
      //   m <- b1 m + (1 - b1) g;  v <- b2 v + (1 - b2) g^2;  p <- p - lr m^ / (sqrt(v^) + eps)
      const { beta1, beta2, epsilon } = ADAM
      const t = this.steps + 1
      const correction1 = 1 - Math.pow(beta1, t)
      const correction2 = 1 - Math.pow(beta2, t)
      params.forEach((param, k) => {
        const grad = param.grad
        if (!grad) return
        const m = this.moment1[k]
        const v = this.moment2[k]
        for (let i = 0; i < param.size; i++) {
          m[i] = beta1 * m[i] + (1 - beta1) * grad[i]
          v[i] = beta2 * v[i] + (1 - beta2) * grad[i] * grad[i]
          param.data[i] -= (lr * (m[i] / correction1)) / (Math.sqrt(v[i] / correction2) + epsilon)
        }
      })
    }
  }

  predict(inputs: Float32Array): Float32Array {
    if (!this.config) throw new Error('call initialize() first')
    if (inputs.length % 2 !== 0) {
      throw new Error('inputs must be flattened [x0, y0, x1, y1, ...]')
    }
    if (inputs.length === 0) return new Float32Array(0)
    const output = noGrad(() => this.forward(new Tensor([inputs.length / 2, 2], inputs)))
    return output.data.slice()
  }

  reset() {
    if (!this.config) throw new Error('call initialize() first')
    this.build()
  }

  // Weights and biases in layer order: weight, bias, weight, bias, ...
  parameters(): Tensor[] {
    return this.weights.flatMap((weight, i) => [weight, this.biases[i]])
  }

  getParameterValues(): Float32Array[] {
    return this.parameters().map((param) => param.data.slice())
  }

  // For tests and for loading saved networks
  setParameterValues(values: ArrayLike<number>[]) {
    const params = this.parameters()
    if (values.length !== params.length) {
      throw new Error(`expected ${params.length} parameter arrays, got ${values.length}`)
    }
    params.forEach((param, i) => {
      if (values[i].length !== param.size) {
        throw new Error(`parameter ${i} needs ${param.size} values, got ${values[i].length}`)
      }
    })
    params.forEach((param, i) => param.data.set(values[i]))
  }

  // Gradients from the most recent trainStep, in the same order as parameters()
  getGradientValues(): Float32Array[] {
    return this.parameters().map((param) => (param.grad ?? new Float32Array(param.size)).slice())
  }

  private build() {
    const { hidden, seed } = this.config!
    const random = createRandom(seed)
    this.weights = []
    this.biases = []
    let inFeatures = 2
    ;[...hidden, 1].forEach((outFeatures) => {
      // Same scheme as the C++ Linear layer (PyTorch's default): weights and
      // biases are uniform in +-1/sqrt(fan_in)
      const bound = 1 / Math.sqrt(inFeatures)
      const draw = () => (2 * random() - 1) * bound
      const weight = new Tensor([outFeatures, inFeatures], undefined, true)
      for (let i = 0; i < weight.size; i++) weight.data[i] = draw()
      const bias = new Tensor([outFeatures], undefined, true)
      for (let i = 0; i < bias.size; i++) bias.data[i] = draw()
      this.weights.push(weight)
      this.biases.push(bias)
      inFeatures = outFeatures
    })
    this.steps = 0
    const sizes = this.parameters().map((param) => param.size)
    this.velocity = sizes.map((size) => new Float32Array(size))
    this.moment1 = sizes.map((size) => new Float32Array(size))
    this.moment2 = sizes.map((size) => new Float32Array(size))
  }

  private forward(x: Tensor): Tensor {
    const activation = this.config!.activation
    const activate = activation === 'relu' ? relu : activation === 'tanh' ? tanh : sigmoid
    let h = x
    const last = this.weights.length - 1
    this.weights.forEach((weight, i) => {
      h = linear(h, weight, this.biases[i])
      h = i === last ? sigmoid(h) : activate(h)
    })
    return h
  }
}
