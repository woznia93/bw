// A computation graph and the run of its backward pass, in a form that doesn't depend on
// which engine built it. Either engine (the C++ one in WebAssembly, or the TypeScript
// one) produces a RawGraph; buildTrace turns it into what the page shows.

// What to build a graph of. The first three are small fixed examples; the last runs the
// current network on one data point.
export type InspectRequest =
  // a = ReLU(w * x + b)
  | { kind: 'worked'; x: number; w: number; b: number }
  // f = x * x + x: the same value used three times
  | { kind: 'reuse'; x: number }
  // loss = sum(X + b) where b is added to every row of X
  | { kind: 'broadcast' }
  // the network's forward pass and binary cross-entropy loss for one point
  | { kind: 'network'; x: number; y: number; label: 0 | 1 }

export const DEFAULT_WORKED = { x: 2, w: 3, b: -1 }
export const DEFAULT_REUSE = { x: 3 }
// The broadcasting example: a 3 x 2 matrix with a 2-vector added to each row
export const BROADCAST_EXAMPLE = { rows: 3, columns: 2, x: [1, 2, 3, 4, 5, 6], b: [0.5, -1] }

// ── What an engine reports ───────────────────────────────────────────────────

export type RawNode = {
  label: string
  // The engine's own name for the operation that made this ("MulBackward" in C++), or
  // "leaf" for a value that was put in rather than computed
  engineOp: string
  shape: number[]
  // The nodes this one was computed from, by position in the list
  parents: number[]
  requiresGrad: boolean
  value: Float32Array
}

export type RawGraph = {
  // Parents before children, so the list is also the order of the forward pass
  nodes: RawNode[]
  root: number
  // The gradient of every node (null if it has none) before the backward pass starts,
  // and after each step of it
  initial: (Float32Array | null)[]
  steps: { node: number; grads: (Float32Array | null)[] }[]
}

// ── What the page shows ──────────────────────────────────────────────────────

export type OpKind =
  | 'leaf' | 'add' | 'mul' | 'relu' | 'sigmoid' | 'tanh' | 'sum' | 'bce' | 'linear' | 'matmul' | 'other'

export function normalizeOp(engineOp: string): OpKind {
  const name = engineOp.replace(/Backward$/, '').toLowerCase()
  const known: Record<string, OpKind> = {
    leaf: 'leaf', add: 'add', mul: 'mul', relu: 'relu', sigmoid: 'sigmoid', tanh: 'tanh',
    sum: 'sum', bce: 'bce', linear: 'linear', matmul: 'matmul',
  }
  return known[name] ?? 'other'
}

export type Stats = { count: number; mean: number; meanAbs: number; min: number; max: number; norm: number }

// Tensors up to this size are shown in full; bigger ones as their shape and statistics
export const MAX_FULL_VALUES = 64

export type TensorView = { shape: number[]; values: number[] | null; stats: Stats }

export function summarize(values: ArrayLike<number>, shape: number[]): TensorView {
  const count = values.length
  let sum = 0
  let sumAbs = 0
  let sumSquares = 0
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < count; i++) {
    const v = values[i]
    sum += v
    sumAbs += Math.abs(v)
    sumSquares += v * v
    if (v < min) min = v
    if (v > max) max = v
  }
  return {
    shape,
    values: count <= MAX_FULL_VALUES ? Array.from(values) : null,
    stats: {
      count,
      mean: count ? sum / count : 0,
      meanAbs: count ? sumAbs / count : 0,
      min: count ? min : 0,
      max: count ? max : 0,
      norm: Math.sqrt(sumSquares),
    },
  }
}

export type TraceNode = {
  id: number
  label: string
  op: OpKind
  engineOp: string
  shape: number[]
  parents: number[]
  requiresGrad: boolean
  value: TensorView
  // The gradient once the whole backward pass is done, if the node has one
  finalGrad: TensorView | null
}

export type Contribution = {
  parent: number
  // What this step added to the parent's gradient
  delta: TensorView
  // How many of the node's inputs are this parent: 2 for x * x
  uses: number
}

export type TraceStep = {
  // The node whose backward function runs in this step
  node: number
  // Its gradient on the way in: complete, because everything that uses it has run
  upstream: TensorView
  contributions: Contribution[]
  // Every node's gradient after this step
  grads: (TensorView | null)[]
}

export type GraphTrace = {
  nodes: TraceNode[]
  root: number
  initial: (TensorView | null)[]
  steps: TraceStep[]
}

