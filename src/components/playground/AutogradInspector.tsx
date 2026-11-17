'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BACKWARD_RULE, FORWARD_RULE, describeBackward, describeForward, fmt } from '@/lib/playground/explain'
import {
  DEFAULT_REUSE,
  DEFAULT_WORKED,
  layoutGraph,
  type GraphTrace,
  type InspectRequest,
  type TensorView,
  type TraceNode,
} from '@/lib/playground/graph'
import type { Point } from '@/lib/playground/types'
import { RadioGroup } from './RadioGroup'
import { buttonClass } from './TrainingControls'
import type { Trainer } from './useTrainer'

type Tab = 'worked' | 'reuse' | 'broadcast' | 'network'

const TABS: { value: Tab; label: string }[] = [
  { value: 'worked', label: 'Worked example' },
  { value: 'reuse', label: 'Gradient accumulation' },
  { value: 'broadcast', label: 'Broadcasting' },
  { value: 'network', label: 'Your network' },
]

const INTRO: Record<Tab, string> = {
  worked:
    'One neuron: a = ReLU(w · x + b). Step forward to compute it, then backward to see how the engine finds how much a changes when x, w or b change.',
  reuse:
    'f = x · x + x uses x three times. Each use sends its own gradient back and they add up: df/dx = 2x + 1.',
  broadcast:
    'A bias vector b is added to every row of a 3 × 2 matrix. In the backward pass b receives the sum of the gradients of all three rows it was copied into.',
  network:
    'The network you are training, run on one data point. Every weight, bias and activation is a node; the backward pass is what training uses to get the gradients.',
}

const NODE_W = 132
const NODE_H = 64

// The value of a tensor on one line
function brief(view: TensorView | null): string {
  if (!view) return ''
  if (view.values && view.values.length === 1) return fmt(view.values[0])
  if (view.values && view.values.length <= 4) return `[${view.values.map(fmt).join(', ')}]`
  return `${view.shape.join('×')} · mean ${fmt(view.stats.mean)}`
}

function full(view: TensorView | null): string {
  if (!view) return '—'
  if (view.values) return view.values.map(fmt).join(', ')
  const s = view.stats
  return `${view.shape.join(' × ')}: mean ${fmt(s.mean)}, mean |v| ${fmt(s.meanAbs)}, min ${fmt(s.min)}, max ${fmt(s.max)}, norm ${fmt(s.norm)}`
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="font-mono">{label} =</span>
      <input
        type="number"
        step={0.5}
        min={-100}
        max={100}
        value={value}
        onChange={(event) => {
          const next = event.target.valueAsNumber
          if (Number.isFinite(next)) onChange(Math.max(-100, Math.min(100, next)))
        }}
        className="w-20 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm tabular-nums dark:border-neutral-800"
      />
    </label>
  )
}

