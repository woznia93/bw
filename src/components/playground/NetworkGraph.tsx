'use client'

import { useEffect, useRef } from 'react'
import { l2Norm } from '@/lib/playground/metrics'
import {
  edgeStyle,
  layerSizes,
  layerSummaries,
  maxAbs,
  parametersMatch,
} from '@/lib/playground/weights'
import { prepareCanvas, useElementWidth, usePrefersDark } from './canvasHooks'

const COLORS = {
  dark: { positive: '71, 163, 243', negative: '251, 191, 36', node: '#0a0a0a', stroke: '#737373', text: '#a3a3a3' },
  light: { positive: '37, 99, 235', negative: '217, 119, 6', node: '#ffffff', stroke: '#737373', text: '#525252' },
}

const PAD_X = 40
const PAD_TOP = 14
const PAD_BOTTOM = 26

const formatSmall = (value: number) => (value >= 0.001 ? value.toFixed(4) : value.toExponential(1))

export function NetworkGraph({
  hidden,
  parameters,
  gradientNorms,
}: {
  hidden: number[]
  // Weights and biases from the network, or null before the first report
  parameters: Float32Array[] | null
  gradientNorms: number[] | null
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = useElementWidth(wrapperRef)
  const dark = usePrefersDark()

  const sizes = layerSizes(hidden)
  const usable = parameters !== null && parametersMatch(hidden, parameters)
  const widest = Math.max(...sizes)
  const height = Math.min(340, Math.max(170, 26 * widest + PAD_TOP + PAD_BOTTOM))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return
    const context = prepareCanvas(canvas, width, height)
    if (!context) return
    const colors = COLORS[dark ? 'dark' : 'light']
    context.clearRect(0, 0, width, height)

    const columns = sizes.length
    const plotHeight = height - PAD_TOP - PAD_BOTTOM
    const x = (column: number) => PAD_X + (column * (width - 2 * PAD_X)) / (columns - 1)
    const y = (column: number, index: number) =>
      PAD_TOP + ((index + 0.5) * plotHeight) / sizes[column]
    const radius = Math.min(9, Math.max(2.5, (plotHeight / widest) * 0.35))

    const weights = usable ? parameters.filter((_, i) => i % 2 === 0) : null
    const biases = usable ? parameters.filter((_, i) => i % 2 === 1) : null
    const largestWeight = weights ? maxAbs(weights) : 0
    const largestBias = biases ? maxAbs(biases) : 0

    // Connections: blue and solid for positive weights, amber and dashed for negative.
    // Positive first and then negative, so the dash setting only changes once.
    for (const positive of [true, false]) {
      context.setLineDash(positive ? [] : [4, 3])
      for (let layer = 0; layer < columns - 1; layer++) {
        for (let to = 0; to < sizes[layer + 1]; to++) {
          for (let from = 0; from < sizes[layer]; from++) {
            let style = { positive: true, width: 0.8, alpha: 0.18 }
            if (weights) {
              const weight = weights[layer][to * sizes[layer] + from]
              if (weight >= 0 !== positive) continue
              style = edgeStyle(weight, largestWeight)
            } else if (!positive) continue
            context.strokeStyle = weights
              ? `rgba(${colors[positive ? 'positive' : 'negative']}, ${style.alpha})`
              : `rgba(128, 128, 128, ${style.alpha})`
            context.lineWidth = style.width
            context.beginPath()
            context.moveTo(x(layer), y(layer, from))
            context.lineTo(x(layer + 1), y(layer + 1, to))
            context.stroke()
          }
        }
      }
    }
    context.setLineDash([])

    // Neurons. A neuron's fill shows its bias: blue if positive, amber if negative.
    for (let column = 0; column < columns; column++) {
      for (let index = 0; index < sizes[column]; index++) {
        context.beginPath()
        context.arc(x(column), y(column, index), radius, 0, 2 * Math.PI)
        context.fillStyle = colors.node
        context.fill()
        if (biases && column > 0 && largestBias > 0) {
          const bias = biases[column - 1][index]
          const strength = Math.min(1, Math.abs(bias) / largestBias)
          context.fillStyle = `rgba(${colors[bias >= 0 ? 'positive' : 'negative']}, ${0.15 + 0.7 * strength})`
          context.fill()
        }
        context.lineWidth = 1.5
        context.strokeStyle = colors.stroke
        context.stroke()
      }
    }

    // Labels
    context.fillStyle = colors.text
    context.font = '11px ui-monospace, monospace'
    context.textBaseline = 'middle'
    context.textAlign = 'right'
    context.fillText('x', x(0) - radius - 6, y(0, 0))
    context.fillText('y', x(0) - radius - 6, y(0, 1))
    context.textAlign = 'left'
    context.fillText('P(1)', x(columns - 1) + radius + 6, y(columns - 1, 0))
    context.textAlign = 'center'
    context.textBaseline = 'top'
    sizes.forEach((_, column) => {
      const label = column === 0 ? 'Input' : column === columns - 1 ? 'Output' : `H${column}`
      context.fillText(label, x(column), height - PAD_BOTTOM + 10)
    })
  }, [width, height, dark, hidden, parameters, usable, sizes, widest])

  const summaries = usable ? layerSummaries(hidden, parameters, gradientNorms) : null
  const weightCount = summaries ? summaries.reduce((total, layer) => total + layer.weightCount, 0) : null
  const description = `Diagram of the network: 2 inputs, ${
    hidden.length === 0 ? 'no hidden layers' : `hidden layers of ${hidden.join(', ')} neurons`
  } and 1 output.${weightCount ? ` ${weightCount} weights. Blue solid lines are positive weights and amber dashed lines are negative ones; thicker means larger.` : ''} Details are in the table below.`

  return (
    <div>
      <div ref={wrapperRef}>
        <canvas ref={canvasRef} role="img" aria-label={description} className="block" style={{ width, height }} />
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        <li className="flex items-center gap-2">
          <svg width="24" height="8" aria-hidden="true">
            <path d="M0 4 H24" strokeWidth="2.5" className="stroke-blue-600 dark:stroke-[#47a3f3]" />
          </svg>
          Positive weight
        </li>
        <li className="flex items-center gap-2">
          <svg width="24" height="8" aria-hidden="true">
            <path d="M0 4 H24" strokeWidth="2.5" strokeDasharray="4 3" className="stroke-amber-600 dark:stroke-[#fbbf24]" />
          </svg>
          Negative weight (dashed)
        </li>
        <li>Thicker = larger · neuron shading = bias</li>
      </ul>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
          Layer details
        </summary>
        {summaries ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-xs tabular-nums">
              <caption className="sr-only">Weights and gradients of each layer</caption>
              <thead className="text-neutral-600 dark:text-neutral-400">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">Layer</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Shape</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Weights</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Mean |weight|</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Largest |weight|</th>
                  <th scope="col" className="py-1 font-medium">Gradient norm</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((layer) => (
                  <tr key={layer.name} className="border-t border-neutral-200 dark:border-neutral-800">
                    <th scope="row" className="py-1 pr-3 font-medium">{layer.name}</th>
                    <td className="py-1 pr-3">{layer.inputs} → {layer.outputs}</td>
                    <td className="py-1 pr-3">{layer.weightCount}</td>
                    <td className="py-1 pr-3">{layer.meanAbsWeight.toFixed(3)}</td>
                    <td className="py-1 pr-3">{layer.maxAbsWeight.toFixed(3)}</td>
                    <td className="py-1">{layer.gradientNorm === null ? '—' : formatSmall(layer.gradientNorm)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-neutral-600 dark:text-neutral-400">
                <tr className="border-t border-neutral-200 dark:border-neutral-800">
                  <th scope="row" className="py-1 pr-3 font-medium">All</th>
                  <td className="py-1 pr-3" />
                  <td className="py-1 pr-3">{weightCount}</td>
                  <td className="py-1 pr-3" />
                  <td className="py-1 pr-3" />
                  <td className="py-1">
                    {gradientNorms ? formatSmall(l2Norm([gradientNorms])) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">Waiting for the network…</p>
        )}
      </details>
    </div>
  )
}
