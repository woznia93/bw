import type { DatasetName, Point } from './types'

// Small seeded random number generator (mulberry32), so a seed always gives
// the same dataset
export function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(random: () => number) {
  // Box-Muller transform, 1 - random() keeps the log away from zero
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
}

const clamp = (value: number) => Math.min(1, Math.max(-1, value))

// Class 1 where x and y have the same sign. A small gap around each axis keeps
// the classes separable when there's no noise.
export function generateXor(count: number, noise: number, seed: number): Point[] {
  const random = createRandom(seed)
  const points: Point[] = []
  for (let i = 0; i < count; i++) {
    const x = (random() < 0.5 ? -1 : 1) * (0.1 + 0.9 * random())
    const y = (random() < 0.5 ? -1 : 1) * (0.1 + 0.9 * random())
    points.push({
      x: clamp(x + noise * gaussian(random)),
      y: clamp(y + noise * gaussian(random)),
      label: x * y > 0 ? 1 : 0,
    })
  }
  return points
}

// Class 1 is a disk in the middle, class 0 is a ring around it
export function generateCircles(count: number, noise: number, seed: number): Point[] {
  const random = createRandom(seed)
  const points: Point[] = []
  for (let i = 0; i < count; i++) {
    const inner = i % 2 === 0
    const radius = inner ? 0.4 * Math.sqrt(random()) : 0.65 + 0.3 * random()
    const angle = 2 * Math.PI * random()
    points.push({
      x: clamp(radius * Math.cos(angle) + noise * gaussian(random)),
      y: clamp(radius * Math.sin(angle) + noise * gaussian(random)),
      label: inner ? 1 : 0,
    })
  }
  return points
}

export type DatasetSpec = {
  label: string
  description: string
  generate: (count: number, noise: number, seed: number) => Point[]
}

export const DATASETS: Record<DatasetName, DatasetSpec> = {
  xor: {
    label: 'XOR',
    description: 'Opposite corners share a class. No straight line separates them.',
    generate: generateXor,
  },
  circles: {
    label: 'Circles',
    description: 'A disk surrounded by a ring.',
    generate: generateCircles,
  },
}

export const DATASET_NAMES = Object.keys(DATASETS) as DatasetName[]
