'use client'

import { useEffect, useRef } from 'react'
import { GRID_SIZE, contourSegments } from '@/lib/playground/grid'
import { heatmapColor } from '@/lib/playground/heatmap'
import type { Point } from '@/lib/playground/types'
import { prepareCanvas, useElementWidth, usePrefersDark } from './canvasHooks'

const COLORS = {
  dark: { background: '#0a0a0a', grid: '#262626', axis: '#404040', class0: '#47a3f3', class1: '#fbbf24', boundary: '#f5f5f5' },
  light: { background: '#ffffff', grid: '#f0f0f0', axis: '#d4d4d4', class0: '#2563eb', class1: '#d97706', boundary: '#171717' },
}

// Class 0 is a blue circle, class 1 is an amber diamond, so the classes can be
// told apart without relying on color. The background shows what the network
// predicts, with a line where it switches from one class to the other.
export function ClassLegend({ showPrediction = false }: { showPrediction?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
      <li className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
          <circle r="4.5" className="fill-blue-600 dark:fill-[#47a3f3]" />
        </svg>
        Class 0 (circle)
      </li>
      <li className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
          <path d="M0 -6 L6 0 L0 6 L-6 0 Z" className="fill-amber-600 dark:fill-[#fbbf24]" />
        </svg>
        Class 1 (diamond)
      </li>
      {showPrediction && (
        <>
          <li className="flex items-center gap-2">
            <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
              <rect width="11" height="12" className="fill-blue-600/40 dark:fill-[#47a3f3]/40" />
              <rect x="11" width="11" height="12" className="fill-amber-600/40 dark:fill-[#fbbf24]/40" />
            </svg>
            Network&apos;s prediction
          </li>
          <li className="flex items-center gap-2">
            <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
              <path d="M1 6 H21" strokeWidth="2.5" className="stroke-neutral-900 dark:stroke-neutral-100" />
            </svg>
            Decision boundary
          </li>
        </>
      )}
    </ul>
  )
}

export function DatasetPlot({
  points,
  name,
  grid,
  running,
  step,
}: {
  points: Point[]
  name: string
  // The network's probability of class 1 on a GRID_SIZE x GRID_SIZE grid, if there is one yet
  grid: Float32Array | null
  running: boolean
  step: number
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heatmapRef = useRef<HTMLCanvasElement | null>(null)
  const size = useElementWidth(wrapperRef, 520)
  const dark = usePrefersDark()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size === 0) return
    const context = prepareCanvas(canvas, size, size)
    if (!context) return

    const theme = dark ? 'dark' : 'light'
    const colors = COLORS[theme]
    context.fillStyle = colors.background
    context.fillRect(0, 0, size, size)

    // Data runs from -1 to 1 on both axes, with a little padding
    const pad = 12
    const inner = size - 2 * pad
    const toPixelX = (value: number) => pad + ((value + 1) / 2) * inner
    const toPixelY = (value: number) => pad + ((1 - value) / 2) * inner

    // The network's predictions: one pixel per grid cell, stretched smoothly over the plot
    const hasGrid = grid !== null && grid.length === GRID_SIZE * GRID_SIZE
    if (hasGrid) {
      const heatmap = (heatmapRef.current ??= document.createElement('canvas'))
      heatmap.width = GRID_SIZE
      heatmap.height = GRID_SIZE
      const heatmapContext = heatmap.getContext('2d')
      if (heatmapContext) {
        const image = heatmapContext.createImageData(GRID_SIZE, GRID_SIZE)
        for (let i = 0; i < grid.length; i++) {
          const [r, g, b, a] = heatmapColor(grid[i], theme)
          image.data[4 * i] = r
          image.data[4 * i + 1] = g
          image.data[4 * i + 2] = b
          image.data[4 * i + 3] = a
        }
        heatmapContext.putImageData(image, 0, 0)
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'high'
        // Cells are centered on their coordinates, so the image spans the area between
        // the outermost centers plus half a cell on each side, which is exactly [-1, 1]
        context.drawImage(heatmap, pad, pad, inner, inner)
      }
    }

    context.lineWidth = 1
    context.strokeStyle = colors.grid
    ;[-0.5, 0.5].forEach((tick) => {
      context.beginPath()
      context.moveTo(toPixelX(tick), pad)
      context.lineTo(toPixelX(tick), size - pad)
      context.moveTo(pad, toPixelY(tick))
      context.lineTo(size - pad, toPixelY(tick))
      context.stroke()
    })
    context.strokeStyle = colors.axis
    context.beginPath()
    context.moveTo(toPixelX(0), pad)
    context.lineTo(toPixelX(0), size - pad)
    context.moveTo(pad, toPixelY(0))
    context.lineTo(size - pad, toPixelY(0))
    context.stroke()

    // The decision boundary: where the predicted probability crosses 50%
    if (hasGrid) {
      const segments = contourSegments(grid, GRID_SIZE, 0.5)
      context.strokeStyle = colors.boundary
      context.lineWidth = 2
      context.lineCap = 'round'
      context.beginPath()
      for (let i = 0; i < segments.length; i += 4) {
        context.moveTo(toPixelX(segments[i]), toPixelY(segments[i + 1]))
        context.lineTo(toPixelX(segments[i + 2]), toPixelY(segments[i + 3]))
      }
      context.stroke()
    }

    // The labeled points, with a thin outline so they stay visible on the background colors
    const radius = Math.max(3, size / 110)
    context.lineWidth = 1.5
    context.strokeStyle = colors.background
    points.forEach((point) => {
      const x = toPixelX(point.x)
      const y = toPixelY(point.y)
      context.beginPath()
      if (point.label === 0) {
        context.fillStyle = colors.class0
        context.arc(x, y, radius, 0, 2 * Math.PI)
      } else {
        context.fillStyle = colors.class1
        context.moveTo(x, y - radius * 1.3)
        context.lineTo(x + radius * 1.3, y)
        context.lineTo(x, y + radius * 1.3)
        context.lineTo(x - radius * 1.3, y)
        context.closePath()
      }
      context.fill()
      context.stroke()
    })
  }, [points, grid, size, dark])

  const zeros = points.filter((point) => point.label === 0).length
  return (
    <div ref={wrapperRef} className="w-full">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Scatter plot of the ${name} dataset: ${zeros} class 0 points drawn as circles and ${points.length - zeros} class 1 points drawn as diamonds.${
            grid ? " The background shows what the network currently predicts, and a line marks where it switches between the two classes." : ''
          }`}
          className="block rounded-md ring-1 ring-neutral-200 dark:ring-neutral-800"
          style={{ width: size, height: size }}
        />
        {/* The readout below the plot gives the same information to screen readers */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-neutral-900/70 px-2 py-0.5 text-xs text-white dark:bg-neutral-800/80"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${running ? "animate-pulse bg-[#47a3f3] motion-reduce:animate-none" : "bg-neutral-400"}`}
          />
          {running ? 'Training' : 'Paused'} · step {step.toLocaleString('en-US')}
        </span>
      </div>
    </div>
  )
}
