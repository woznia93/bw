import { describe, expect, it } from 'vitest'
import { Tensor, bceLoss } from './autograd'
import { binaryCrossEntropy, classificationAccuracy, l2Norm } from './metrics'

describe('binaryCrossEntropy', () => {
  it('matches the formula', () => {
    expect(binaryCrossEntropy([0.9, 0.2], [1, 0])).toBeCloseTo(-(Math.log(0.9) + Math.log(0.8)) / 2, 6)
  })

  it('gives exactly what the training loss gives, so test and training loss are comparable', () => {
    const predictions = Float32Array.from({ length: 50 }, (_, i) => ((i * 37) % 100) / 100)
    const labels = Float32Array.from({ length: 50 }, (_, i) => (i * 7) % 2)
    const training = bceLoss(new Tensor([50], predictions), new Tensor([50], labels)).data[0]
    expect(binaryCrossEntropy(predictions, labels)).toBeCloseTo(training, 6)
  })

  it('stays finite for predictions of exactly 0 and 1', () => {
    expect(Number.isFinite(binaryCrossEntropy([0, 1], [1, 0]))).toBe(true)
  })

  it('is lower for better predictions', () => {
    expect(binaryCrossEntropy([0.95, 0.05], [1, 0])).toBeLessThan(binaryCrossEntropy([0.6, 0.4], [1, 0]))
  })
})

describe('classificationAccuracy', () => {
  it('counts the points on the right side of 0.5', () => {
    expect(classificationAccuracy([0.9, 0.1, 0.6, 0.4], [1, 0, 0, 1])).toBe(0.5)
    expect(classificationAccuracy([0.9, 0.1], [1, 0])).toBe(1)
    expect(classificationAccuracy([0.1, 0.9], [1, 0])).toBe(0)
  })

  it('treats exactly 0.5 as class 0', () => {
    expect(classificationAccuracy([0.5], [0])).toBe(1)
  })
})

describe('l2Norm', () => {
  it('is the length of all the values together', () => {
    expect(l2Norm([[3], [4]])).toBe(5)
    expect(l2Norm([new Float32Array([1, 2, 2])])).toBe(3)
    expect(l2Norm([])).toBe(0)
  })
})
