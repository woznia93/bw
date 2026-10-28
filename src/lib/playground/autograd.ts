// A small reverse-mode automatic differentiation library, shaped like the C++
// engine in woznia93/gpu_nn_framework: tensors remember how they were made, and
// backward() walks the graph in reverse order to accumulate gradients.
//
// It only has the operations the playground needs. Values are float32, like the
// C++ engine.

export class Tensor {
  readonly shape: number[]
  data: Float32Array
  grad: Float32Array | null = null
  requiresGrad: boolean
  // How this tensor was made: its inputs and the function that pushes this
  // tensor's gradient back into them. Both are empty for leaves (weights, data).
  parents: Tensor[] = []
  backwardFn: (() => void) | null = null
  op = 'leaf'

  constructor(shape: number[], data?: Float32Array, requiresGrad = false) {
    const size = shape.reduce((total, dim) => total * dim, 1)
    if (data && data.length !== size) {
      throw new Error(`Tensor: shape [${shape}] needs ${size} values, got ${data.length}`)
    }
    this.shape = shape
    this.data = data ?? new Float32Array(size)
    this.requiresGrad = requiresGrad
  }

  get size() {
    return this.data.length
  }

  // The gradient buffer, created (as zeros) on first use
  gradBuffer() {
    if (!this.grad) this.grad = new Float32Array(this.data.length)
    return this.grad
  }
}

let gradEnabled = true

// Run fn without recording a graph, for inference (like C++ NoGradGuard)
export function noGrad<T>(fn: () => T): T {
  const previous = gradEnabled
  gradEnabled = false
  try {
    return fn()
  } finally {
    gradEnabled = previous
  }
}

// Wire a result into the graph if any input needs gradients
function record(out: Tensor, parents: Tensor[], op: string, backward: () => void) {
  if (gradEnabled && parents.some((parent) => parent.requiresGrad)) {
    out.requiresGrad = true
    out.parents = parents
    out.backwardFn = backward
    out.op = op
  }
  return out
}

function expectShape(a: Tensor, b: Tensor, op: string) {
  if (a.shape.length !== b.shape.length || a.shape.some((dim, i) => dim !== b.shape[i])) {
    throw new Error(`${op}: shape mismatch [${a.shape}] vs [${b.shape}]`)
  }
}

// y = x Wᵀ + b with x [N, in], w [out, in], b [out]
export function linear(x: Tensor, w: Tensor, b?: Tensor): Tensor {
  if (x.shape.length !== 2 || w.shape.length !== 2 || x.shape[1] !== w.shape[1]) {
    throw new Error(`linear: cannot multiply [${x.shape}] by weights [${w.shape}]`)
  }
  const [n, inner] = x.shape
  const outer = w.shape[0]
  if (b && (b.shape.length !== 1 || b.shape[0] !== outer)) {
    throw new Error(`linear: bias shape [${b.shape}] does not match ${outer} outputs`)
  }

  const y = new Tensor([n, outer])
  for (let i = 0; i < n; i++) {
    for (let o = 0; o < outer; o++) {
      let sum = b ? b.data[o] : 0
      for (let k = 0; k < inner; k++) sum += x.data[i * inner + k] * w.data[o * inner + k]
      y.data[i * outer + o] = sum
    }
  }

  return record(y, b ? [x, w, b] : [x, w], 'linear', () => {
    const g = y.grad!
    if (x.requiresGrad) {
      const gx = x.gradBuffer()
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < inner; k++) {
          let sum = 0
          for (let o = 0; o < outer; o++) sum += g[i * outer + o] * w.data[o * inner + k]
          gx[i * inner + k] += sum
        }
      }
    }
    if (w.requiresGrad) {
      const gw = w.gradBuffer()
      for (let o = 0; o < outer; o++) {
        for (let k = 0; k < inner; k++) {
          let sum = 0
          for (let i = 0; i < n; i++) sum += g[i * outer + o] * x.data[i * inner + k]
          gw[o * inner + k] += sum
        }
      }
    }
    if (b && b.requiresGrad) {
      const gb = b.gradBuffer()
      for (let o = 0; o < outer; o++) {
        let sum = 0
        for (let i = 0; i < n; i++) sum += g[i * outer + o]
        gb[o] += sum
      }
    }
  })
}

// Elementwise function with a derivative written in terms of the input x and
// the output y
function elementwise(
  x: Tensor,
  op: string,
  forward: (x: number) => number,
  slope: (x: number, y: number) => number
) {
  const y = new Tensor(x.shape)
  for (let i = 0; i < x.size; i++) y.data[i] = forward(x.data[i])
  return record(y, [x], op, () => {
    if (!x.requiresGrad) return
    const gx = x.gradBuffer()
    for (let i = 0; i < x.size; i++) gx[i] += y.grad![i] * slope(x.data[i], y.data[i])
  })
}