export function AutogradInspector({ trainer, points }: { trainer: Trainer; points: Point[] }) {
  const { inspect, runId, status, step: trainerStep } = trainer
  const [tab, setTab] = useState<Tab>('worked')
  const [worked, setWorked] = useState(DEFAULT_WORKED)
  const [reuseX, setReuseX] = useState(DEFAULT_REUSE.x)
  const [pointIndex, setPointIndex] = useState(0)
  const [trace, setTrace] = useState<{ trace: GraphTrace; tab: Tab; step: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  const point = points[Math.min(pointIndex, points.length - 1)]
  const running = status === 'running'
  // While training runs the network keeps changing, so the network view waits for a pause
  const stepToShow = tab === 'network' && running ? null : trainerStep

  const request = useMemo<InspectRequest | null>(() => {
    if (tab === 'worked') return { kind: 'worked', ...worked }
    if (tab === 'reuse') return { kind: 'reuse', x: reuseX }
    if (tab === 'broadcast') return { kind: 'broadcast' }
    return point ? { kind: 'network', x: point.x, y: point.y, label: point.label } : null
  }, [tab, worked, reuseX, point])
  const requestKey = JSON.stringify(request)

  useEffect(() => {
    // Wait until the engine has a network (and, for the network view, until training pauses)
    if (!request || runId === 0 || stepToShow === null) return
    let current = true
    inspect(request).then(
      (result) => {
        if (!current) return
        setError(null)
        setTrace({ trace: result, tab, step: trainerStep })
      },
      (reason: Error) => current && setError(reason.message)
    )
    return () => {
      current = false
    }
    // requestKey stands in for request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, runId, stepToShow, inspect])

  // Back to the start when the example changes, but not when only its numbers do
  useEffect(() => {
    setPosition(0)
    setSelected(null)
    setPlaying(false)
  }, [tab, runId])

  // Only trust a trace that belongs to the tab being shown
  const shown = trace && trace.tab === tab ? trace : null
  const data = shown?.trace ?? null
  const nodeCount = data?.nodes.length ?? 0
  const stepCount = data?.steps.length ?? 0
  const lastPosition = nodeCount + stepCount
  const at = Math.min(position, lastPosition)

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setPosition((current) => {
        if (current >= lastPosition) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, 900)
    return () => clearInterval(timer)
  }, [playing, lastPosition])

  const layout = useMemo(() => (data ? layoutGraph(data, { nodeWidth: NODE_W, nodeHeight: NODE_H }) : null), [data])

  // What the position means: part way through the forward pass, or some steps into the backward pass
  const forwardDone = Math.min(at, nodeCount)
  const backwardDone = Math.max(0, at - nodeCount)
  const grads = data ? (backwardDone === 0 ? data.initial : data.steps[backwardDone - 1].grads) : []
  const activeStep = data && backwardDone > 0 ? data.steps[backwardDone - 1] : null
  const forwardNode = data && at > 0 && at <= nodeCount ? data.nodes[at - 1] : null

  const explanation = useMemo(() => {
    if (!data) return null
    if (forwardNode) {
      return { headline: describeForward(data, forwardNode), rule: FORWARD_RULE[forwardNode.op], lines: [] as string[] }
    }
    if (activeStep) return describeBackward(data, activeStep)
    if (at === 0) return { headline: 'Nothing is computed yet. Press Next to run the forward pass, one operation at a time.', rule: '', lines: [] }
    const root = data.nodes[data.root]
    return {
      headline: `The forward pass is done: ${root.label} = ${brief(root.value)}. Now the backward pass starts from there.`,
      rule: '',
      lines: [],
    }
  }, [data, forwardNode, activeStep, at])

  const goTo = (next: number) => {
    setPlaying(false)
    setPosition(Math.max(0, Math.min(lastPosition, next)))
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return
    if (event.key === 'ArrowRight') (event.preventDefault(), goTo(at + 1))
    else if (event.key === 'ArrowLeft') (event.preventDefault(), goTo(at - 1))
  }

  const phase = at === 0 ? 'Start' : at <= nodeCount ? `Forward pass ${forwardDone} of ${nodeCount}` : `Backward pass ${backwardDone} of ${stepCount}`
  const details: TraceNode | null = data && selected !== null ? data.nodes[selected] : null
  const involved = new Set<number>()
  if (activeStep) {
    involved.add(activeStep.node)
    activeStep.contributions.forEach((c) => involved.add(c.parent))
  }
  const engine = trainer.engine

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <RadioGroup label="Graph" options={TABS} value={tab} onChange={(next: Tab) => setTab(next)} />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{INTRO[tab]}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {tab === 'worked' && (
          <>
            <NumberField label="x" value={worked.x} onChange={(x) => setWorked({ ...worked, x })} />
            <NumberField label="w" value={worked.w} onChange={(w) => setWorked({ ...worked, w })} />
            <NumberField label="b" value={worked.b} onChange={(b) => setWorked({ ...worked, b })} />
            <button type="button" className={buttonClass} onClick={() => setWorked(DEFAULT_WORKED)}>
              Defaults
            </button>
          </>
        )}
        {tab === 'reuse' && <NumberField label="x" value={reuseX} onChange={setReuseX} />}
        {tab === 'network' && point && (
          <>
            <button type="button" className={buttonClass} onClick={() => setPointIndex((i) => (i + 1) % points.length)}>
              Next data point
            </button>
            <span className="text-sm tabular-nums">
              point {Math.min(pointIndex, points.length - 1) + 1} of {points.length}: ({point.x.toFixed(2)}, {point.y.toFixed(2)}), class {point.label}
            </span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              {running ? 'Pause training to refresh this view.' : `Weights at step ${shown?.step ?? trainerStep}.`}
            </span>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
          {error}
        </p>
      )}

      {!data || !layout ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {runId === 0 ? 'Waiting for the engine…' : running && tab === 'network' ? 'Pause training to see the network’s graph.' : 'Building the graph…'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass} disabled={at === 0} onClick={() => goTo(at - 1)}>
              Back
            </button>
            <button type="button" className={buttonClass} disabled={at >= lastPosition} onClick={() => goTo(at + 1)}>
              Next
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                if (playing) return setPlaying(false)
                if (at >= lastPosition) setPosition(0)
                setPlaying(true)
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className={buttonClass} disabled={at === 0} onClick={() => goTo(0)}>
              Restart
            </button>
            <span className="text-sm tabular-nums text-neutral-600 dark:text-neutral-400">{phase}</span>
            <span className="text-xs text-neutral-500">Left and right arrows also step.</span>
          </div>

          <div
            className="overflow-x-auto rounded-md border border-neutral-200 p-1 dark:border-neutral-800"
            tabIndex={0}
            role="group"
            aria-label="Computation graph. Left and right arrow keys step through it."
          >
            <svg width={layout.width} height={layout.height} role="img" aria-label={`Computation graph with ${nodeCount} nodes`} className="block max-w-none">
              <defs>
                <marker id="ag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="fill-neutral-400" />
                </marker>
                <marker id="ag-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="fill-blue-500" />
                </marker>
              </defs>
              {data.nodes.map((node) =>
                node.parents.map((parent, k) => {
                  const from = layout.positions[parent]
                  const to = layout.positions[node.id]
                  const x1 = from.x + NODE_W
                  const y1 = from.y + NODE_H / 2
                  const x2 = to.x
                  const y2 = to.y + NODE_H / 2
                  const bend = (x2 - x1) / 2
                  const active = activeStep?.node === node.id && involved.has(parent)
                  const computed = node.id < forwardDone
                  return (
                    <path
                      key={`${node.id}-${parent}-${k}`}
                      d={`M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2 - 2} ${y2}`}
                      fill="none"
                      strokeWidth={active ? 2.5 : 1.5}
                      markerEnd={active ? 'url(#ag-arrow-active)' : 'url(#ag-arrow)'}
                      className={active ? 'stroke-blue-500' : computed ? 'stroke-neutral-400' : 'stroke-neutral-200 dark:stroke-neutral-800'}
                    />
                  )
                })
              )}
              {data.nodes.map((node) => {
                const { x, y } = layout.positions[node.id]
                const computed = node.id < forwardDone
                const current = forwardNode?.id === node.id || activeStep?.node === node.id
                const touched = involved.has(node.id)
                const grad = grads[node.id]
                const stroke = current
                  ? 'stroke-blue-500'
                  : touched
                    ? 'stroke-blue-400'
                    : selected === node.id
                      ? 'stroke-neutral-900 dark:stroke-neutral-100'
                      : 'stroke-neutral-300 dark:stroke-neutral-700'
                return (
                  <g
                    key={node.id}
                    transform={`translate(${x} ${y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.label}, ${node.op}${computed ? `, value ${brief(node.value)}` : ''}${grad ? `, gradient ${brief(grad)}` : ''}`}
                    aria-pressed={selected === node.id}
                    onClick={() => setSelected(selected === node.id ? null : node.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelected(selected === node.id ? null : node.id)
                      }
                    }}
                    className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-blue-500"
                    opacity={computed ? 1 : 0.45}
                  >
                    <rect width={NODE_W} height={NODE_H} rx={8} strokeWidth={current || touched ? 2.5 : 1.5} className={`${stroke} fill-white dark:fill-neutral-950`} />
                    <text x={8} y={17} className="fill-current text-[12px] font-semibold">
                      {node.label}
                    </text>
                    <text x={NODE_W - 8} y={17} textAnchor="end" className="fill-neutral-500 text-[10px]">
                      {node.op === 'leaf' ? (node.requiresGrad ? 'input' : 'data') : node.op}
                    </text>
                    <text x={8} y={36} className="fill-current font-mono text-[11px]">
                      {computed ? brief(node.value) : '…'}
                    </text>
                    <text x={8} y={54} className="fill-blue-700 font-mono text-[11px] dark:fill-blue-300">
                      {grad ? `∂ ${brief(grad)}` : node.requiresGrad ? '' : 'no gradient'}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          <div aria-live="polite" className="space-y-1 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            {explanation && (
              <>
                <p className="font-medium">{explanation.headline}</p>
                {explanation.rule && <p className="text-neutral-600 dark:text-neutral-400">{explanation.rule}</p>}
                {explanation.lines.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5">
                    {explanation.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {details && (
            <div className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <p className="font-medium">
                {details.label} <span className="font-normal text-neutral-600 dark:text-neutral-400">· {details.op === 'leaf' ? 'input' : details.op} · shape [{details.shape.join(' × ')}]</span>
              </p>
              <p className="text-neutral-600 dark:text-neutral-400">
                {details.op === 'leaf' ? FORWARD_RULE.leaf : `${FORWARD_RULE[details.op]} ${BACKWARD_RULE[details.op]}`}
              </p>
              <p className="mt-1 break-words font-mono text-xs">value: {full(details.value)}</p>
              <p className="break-words font-mono text-xs">gradient: {details.requiresGrad ? full(details.finalGrad) : 'none (data, not a parameter)'}</p>
              <p className="mt-1 text-xs text-neutral-500">Engine operation: {details.engineOp}</p>
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer select-none">All values and gradients</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-neutral-600 dark:text-neutral-400">
                    <th className="py-1 pr-3 font-medium">Node</th>
                    <th className="pr-3 font-medium">Operation</th>
                    <th className="pr-3 font-medium">Shape</th>
                    <th className="pr-3 font-medium">Value</th>
                    <th className="font-medium">Gradient</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {data.nodes.map((node) => (
                    <tr key={node.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                      <th scope="row" className="py-1 pr-3 text-left font-semibold">{node.label}</th>
                      <td className="pr-3">{node.op === 'leaf' ? 'input' : node.op}</td>
                      <td className="pr-3">{node.shape.join(' × ')}</td>
                      <td className="pr-3">{full(node.value)}</td>
                      <td>{node.requiresGrad ? full(node.finalGrad) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {engine && <p className="text-xs text-neutral-600 dark:text-neutral-400">Graph built and differentiated by: {engine.label}.</p>}
        </>
      )}
    </div>
  )
}
