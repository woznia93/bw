// Shared types for the neural network playground. See docs/playground.md.

export type ClassLabel = 0 | 1

// Datasets live in the square [-1, 1] x [-1, 1]
export type Point = { x: number; y: number; label: ClassLabel }

export type DatasetName = 'xor' | 'circles'

export type Activation = 'relu' | 'tanh'

export type NetworkConfig = {
  // Neurons in each hidden layer, e.g. [4, 4]
  hidden: number[]
  activation: Activation
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
  // One optimizer step over the dataset. Returns the loss.
  trainStep(): number
  // inputs is flattened [x0, y0, x1, y1, ...]. Returns the probability of
  // class 1 for each sample.
  predict(inputs: Float32Array): Float32Array
  // Back to freshly initialized weights, same config and seed
  reset(): void
}
