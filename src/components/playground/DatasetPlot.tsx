'use client'

import { useEffect, useRef, useState } from 'react'
import type { Point } from '@/lib/playground/types'

const COLORS = {
  dark: { background: '#0a0a0a', grid: '#262626', axis: '#404040', class0: '#47a3f3', class1: '#fbbf24' },
  light: { background: '#ffffff', grid: '#f0f0f0', axis: '#d4d4d4', class0: '#2563eb', class1: '#d97706' },
}

function usePrefersDark() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(query.matches)
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return dark
}

// Class 0 is a blue circle, class 1 is an amber diamond, so the classes can be
// told apart without relying on color
export function ClassLegend() {
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
    </ul>
  )
}

export function DatasetPlot({ points, name }: { points: Point[]; name: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0)
  const dark = usePrefersDark()

  // The plot is a square that fills the available width
  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    const measure = () => setSize(Math.floor(Math.min(element.clientWidth, 520)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size === 0) return
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.floor(size * ratio)
    canvas.height = Math.floor(size * ratio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)

    const colors = dark ? COLORS.dark : COLORS.light
    context.fillStyle = colors.background
    context.fillRect(0, 0, size, size)

    // Data runs from -1 to 1 on both axes, with a little padding
    const pad = 12
    const toPixel = (value: number) => pad + ((value + 1) / 2) * (size - 2 * pad)
    const toPixelY = (value: number) => pad + ((1 - value) / 2) * (size - 2 * pad)

    context.lineWidth = 1
    ;[-0.5, 0.5].forEach((tick) => {
      context.strokeStyle = colors.grid
      context.beginPath()
      context.moveTo(toPixel(tick), pad)
      context.lineTo(toPixel(tick), size - pad)
      context.moveTo(pad, toPixelY(tick))
      context.lineTo(size - pad, toPixelY(tick))
      context.stroke()
    })
    context.strokeStyle = colors.axis
    context.beginPath()
    context.moveTo(toPixel(0), pad)
    context.lineTo(toPixel(0), size - pad)
    context.moveTo(pad, toPixelY(0))
    context.lineTo(size - pad, toPixelY(0))
    context.stroke()

    const radius = Math.max(3, size / 110)
    points.forEach((point) => {
      const x = toPixel(point.x)
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
    })
  }, [points, size, dark])

  const zeros = points.filter((point) => point.label === 0).length
  return (
    <div ref={wrapperRef} className="w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Scatter plot of the ${name} dataset: ${zeros} class 0 points drawn as circles and ${points.length - zeros} class 1 points drawn as diamonds.`}
        className="mx-auto block rounded-md ring-1 ring-neutral-200 dark:ring-neutral-800"
        style={{ width: size, height: size }}
      />
    </div>
  )
}
