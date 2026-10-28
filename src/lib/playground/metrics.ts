// Numbers computed from a network's predictions

// Same clamp as the C++ engine and bceLoss in autograd.ts, so the test loss is
// comparable with the training loss
const EPSILON = Math.fround(1e-7)
const UPPER = Math.fround(1 - EPSILON)

// Mean binary cross-entropy of probabilities of class 1 against labels of 0 or 1
export function binaryCrossEntropy(predictions: ArrayLike<number>, labels: ArrayLike<number>): number {
  let total = 0
  for (let i = 0; i < labels.length; i++) {
    const p = Math.min(UPPER, Math.max(EPSILON, predictions[i]))
    total += labels[i] * Math.log(p) + (1 - labels[i]) * Math.log(Math.fround(1 - p))
  }
  return -total / labels.length
}

// Share of points where the more likely class matches the label
export function classificationAccuracy(predictions: ArrayLike<number>, labels: ArrayLike<number>): number {
  let correct = 0
  for (let i = 0; i < labels.length; i++) {
    if ((predictions[i] > 0.5 ? 1 : 0) === labels[i]) correct++
  }
  return correct / labels.length
}

// Length of all the values together, as one long vector
export function l2Norm(arrays: ArrayLike<number>[]): number {
  let total = 0
  for (const values of arrays) {
    for (let i = 0; i < values.length; i++) total += values[i] * values[i]
  }
  return Math.sqrt(total)
}
