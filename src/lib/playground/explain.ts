// Plain-language descriptions of each step of a trace, for the autograd inspector. Where a
// node holds a single number, the description puts the actual numbers in ("z = 6 + -1 = 5");
// bigger tensors are described by their shapes.

import type { GraphTrace, OpKind, TensorView, TraceNode, TraceStep } from './graph'

// A short number: up to 4 significant digits, no trailing zeros
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e5 || abs < 1e-3) return value.toExponential(2).replace('e+', 'e')
  return String(Number(value.toPrecision(4)))
}

const shapeText = (shape: number[]) => `[${shape.join(' × ')}]`
const scalar = (view: TensorView | null): number | null =>
  view && view.values && view.values.length === 1 ? view.values[0] : null
const bracket = (value: number) => (value < 0 ? `(${fmt(value)})` : fmt(value))

const SYMBOL: Partial<Record<OpKind, string>> = { add: '+', mul: '×' }

// The rule each operation uses, in words
export const FORWARD_RULE: Record<OpKind, string> = {
  leaf: 'An input: a value that was put in, not computed.',
  add: 'Add the two inputs. A shorter vector is added to every row.',
  mul: 'Multiply the two inputs, element by element.',
  relu: 'ReLU keeps positive values and turns everything else into 0.',
  sigmoid: 'Sigmoid squashes any value into the range 0 to 1: 1 / (1 + e^-x).',
  tanh: 'Tanh squashes any value into the range -1 to 1.',
  sum: 'Add up every element into one number.',
  bce: 'Binary cross-entropy: how surprised the network is by the true class. Small when it was confident and right.',
  linear: 'A layer: x Wᵀ + b, every output a weighted sum of the inputs plus a bias.',
  matmul: 'Matrix multiplication.',
  other: 'An operation the engine computed.',
}

export const BACKWARD_RULE: Record<OpKind, string> = {
  leaf: '',
  add: 'Addition passes the gradient through unchanged to each input. An input that was copied across rows gets the sum over those rows.',
  mul: 'Each input receives the incoming gradient times the other input.',
  relu: 'ReLU passes the gradient where the input was above 0 and blocks it (gradient 0) everywhere else.',
  sigmoid: 'The gradient is scaled by the sigmoid’s slope, output × (1 − output).',
  tanh: 'The gradient is scaled by tanh’s slope, 1 − output².',
  sum: 'Every element that was added in gets the same gradient as the total.',
  bce: 'The gradient pushes the prediction toward the true class, harder the further off it is.',
  linear: 'The weights get the incoming gradient times the layer’s input, the input gets it times the weights, and the bias gets its sum over the rows.',
  matmul: 'Each matrix receives the incoming gradient multiplied by the other one.',
  other: 'The engine’s backward function for this operation.',
}

function valueText(view: TensorView): string {
  if (view.values && view.values.length <= 6) {
    return view.values.length === 1 ? fmt(view.values[0]) : `[${view.values.map(fmt).join(', ')}]`
  }
  return `${shapeText(view.shape)} (mean ${fmt(view.stats.mean)}, norm ${fmt(view.stats.norm)})`
}

export function describeForward(trace: GraphTrace, node: TraceNode): string {
  if (node.op === 'leaf') {
    return `${node.label} = ${valueText(node.value)}. ${node.requiresGrad ? 'The backward pass will find how the result changes with it.' : 'It is data, so it gets no gradient.'}`
  }
  const inputs = node.parents.map((p) => trace.nodes[p])
  const symbol = SYMBOL[node.op]
  const values = inputs.map((input) => scalar(input.value))
  const all = [...values, scalar(node.value)]
  if (all.every((v) => v !== null)) {
    const [first, second] = values as number[]
    const result = scalar(node.value)!
    if (symbol && inputs.length === 2) {
      return `${node.label} = ${inputs[0].label} ${symbol} ${inputs[1].label} = ${bracket(first)} ${symbol} ${bracket(second)} = ${fmt(result)}`
    }
    if (inputs.length === 1) {
      return `${node.label} = ${node.op}(${inputs[0].label}) = ${node.op}(${fmt(first)}) = ${fmt(result)}`
    }
  }
  const from = inputs.map((input) => input.label).join(', ')
  return `${node.label} (${node.op}, ${shapeText(node.shape)}) is computed from ${from}.`
}

export type BackwardDescription = {
  headline: string
  rule: string
  lines: string[]
}

export function describeBackward(trace: GraphTrace, step: TraceStep): BackwardDescription {
  const node = trace.nodes[step.node]
  const incoming = scalar(step.upstream)
  const headline =
    node.id === trace.root
      ? `Start at ${node.label}: its gradient is 1, because ${node.label} changes by exactly as much as itself.`
      : `${node.label} is ready: everything that uses it has already sent its share, so its gradient is ${valueText(step.upstream)}.`

  const lines = step.contributions.map((contribution) => {
    const parent = trace.nodes[contribution.parent]
    const delta = valueText(contribution.delta)
    const total = step.grads[contribution.parent]
    const note = contribution.uses > 1 ? ` (${parent.label} is used ${contribution.uses} times here, so both add up)` : ''
    const running =
      total && contribution.delta.stats.norm !== total.stats.norm
        ? `; ${parent.label}'s gradient so far: ${valueText(total)}`
        : ''
    const reason = scalarReason(trace, node, parent, incoming)
    return `${parent.label} gets ${delta}${reason ? ` (${reason})` : ''}${note}${running}`
  })
  if (lines.length === 0) lines.push('Nothing flows back from here: none of its inputs need a gradient.')
  return { headline, rule: BACKWARD_RULE[node.op], lines }
}

// The arithmetic behind one contribution, when it's all single numbers
function scalarReason(trace: GraphTrace, node: TraceNode, parent: TraceNode, upstream: number | null): string {
  if (upstream === null) return ''
  if (node.op === 'mul') {
    const other = node.parents.map((p) => trace.nodes[p]).find((n) => n.id !== parent.id) ?? parent
    const value = scalar(other.value)
    return value === null ? '' : `${fmt(upstream)} × ${other.label} = ${fmt(upstream)} × ${bracket(value)}`
  }
  if (node.op === 'add') return `${fmt(upstream)} passes straight through`
  if (node.op === 'relu') {
    const input = scalar(parent.value)
    return input === null ? '' : input > 0 ? `${parent.label} = ${fmt(input)} > 0, so it passes` : `${parent.label} = ${fmt(input)} ≤ 0, so it's blocked`
  }
  return ''
}
