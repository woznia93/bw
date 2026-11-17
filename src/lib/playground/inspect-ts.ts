// Builds the example graphs with the TypeScript autograd, runs their backward pass one
// step at a time, and reports the result as a RawGraph. The C++ engine does the same
// through the WebAssembly module (see cpp/wasm/playground_adapter.cpp); both use the same
// labels and the same node order so that their traces can be compared directly.

import { Tensor, add, backwardTrace, bceLoss, linear, mul, relu, sigmoid, sum, tanh } from './autograd'
import { BROADCAST_EXAMPLE, type InspectRequest, type RawGraph } from './graph'
import type { Activation } from './types'

const leaf = (shape: number[], values: number[], requiresGrad: boolean) =>
  new Tensor(shape, Float32Array.from(values), requiresGrad)

// Every node reachable from `root`, inputs before the things computed from them. The walk
// follows inputs in order, which is the order the C++ adapter uses too.
function forwardOrder(root: Tensor): Tensor[] {
  const order: Tensor[] = []
  const seen = new Set<Tensor>([root])
  const stack: { tensor: Tensor; next: number }[] = [{ tensor: root, next: 0 }]
  while (stack.length) {
    const frame = stack[stack.length - 1]
    if (frame.next < frame.tensor.parents.length) {
      const parent = frame.tensor.parents[frame.next++]
      if (!seen.has(parent)) {
        seen.add(parent)
        stack.push({ tensor: parent, next: 0 })
      }
    } else {
      order.push(frame.tensor)
      stack.pop()
    }
  }
  return order
}

export function traceGraph(root: Tensor, labels: Map<Tensor, string>): RawGraph {
  const order = forwardOrder(root)
  const index = new Map(order.map((tensor, i) => [tensor, i]))
  const { initial, steps } = backwardTrace(root, order)
  return {
    nodes: order.map((tensor) => ({
      label: labels.get(tensor) ?? '?',
      engineOp: tensor.parents.length ? tensor.op : 'leaf',
      shape: tensor.shape.slice(),
      parents: tensor.parents.map((parent) => index.get(parent)!),
      requiresGrad: tensor.requiresGrad,
      value: tensor.data.slice(),
    })),
    root: index.get(root)!,
    initial,
    steps: steps.map((step) => ({ node: index.get(step.node)!, grads: step.grads })),
  }
}

export type NetworkForGraph = {
  // Copies of the weight [out, in] and bias [out] of each layer, in order
  weights: Float32Array[]
  biases: Float32Array[]
  sizes: number[]
  activation: Activation
}

function buildNetwork(net: NetworkForGraph, request: Extract<InspectRequest, { kind: 'network' }>) {
  const labels = new Map<Tensor, string>()
  const name = <T extends Tensor>(tensor: T, label: string) => (labels.set(tensor, label), tensor)
  const activate = net.activation === 'relu' ? relu : net.activation === 'tanh' ? tanh : sigmoid

  let h = name(leaf([1, 2], [request.x, request.y], false), 'x')
  const layers = net.weights.length
  for (let i = 0; i < layers; i++) {
    const inSize = net.sizes[i]
    const outSize = net.sizes[i + 1]
    const w = name(new Tensor([outSize, inSize], net.weights[i].slice(), true), `W${i + 1}`)
    const b = name(new Tensor([outSize], net.biases[i].slice(), true), `b${i + 1}`)
    const z = name(linear(h, w, b), `z${i + 1}`)
    h = i === layers - 1 ? name(sigmoid(z), 'p') : name(activate(z), `h${i + 1}`)
  }
  const target = name(leaf([1, 1], [request.label], false), 't')
  return { root: name(bceLoss(h, target), 'loss'), labels }
}

// Builds the graph a request asks for. The network is only needed for kind 'network'.
export function inspectWithTs(request: InspectRequest, net?: NetworkForGraph): RawGraph {
  const labels = new Map<Tensor, string>()
  const name = <T extends Tensor>(tensor: T, label: string) => (labels.set(tensor, label), tensor)

  if (request.kind === 'worked') {
    const x = name(leaf([1], [request.x], true), 'x')
    const w = name(leaf([1], [request.w], true), 'w')
    const b = name(leaf([1], [request.b], true), 'b')
    const wx = name(mul(w, x), 'wx')
    const z = name(add(wx, b), 'z')
    const a = name(relu(z), 'a')
    return traceGraph(a, labels)
  }
  if (request.kind === 'reuse') {
    const x = name(leaf([1], [request.x], true), 'x')
    const y = name(mul(x, x), 'y')
    const f = name(add(y, x), 'f')
    return traceGraph(f, labels)
  }
  if (request.kind === 'broadcast') {
    const { rows, columns } = BROADCAST_EXAMPLE
    const x = name(leaf([rows, columns], BROADCAST_EXAMPLE.x, false), 'X')
    const b = name(leaf([columns], BROADCAST_EXAMPLE.b, true), 'b')
    const y = name(add(x, b), 'Y')
    const loss = name(sum(y), 'loss')
    return traceGraph(loss, labels)
  }
  if (!net) throw new Error('inspect: the network graph needs a network')
  const built = buildNetwork(net, request)
  return traceGraph(built.root, built.labels)
}
