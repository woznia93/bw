'use client'

import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { buttonClass } from './TrainingControls'

export const selectedClass =
  'border-blue-500 bg-blue-50 text-blue-900 dark:border-[#47a3f3] dark:bg-blue-950 dark:text-blue-100'

// A row of choices where one is selected, following the standard keyboard pattern
// for radio buttons: Tab moves into and out of the group, and the arrow keys move
// between the choices (selecting as they go).
export function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (event: KeyboardEvent, from: number) => {
    const last = options.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = from === last ? 0 : from + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = from === 0 ? last : from - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return
    event.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            // Only the selected choice is a tab stop; the arrow keys reach the others
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={`${buttonClass} ${checked ? selectedClass : ''}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