export function buildTrace(raw: RawGraph): GraphTrace {
  const view = (values: Float32Array | null, shape: number[]) => (values ? summarize(values, shape) : null)
  const shapes = raw.nodes.map((node) => node.shape)
  const snapshotViews = (grads: (Float32Array | null)[]) => grads.map((g, i) => view(g, shapes[i]))

  const last = raw.steps.length ? raw.steps[raw.steps.length - 1].grads : raw.initial
  const nodes: TraceNode[] = raw.nodes.map((node, id) => ({
    id,
    label: node.label,
    op: normalizeOp(node.engineOp),
    engineOp: node.engineOp,
    shape: node.shape,
    parents: node.parents,
    requiresGrad: node.requiresGrad,
    value: summarize(node.value, node.shape),
    finalGrad: view(last[id], node.shape),
  }))

  const steps: TraceStep[] = raw.steps.map((step, index) => {
    const before = index === 0 ? raw.initial : raw.steps[index - 1].grads
    const node = raw.nodes[step.node]
    const contributions: Contribution[] = []
    Array.from(new Set(node.parents)).forEach((parent) => {
      const after = step.grads[parent]
      if (!after) return
      const was = before[parent]
      const delta = new Float32Array(after.length)
      for (let i = 0; i < delta.length; i++) delta[i] = after[i] - (was ? was[i] : 0)
      contributions.push({
        parent,
        delta: summarize(delta, shapes[parent]),
        uses: node.parents.filter((p) => p === parent).length,
      })
    })
    return {
      node: step.node,
      upstream: summarize(before[step.node] ?? new Float32Array(node.value.length), node.shape),
      contributions,
      grads: snapshotViews(step.grads),
    }
  })

  return { nodes, root: raw.root, initial: snapshotViews(raw.initial), steps }
}

// ── Layout ───────────────────────────────────────────────────────────────────

export type Layout = {
  positions: { x: number; y: number }[]
  column: number[]
  width: number
  height: number
}

// Which column of the picture each node goes in: values flow left to right. A computed
// node sits one column after its latest input. An input that isn't a starting point
// of the whole computation (a layer's weights, say) sits just before the first thing
// that uses it, instead of far away at the left edge.
export function layoutGraph(
  trace: GraphTrace,
  { nodeWidth = 132, nodeHeight = 64, columnGap = 56, rowGap = 14, margin = 8 } = {}
): Layout {
  const { nodes } = trace
  const column = new Array<number>(nodes.length).fill(0)
  nodes.forEach((node) => {
    if (node.parents.length) column[node.id] = 1 + Math.max(...node.parents.map((p) => column[p]))
  })
  const consumers = nodes.map(() => [] as number[])
  nodes.forEach((node) => node.parents.forEach((p) => consumers[p].push(node.id)))
  // The first graph input stays at the left edge; other inputs move next to their first use
  const leaves = nodes.filter((node) => node.parents.length === 0)
  leaves.forEach((leaf, index) => {
    if (index > 0 && consumers[leaf.id].length) {
      column[leaf.id] = Math.min(...consumers[leaf.id].map((c) => column[c])) - 1
    }
  })
  const lowest = Math.min(...column)
  column.forEach((_, i) => (column[i] -= lowest))

  const columns = Math.max(...column) + 1
  const byColumn: number[][] = Array.from({ length: columns }, () => [])
  nodes.forEach((node) => byColumn[column[node.id]].push(node.id))

  // Order each column by where its inputs are, so lines cross as little as is easy
  const row = new Array<number>(nodes.length).fill(0)
  byColumn.forEach((ids, c) => {
    if (c > 0) {
      const center = (id: number) => {
        const ps = nodes[id].parents
        return ps.length ? ps.reduce((total, p) => total + row[p], 0) / ps.length : Infinity
      }
      ids.sort((a, b) => center(a) - center(b) || a - b)
    }
    ids.forEach((id, i) => (row[id] = i))
  })

  const tallest = Math.max(...byColumn.map((ids) => ids.length))
  const height = margin * 2 + tallest * nodeHeight + (tallest - 1) * rowGap
  const positions = nodes.map((node) => {
    const ids = byColumn[column[node.id]]
    const columnHeight = ids.length * nodeHeight + (ids.length - 1) * rowGap
    return {
      x: margin + column[node.id] * (nodeWidth + columnGap),
      y: (height - columnHeight) / 2 + row[node.id] * (nodeHeight + rowGap),
    }
  })
  return { positions, column, width: margin * 2 + columns * nodeWidth + (columns - 1) * columnGap, height }
}
