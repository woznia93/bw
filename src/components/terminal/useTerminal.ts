'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { PROFILE, THEMES } from '@/data/terminal'
import { execute } from '@/lib/terminal/commands'
import { complete } from '@/lib/terminal/completion'
import { displayPath } from '@/lib/terminal/filesystem'
import type { Effect, Line, Project } from '@/lib/terminal/types'

export type Entry =
  | { id: number; kind: 'cmd'; prompt: string; input: string }
  | { id: number; kind: 'out'; lines: Line[] }

type NewEntry =
  | { kind: 'cmd'; prompt: string; input: string }
  | { kind: 'out'; lines: Line[] }

const THEME_KEY = 'terminal-theme'

const WELCOME: Line[] = [
  [{ text: 'Welcome to bradysh v1.0.', tone: 'accent2' }],
  [{ text: "Type 'help' to get started.", tone: 'dim' }],
  [],
]

function readTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (saved && THEMES[saved]) return saved
  } catch {
    // Storage can be blocked, the default theme is fine
  }
  return 'blue'
}

export function useTerminal({
  onNavigate,
  onClose,
}: {
  onNavigate: (path: string) => void
  onClose: () => void
}) {
  const nextId = useRef(1)
  const startedAt = useRef(Date.now())
  const [entries, setEntries] = useState<Entry[]>(() => [
    { id: 0, kind: 'out', lines: WELCOME },
  ])
  const [cwd, setCwd] = useState<string[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [theme, setTheme] = useState('blue')
  const [projects, setProjects] = useState<Project[]>([])
  // Where we are in the history while pressing up/down; null means a fresh line
  const [cursor, setCursor] = useState<number | null>(null)
  const draft = useRef('')

  useEffect(() => {
    setTheme(readTheme())
    let cancelled = false
    fetch('/api/terminal/content')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setProjects(data.projects ?? [])
      })
      .catch(() => {
        // Without projects the other commands still work
      })
    return () => {
      cancelled = true
    }
  }, [])

  const add = useCallback((entry: NewEntry) => {
    return { ...entry, id: nextId.current++ } as Entry
  }, [])

  const session = useCallback(
    () => ({ cwd, projects, theme, history, startedAt: startedAt.current, now: Date.now() }),
    [cwd, projects, theme, history]
  )

  const runEffects = useCallback(
    (effects: Effect[]) => {
      effects.forEach((effect) => {
        if (effect.type === 'theme') {
          setTheme(effect.name)
          try {
            window.localStorage.setItem(THEME_KEY, effect.name)
          } catch {
            // Not saving the choice is harmless
          }
        } else if (effect.type === 'navigate') {
          onNavigate(effect.path)
        } else if (effect.type === 'external') {
          window.open(effect.url, '_blank', 'noopener,noreferrer')
        } else if (effect.type === 'close') {
          onClose()
        }
      })
    },
    [onNavigate, onClose]
  )

  const clear = useCallback(() => setEntries([]), [])

  const submit = useCallback(
    (raw: string) => {
      const command = raw.trim()
      const prompt = displayPath(cwd)
      setInput('')
      setCursor(null)

      if (!command) {
        setEntries((prev) => prev.concat(add({ kind: 'cmd', prompt, input: '' })))
        return
      }

      const result = execute(command, session())
      const effects = result.effects ?? []
      const clearing = effects.some((effect) => effect.type === 'clear')

      setHistory((prev) => (prev[prev.length - 1] === command ? prev : prev.concat(command)))
      if (result.cwd) setCwd(result.cwd)

      setEntries((prev) => {
        const next = clearing ? [] : prev.concat(add({ kind: 'cmd', prompt, input: command }))
        return result.out.length && !clearing
          ? next.concat(add({ kind: 'out', lines: result.out }))
          : next
      })
      runEffects(effects)
    },
    [add, cwd, runEffects, session]
  )

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const prompt = displayPath(cwd)

    if (event.key === 'Enter') {
      event.preventDefault()
      submit(input)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (history.length === 0) return
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1)
      if (cursor === null) draft.current = input
      setCursor(next)
      setInput(history[next])
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (cursor === null) return
      if (cursor >= history.length - 1) {
        setCursor(null)
        setInput(draft.current)
      } else {
        setCursor(cursor + 1)
        setInput(history[cursor + 1])
      }
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const { value, options } = complete(input, session())
      if (options.length > 1) {
        setEntries((prev) =>
          prev.concat(
            add({ kind: 'cmd', prompt, input }),
            add({
              kind: 'out',
              lines: [options.map((option) => ({ text: `${option}  `, tone: 'accent' as const }))],
            })
          )
        )
      }
      setInput(value)
    } else if (event.ctrlKey && event.key.toLowerCase() === 'l') {
      event.preventDefault()
      clear()
    } else if (event.ctrlKey && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      setEntries((prev) => prev.concat(add({ kind: 'cmd', prompt, input: `${input}^C` })))
      setInput('')
      setCursor(null)
    }
  }

  return {
    entries,
    input,
    setInput,
    onKeyDown,
    submit,
    theme,
    prompt: `${PROFILE.user}@${PROFILE.host}`,
    path: displayPath(cwd),
  }
}
