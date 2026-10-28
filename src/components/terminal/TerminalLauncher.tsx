'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// The terminal's code and content only load once someone opens it
const Terminal = dynamic(() => import('./Terminal'), { ssr: false })

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    element.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(element.tagName) !== -1
  )
}

export function TerminalLauncher() {
  const [open, setOpen] = useState(false)
  // Stays mounted after the first open so the session (history, folder, theme) is kept
  const [loaded, setLoaded] = useState(false)

  const show = useCallback(() => {
    setLoaded(true)
    setOpen(true)
  }, [])
  const hide = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) hide()
        else show()
        return
      }
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey
      if (plain && (event.key === '~' || event.key === '`') && !isTyping(event.target)) {
        event.preventDefault()
        if (open) hide()
        else show()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, show, hide])

  return (
    <>
      {!open && (
        <button
          type="button"
          className="term-fab"
          aria-label="Open terminal (Ctrl+K)"
          title="Open terminal (Ctrl+K)"
          onClick={show}
          onMouseEnter={() => import('./Terminal')}
          onFocus={() => import('./Terminal')}
        >
          <span aria-hidden="true">&gt;_</span>
        </button>
      )}
      {loaded && <Terminal open={open} onClose={hide} />}
    </>
  )
}