export const relu = (x: Tensor) =>
  elementwise(x, 'relu', (v) => (v > 0 ? v : 0), (v) => (v > 0 ? 1 : 0))

export const tanh = (x: Tensor) =>
  elementwise(x, 'tanh', Math.tanh, (_, y) => 1 - y * y)

export const sigmoid = (x: Tensor) =>
  elementwise(x, 'sigmoid', (v) => 1 / (1 + Math.exp(-v)), (_, y) => y * (1 - y))

export function add(a: Tensor, b: Tensor): Tensor {
  expectShape(a, b, 'add')
  const y = new Tensor(a.shape)
  for (let i = 0; i < y.size; i++) y.data[i] = a.data[i] + b.data[i]
  return record(y, [a, b], 'add', () => {
    for (const input of [a, b]) {
      if (!input.requiresGrad) continue
      const gi = input.gradBuffer()
      for (let i = 0; i < y.size; i++) gi[i] += y.grad![i]
    }
  })
}

export function mul(a: Tensor, b: Tensor): Tensor {
  expectShape(a, b, 'mul')
  const y = new Tensor(a.shape)
  for (let i = 0; i < y.size; i++) y.data[i] = a.data[i] * b.data[i]
  return record(y, [a, b], 'mul', () => {
    if (a.requiresGrad) {
      const ga = a.gradBuffer()
      for (let i = 0; i < y.size; i++) ga[i] += y.grad![i] * b.data[i]
    }
    if (b.requiresGrad) {
      const gb = b.gradBuffer()
      for (let i = 0; i < y.size; i++) gb[i] += y.grad![i] * a.data[i]
    }
  })
}

export function sum(x: Tensor): Tensor {
  const y = new Tensor([1])
  let total = 0
  for (let i = 0; i < x.size; i++) total += x.data[i]
  y.data[0] = total
  return record(y, [x], 'sum', () => {
    if (!x.requiresGrad) return
    const gx = x.gradBuffer()
    for (let i = 0; i < x.size; i++) gx[i] += y.grad![0]
  })
}

// Same clamp as the C++ engine: predictions are kept strictly inside (0, 1) so
// the logs stay finite
const EPSILON = Math.fround(1e-7)
const UPPER = Math.fround(1 - EPSILON)

// Mean binary cross-entropy: -mean(t log p + (1 - t) log(1 - p)). The gradient
// uses the clamped prediction, as in the C++ engine.
export function bceLoss(pred: Tensor, target: Tensor): Tensor {
  if (pred.size !== target.size) {
    throw new Error(`bceLoss: ${pred.size} predictions but ${target.size} targets`)
  }
  const n = pred.size
  const clamped = new Float32Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    const p = Math.min(UPPER, Math.max(EPSILON, pred.data[i]))
    clamped[i] = p
    const t = target.data[i]
    total += t * Math.log(p) + (1 - t) * Math.log(Math.fround(1 - p))
  }
  const loss = new Tensor([1])
  loss.data[0] = -total / n

  return record(loss, [pred], 'bce', () => {
    if (!pred.requiresGrad) return
    const gp = pred.gradBuffer()
    const scale = loss.grad![0] / n
    for (let i = 0; i < n; i++) {
      const p = clamped[i]
      gp[i] += (scale * (p - target.data[i])) / (p * (1 - p))
    }
  })
}

// Reverse-mode pass from a scalar: every tensor that fed into `loss` ends up
// with grad = d loss / d tensor. Gradients add up where a tensor is used more
// than once, so the order matters: a tensor is only processed after everything
// that uses it.
export function backward(loss: Tensor) {
  if (loss.size !== 1) throw new Error('backward: needs a single value')
  if (!loss.requiresGrad) throw new Error('backward: nothing here requires gradients')

  const order: Tensor[] = []
  const seen = new Set<Tensor>()
  // Depth-first walk, written with a stack so deep graphs can't overflow the call stack
  const stack: { tensor: Tensor; next: number }[] = [{ tensor: loss, next: 0 }]
  seen.add(loss)
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

  loss.grad = new Float32Array([1])
  for (let i = order.length - 1; i >= 0; i--) {
    const tensor = order[i]
    if (tensor.backwardFn && tensor.grad) tensor.backwardFn()
  }
}

export function zeroGrad(tensors: Tensor[]) {
  tensors.forEach((tensor) => tensor.grad?.fill(0))
}
