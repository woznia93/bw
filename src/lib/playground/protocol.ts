import type { NetworkConfig, Point } from './types'

// One point on the loss curve
export type LossSample = { step: number; loss: number }

// Messages between the page and the training Web Worker

export type Speed = 'slow' | 'normal' | 'fast' | 'max'

export const SPEEDS: Record<Speed, { label: string; stepsPerSecond: number }> = {
  slow: { label: 'Slow', stepsPerSecond: 20 },
  normal: { label: 'Normal', stepsPerSecond: 100 },
  fast: { label: 'Fast', stepsPerSecond: 600 },
  max: { label: 'Max', stepsPerSecond: Infinity },
}

export type TrainerCommand =
  // Build a fresh network for this configuration and dataset (training starts over, paused)
  | { type: 'configure'; config: NetworkConfig; points: Point[] }
  | { type: 'setLearningRate'; learningRate: number }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'start' }
  | { type: 'pause' }
  // One training step
  | { type: 'step' }
  // Back to the starting weights
  | { type: 'reset' }

export type TrainerStatus = 'paused' | 'running'

export type TrainerEvent =
  // The worker has loaded and is waiting for a configuration
  | { type: 'ready'; engine: { label: string; note: string } }
  // Where training is now. loss is null until the first step.
  | {
      type: 'snapshot'
      status: TrainerStatus
      step: number
      loss: number | null
      // Changes whenever training starts over (a new network, or Reset), so the
      // page knows to clear the loss curve
      run: number
      // Fraction of the training points the network classifies correctly, 0 to 1
      accuracy: number | null
      // Loss at the steps since the previous snapshot (thinned if there were many)
      losses: LossSample[]
      // The network's probability of class 1 across the plot, GRID_SIZE x GRID_SIZE,
      // row by row from the top. Null when it hasn't been recomputed since the last
      // snapshot, because it's the expensive part.
      grid: Float32Array | null
    }
  // Something the visitor should know about; training is paused if it was running
  | { type: 'error'; message: string }
