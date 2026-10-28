'use client'

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

export function usePrefersDark() {
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

// The width of an element, kept up to date as the page is resized
export function useElementWidth(ref: RefObject<HTMLElement>, max = Infinity) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setWidth(Math.floor(Math.min(element.clientWidth, max)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, max])
  return width
}

// Size a canvas for sharp drawing on high-density screens and return a context
// whose units are CSS pixels
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const ratio = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.floor(width * ratio)
  canvas.height = Math.floor(height * ratio)
  const context = canvas.getContext('2d')
  context?.scale(ratio, ratio)
  return context
}
