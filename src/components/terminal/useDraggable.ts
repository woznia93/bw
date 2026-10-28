'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'

// How much of the window must stay on screen, so it can always be dragged back
const KEEP_X = 120
const KEEP_Y = 40

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

// Lets a window be moved by its title bar. `offset` is how far it is from its
// starting (centered) position, so the layout still decides where it begins.
export function useDraggable(windowRef: RefObject<HTMLElement>) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{
    pointerX: number
    pointerY: number
    offset: { x: number; y: number }
    rect: DOMRect
  } | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const element = windowRef.current
    const onButton = (event.target as HTMLElement).closest('button')
    // Phones show the terminal full screen, so there is nothing to move
    const fullScreen = window.matchMedia('(max-width: 640px)').matches
    if (!element || onButton || fullScreen || (event.pointerType === 'mouse' && event.button !== 0)) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offset,
      rect: element.getBoundingClientRect(),
    }
    setDragging(true)
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = drag.current
    if (!start) return
    const left = clamp(
      start.rect.left + event.clientX - start.pointerX,
      KEEP_X - start.rect.width,
      window.innerWidth - KEEP_X
    )
    const top = clamp(
      start.rect.top + event.clientY - start.pointerY,
      0,
      window.innerHeight - KEEP_Y
    )
    setOffset({
      x: start.offset.x + (left - start.rect.left),
      y: start.offset.y + (top - start.rect.top),
    })
  }

  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), [])

  // If the browser window shrinks, pull the terminal back into view
  useEffect(() => {
    const onResize = () => {
      const element = windowRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const dx =
        clamp(rect.left, KEEP_X - rect.width, window.innerWidth - KEEP_X) - rect.left
      const dy = clamp(rect.top, 0, window.innerHeight - KEEP_Y) - rect.top
      if (dx || dy) setOffset((current) => ({ x: current.x + dx, y: current.y + dy }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [windowRef])

  return {
    offset,
    dragging,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
