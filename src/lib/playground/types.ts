// Shared types for the neural network playground. See docs/playground.md.

export type ClassLabel = 0 | 1

// Datasets live in the square [-1, 1] x [-1, 1]
export type Point = { x: number; y: number; label: ClassLabel }

export type DatasetName = 'xor' | 'circles'

export type Activation = 'relu' | 'tanh' | 'sigmoid'

// Plain gradient descent, gradient descent with momentum (0.9), or Adam
export type Optimizer = 'sgd' | 'momentum' | 'adam'

export type NetworkConfig = {
  // Neurons in each hidden layer, e.g. [4, 4]
  hidden: number[]
  activation: Activation
  optimizer: Optimizer
  learningRate: number
  // Makes initial weights (and so training) repeatable
  seed: number
}

// What the UI needs from a network, whatever runs it. The TypeScript reference
// engine (step 2) and the C++ engine compiled to WebAssembly (step 6) both
// implement this, so the UI never depends on which one is behind it.
export interface NetworkEngine {
  initialize(config: NetworkConfig): void
  setDataset(points: Point[]): void
  // Change the learning rate without touching the weights
  setLearningRate(learningRate: number): void
  // One optimizer step over the dataset. Returns the loss.
  trainStep(): number
  // The weights and biases, as copies, in layer order: weight [out, in], bias [out],
  // weight, bias, ...
  getParameterValues(): Float32Array[]
  // The gradients from the latest step, in the same order (zeros before the first step)
  getGradientValues(): Float32Array[]
  // inputs is flattened [x0, y0, x1, y1, ...]. Returns the probability of
  // class 1 for each sample.
  predict(inputs: Float32Array): Float32Array
  // Back to freshly initialized weights, same config and seed
  reset(): void
}
