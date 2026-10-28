'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { THEMES } from '@/data/terminal'
import { Prompt, TerminalOutput } from './TerminalOutput'
import { useTerminal } from './useTerminal'

const SUGGESTIONS = ['projects', 'neofetch', 'skills', 'whoami', 'help']

export default function Terminal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const onNavigate = useCallback(
    (path: string) => {
      router.push(path)
      onClose()
    },
    [router, onClose]
  )

  const { entries, input, setInput, onKeyDown, submit, theme, path } = useTerminal({
    onNavigate,
    onClose,
  })

  // Focus the prompt on open, hand focus back and unlock page scroll on close
  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()

    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('keydown', onEscape)
      document.body.style.overflow = previousOverflow
      returnFocus.current?.focus?.()
    }
  }, [open, onClose])

  useEffect(() => {
    const body = bodyRef.current
    if (open && body) body.scrollTop = body.scrollHeight
  }, [entries, open])

  if (!open) return null

  return (
    <div
      className={`term-overlay${expanded ? ' term-overlay-full' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Interactive terminal"
        className={`term-window${expanded ? ' term-window-full' : ''}`}
        style={THEMES[theme].vars as React.CSSProperties}
      >
        <div className="term-bar">
          <span className="term-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="term-title">brady@portfolio: {path}</span>
          <button
            type="button"
            className="term-button term-expand"
            aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
            onClick={() => {
              setExpanded(!expanded)
              inputRef.current?.focus()
            }}
          >
            {expanded ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="term-button"
            aria-label="Close terminal"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div
          ref={bodyRef}
          className="term-body"
          role="log"
          aria-live="polite"
          onClick={() => {
            // Don't steal the click when selecting text
            if (!window.getSelection()?.toString()) inputRef.current?.focus()
          }}
        >
          <TerminalOutput entries={entries} onNavigate={onNavigate} />

          <form
            className="term-inputline"
            onSubmit={(event) => {
              event.preventDefault()
              submit(input)
            }}
          >
            <Prompt path={path} />
            <input
              ref={inputRef}
              className="term-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Terminal command"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </form>

          <div className="term-hints">
            <span className="term-tone-dim">Try:</span>
            {SUGGESTIONS.map((command) => (
              <button
                key={command}
                type="button"
                className="term-chip"
                onClick={() => {
                  submit(command)
                  inputRef.current?.focus()
                }}
              >
                {command}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
