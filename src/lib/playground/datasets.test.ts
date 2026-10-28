import { describe, expect, it } from 'vitest'
import { DATASETS, DATASET_NAMES, createRandom, generateCircles, generateXor } from './datasets'

describe('createRandom', () => {
  it('repeats for the same seed and differs for another', () => {
    const a = createRandom(7)
    const b = createRandom(7)
    const c = createRandom(8)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
  })

  it('stays within [0, 1)', () => {
    const random = createRandom(1)
    for (let i = 0; i < 10000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('datasets', () => {
  it.each(DATASET_NAMES)('%s is repeatable for a seed and changes with it', (name) => {
    const { generate } = DATASETS[name]
    expect(generate(100, 0.1, 3)).toEqual(generate(100, 0.1, 3))
    expect(generate(100, 0.1, 3)).not.toEqual(generate(100, 0.1, 4))
  })

  it.each(DATASET_NAMES)('%s returns the requested count inside [-1, 1]', (name) => {
    const points = DATASETS[name].generate(250, 0.5, 11)
    expect(points).toHaveLength(250)
    points.forEach((point) => {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(point.y)).toBeLessThanOrEqual(1)
      expect([0, 1]).toContain(point.label)
    })
  })

  it.each(DATASET_NAMES)('%s has both classes in roughly equal numbers', (name) => {
    const points = DATASETS[name].generate(400, 0.1, 5)
    const ones = points.filter((point) => point.label === 1).length
    expect(ones).toBeGreaterThan(160)
    expect(ones).toBeLessThan(240)
  })

  it('XOR labels follow the sign rule exactly when there is no noise', () => {
    generateXor(300, 0, 2).forEach((point) => {
      expect(point.label).toBe(point.x * point.y > 0 ? 1 : 0)
      expect(Math.abs(point.x)).toBeGreaterThanOrEqual(0.1)
      expect(Math.abs(point.y)).toBeGreaterThanOrEqual(0.1)
    })
  })

  it('circles are separated by radius when there is no noise', () => {
    generateCircles(300, 0, 2).forEach((point) => {
      const radius = Math.hypot(point.x, point.y)
      if (point.label === 1) expect(radius).toBeLessThanOrEqual(0.4 + 1e-9)
      else expect(radius).toBeGreaterThanOrEqual(0.65 - 1e-9)
    })
  })

  it('noise moves points off the clean positions', () => {
    const clean = generateXor(50, 0, 9)
    const noisy = generateXor(50, 0.3, 9)
    expect(noisy).not.toEqual(clean)
  })
})
