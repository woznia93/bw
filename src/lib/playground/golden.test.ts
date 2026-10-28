import { describe, expect, it } from 'vitest'
import golden from './__fixtures__/golden.json'
import { ReferenceEngine } from './engine'
import type { Activation, Optimizer, Point } from './types'

// The fixture was produced by the real C++ engine (see cpp/golden/README.md).
// These tests run the TypeScript engine from the same starting weights on the
// same data and check that every number agrees: the first gradients, the loss
// at each step, and the weights and predictions at the end.

const points: Point[] = golden.data.map(([x, y, label]) => ({ x, y, label: label as 0 | 1 }))
const probe = new Float32Array(golden.probe.flat())

// float32 arithmetic in a different order gives slightly different last digits,
// so compare with a small tolerance rather than exactly
function expectClose(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  label: string,
  absolute = 1e-5
) {
  expect(actual.length, `${label} length`).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    const tolerance = absolute + 1e-4 * Math.abs(expected[i])
    expect(
      Math.abs(actual[i] - expected[i]),
      `${label}[${i}]: got ${actual[i]}, C++ engine gave ${expected[i]}`
    ).toBeLessThanOrEqual(tolerance)
  }
}

describe.each(golden.cases)('matches the C++ engine: $name', (testCase) => {
  const start = () => {
    const engine = new ReferenceEngine()
    engine.initialize({
      hidden: testCase.hidden,
      activation: testCase.activation as Activation,
      optimizer: testCase.optimizer as Optimizer,
      learningRate: testCase.learningRate,
      seed: 0,
    })
    engine.setDataset(points)
    engine.setParameterValues(testCase.initialParams)
    return engine
  }

  it('predicts the same before training', () => {
    expectClose(start().predict(probe), testCase.initialPredictions, 'initial predictions')
  })

  it('computes the same gradients on the first step', () => {
    const engine = start()
    engine.trainStep()
    testCase.firstGrads.forEach((expected, i) => {
      expectClose(engine.getGradientValues()[i], expected, `gradient of parameter ${i}`)
    })
  })

  it('follows the same loss curve, weights and predictions over the whole run', () => {
    const engine = start()
    const losses = Array.from({ length: testCase.steps }, () => engine.trainStep())
    expectClose(losses, testCase.losses, 'loss')
    // Adam divides each update by the size of that weight's own gradient, so float32
    // rounding noise in a very small gradient shows up as a larger difference in the
    // weight (measured: up to 4e-5, on first-layer weights of the sigmoid network with
    // gradients 10-50x below typical). The losses and predictions, which is what the
    // network actually does, still match to a few 1e-7, and they stay strict.
    const weightTolerance = testCase.optimizer === 'adam' ? 2e-4 : 1e-5
    testCase.finalParams.forEach((expected, i) => {
      expectClose(engine.getParameterValues()[i], expected, `final parameter ${i}`, weightTolerance)
    })
    expectClose(engine.predict(probe), testCase.finalPredictions, 'final predictions')
  })
})
