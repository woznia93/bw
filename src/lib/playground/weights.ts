// Helpers for showing a network's weights: how big each layer is, how to style a
// connection, and a per-layer summary

// Neurons in each column of the diagram: two inputs (x and y), the hidden layers,
// and one output
export const layerSizes = (hidden: number[]) => [2, ...hidden, 1]

// Do the arrays from the network match the layout the page is showing? They won't
// for a moment after the visitor changes the architecture, until the new network reports.
export function parametersMatch(hidden: number[], parameters: Float32Array[]): boolean {
  const sizes = layerSizes(hidden)
  if (parameters.length !== 2 * (sizes.length - 1)) return false
  for (let layer = 0; layer < sizes.length - 1; layer++) {
    if (parameters[2 * layer].length !== sizes[layer] * sizes[layer + 1]) return false
    if (parameters[2 * layer + 1].length !== sizes[layer + 1]) return false
  }
  return true
}

export function maxAbs(arrays: ArrayLike<number>[]): number {
  let largest = 0
  for (const values of arrays) {
    for (let i = 0; i < values.length; i++) largest = Math.max(largest, Math.abs(values[i]))
  }
  return largest
}

// How to draw a connection of weight w, relative to the biggest weight in the network:
// thicker and more opaque when larger. Positive and negative weights differ by
// color and by dashing.
export function edgeStyle(weight: number, largest: number) {
  const strength = largest > 0 ? Math.min(1, Math.abs(weight) / largest) : 0
  return {
    positive: weight >= 0,
    width: 0.4 + 3.2 * strength,
    alpha: 0.12 + 0.78 * strength,
  }
}

// Connections are drawn in groups of similar thickness, so that the drawing style only
// has to be set once per group
export const EDGE_BUCKETS = 8

// Which group a connection of weight w belongs to, relative to the biggest weight
export function edgeBucket(weight: number, largest: number, buckets = EDGE_BUCKETS) {
  const strength = largest > 0 ? Math.min(1, Math.abs(weight) / largest) : 0
  return { positive: weight >= 0, bucket: Math.min(buckets - 1, Math.floor(strength * buckets)) }
}

// How to draw every connection in a group: the style of the group's middle strength
export function bucketStyle(bucket: number, buckets = EDGE_BUCKETS) {
  return edgeStyle((bucket + 0.5) / buckets, 1)
}

// A big network has thousands of connections, which is both slow to draw and an
// unreadable tangle. This picks which to draw: all of them if there are few, otherwise
// the `max` strongest. Returns their positions in `strengths`, in their original order.
export function strongestEdges(strengths: ArrayLike<number>, max: number): number[] {
  const count = strengths.length
  const all = Array.from({ length: count }, (_, i) => i)
  if (count <= max) return all
  // The strongest `max`; ties are broken by position so the choice is stable
  all.sort((a, b) => strengths[b] - strengths[a] || a - b)
  return all.slice(0, max).sort((a, b) => a - b)
}

export type LayerSummary = {
  name: string
  inputs: number
  outputs: number
  weightCount: number
  meanAbsWeight: number
  maxAbsWeight: number
  gradientNorm: number | null
}

export function layerSummaries(
  hidden: number[],
  parameters: Float32Array[],
  gradientNorms: number[] | null
): LayerSummary[] | null {
  if (!parametersMatch(hidden, parameters)) return null
  const sizes = layerSizes(hidden)
  const layers = sizes.length - 1
  return Array.from({ length: layers }, (_, layer) => {
    const weights = parameters[2 * layer]
    let sum = 0
    for (let i = 0; i < weights.length; i++) sum += Math.abs(weights[i])
    return {
      name: layer === layers - 1 ? 'Output' : `Hidden ${layer + 1}`,
      inputs: sizes[layer],
      outputs: sizes[layer + 1],
      weightCount: weights.length,
      meanAbsWeight: sum / weights.length,
      maxAbsWeight: maxAbs([weights]),
      gradientNorm: gradientNorms ? gradientNorms[layer] : null,
    }
  })
}
