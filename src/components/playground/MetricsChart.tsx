'use client'

import { useEffect, useRef } from 'react'
import type { LossPoint } from '@/lib/playground/history'
import { prepareCanvas, useElementWidth, usePrefersDark } from './canvasHooks'

const HEIGHT = 150
const MARGIN = { left: 38, right: 10, top: 10, bottom: 22 }

const COLORS = {
  dark: { grid: '#262626', axis: '#404040', text: '#a3a3a3', train: '#47a3f3', test: '#fbbf24' },
  light: { grid: '#eeeeee', axis: '#d4d4d4', text: '#525252', train: '#2563eb', test: '#d97706' },
}

// A round number just above the biggest loss, so the scale stays steady as it falls
function chartTop(history: LossPoint[]) {
  const biggest = history.reduce((max, point) => Math.max(max, point.loss), 0)
  return Math.max(0.8, Math.ceil(biggest * 10) / 10)
}

// Training loss (solid) and test loss (dashed). The two parting ways, with the test
// loss rising while the training loss keeps falling, is overfitting.
export function MetricsChart({
  history,
  testHistory,
  step,
  learningRate,
}: {
  history: LossPoint[]
  testHistory: LossPoint[]
  step: number
  learningRate: number
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = useElementWidth(wrapperRef)
  const dark = usePrefersDark()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return
    const context = prepareCanvas(canvas, width, HEIGHT)
    if (!context) return
    const colors = COLORS[dark ? 'dark' : 'light']

    const plotWidth = width - MARGIN.left - MARGIN.right
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
    const top = chartTop(history.concat(testHistory))
    // The horizontal axis grows with training, but never starts out absurdly zoomed in
    const lastStep = Math.max(step, 50)
    const toX = (value: number) => MARGIN.left + (value / lastStep) * plotWidth
    const toY = (value: number) => MARGIN.top + (1 - value / top) * plotHeight

    context.clearRect(0, 0, width, HEIGHT)
    context.font = '11px ui-monospace, monospace'
    context.textBaseline = 'middle'
    context.fillStyle = colors.text

    // Horizontal grid lines with their loss values
    context.lineWidth = 1
    ;[0, top / 2, top].forEach((value) => {
      context.strokeStyle = value === 0 ? colors.axis : colors.grid
      context.beginPath()
      context.moveTo(MARGIN.left, toY(value))
      context.lineTo(width - MARGIN.right, toY(value))
      context.stroke()
      context.textAlign = 'right'
      context.fillText(value.toFixed(1), MARGIN.left - 6, toY(value))
    })

    // Step labels at both ends of the axis
    context.textBaseline = 'top'
    context.textAlign = 'left'
    context.fillText('0', MARGIN.left, HEIGHT - MARGIN.bottom + 6)
    context.textAlign = 'right'
    context.fillText(`step ${lastStep.toLocaleString('en-US')}`, width - MARGIN.right, HEIGHT - MARGIN.bottom + 6)

    const line = (points: LossPoint[], color: string, dash: number[]) => {
      if (points.length === 0) return
      context.strokeStyle = color
      context.fillStyle = color
      context.lineWidth = 2
      context.lineJoin = 'round'
      context.setLineDash(dash)
      context.beginPath()
      points.forEach((point, i) => {
        const x = toX(point.step)
        const y = toY(Math.min(point.loss, top))
        if (i === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
      context.setLineDash([])
      const last = points[points.length - 1]
      context.beginPath()
      context.arc(toX(last.step), toY(Math.min(last.loss, top)), 3, 0, 2 * Math.PI)
      context.fill()
    }
    // Dashes as well as color, so the two lines can be told apart without it
    line(testHistory, colors.test, [6, 4])
    line(history, colors.train, [])
  }, [history, testHistory, step, width, dark])

  const first = history[0]
  const last = history[history.length - 1]
  const testLast = testHistory[testHistory.length - 1]
  const description = first
    ? `Training loss over ${step} steps, from ${first.loss.toFixed(3)} to ${last.loss.toFixed(3)}.${
        testLast ? ` Test loss is now ${testLast.loss.toFixed(3)}.` : ''
      }`
    : 'Loss chart. Nothing to show until training starts.'

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <h3 className="font-medium">Loss</h3>
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          learning rate {learningRate} · step {step.toLocaleString('en-US')}
        </span>
      </div>
      <ul className="mb-1 flex gap-4 text-xs text-neutral-600 dark:text-neutral-400">
        <li className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true">
            <path d="M0 4 H22" strokeWidth="2" className="stroke-blue-600 dark:stroke-[#47a3f3]" />
          </svg>
          Training
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true">
            <path d="M0 4 H22" strokeWidth="2" strokeDasharray="6 4" className="stroke-amber-600 dark:stroke-[#fbbf24]" />
          </svg>
          Test (held out)
        </li>
      </ul>
      <div ref={wrapperRef} className="relative">
        <canvas ref={canvasRef} role="img" aria-label={description} className="block" style={{ width, height: HEIGHT }} />
        {history.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center pb-5 pl-10 text-sm text-neutral-500">
            The loss curve appears once training starts.
          </p>
        )}
      </div>
    </div>
  )
}
