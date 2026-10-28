'use client'

import { useEffect, useState } from 'react'
import { SPEEDS } from '@/lib/playground/protocol'
import type { Speed } from '@/lib/playground/protocol'
import type { Trainer } from './useTrainer'

export const buttonClass =
  'rounded-md border border-neutral-200 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-800 dark:hover:bg-neutral-900'

const primaryClass =
  'rounded-md border border-blue-500 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-50 dark:border-[#47a3f3] dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900 dark:disabled:hover:bg-blue-950'

function statusText(trainer: Trainer) {
  if (trainer.phase === 'starting') return 'Starting the training engine…'
  if (trainer.phase === 'failed') return 'Training is unavailable'
  if (trainer.status === 'running') return 'Training'
  return trainer.step === 0 ? 'Ready' : 'Paused'
}

export function TrainingControls({
  trainer,
  speed,
  onSpeedChange,
}: {
  trainer: Trainer
  speed: Speed
  onSpeedChange: (speed: Speed) => void
}) {
  const ready = trainer.phase === 'ready'
  const running = trainer.status === 'running'

  // Screen readers hear changes of state, not every one of the 20 updates a second
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (trainer.phase !== 'ready') return
    setAnnouncement(
      trainer.status === 'running'
        ? 'Training started'
        : trainer.step === 0
          ? 'Training reset'
          : `Training paused at step ${trainer.step}`
    )
    // Only when the state changes, so step and loss are left out on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainer.phase, trainer.status])

  return (
    <div className="space-y-3" aria-busy={trainer.phase === 'starting'}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={!ready}
          onClick={running ? trainer.pause : trainer.start}
        >
          {running ? 'Pause' : trainer.step > 0 ? 'Resume' : 'Start'}
        </button>
        <button type="button" className={buttonClass} disabled={!ready || running} onClick={trainer.stepOnce}>
          Step
        </button>
        <button type="button" className={buttonClass} disabled={!ready} onClick={trainer.reset}>
          Reset
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Speed</span>
          <select
            value={speed}
            onChange={(event) => onSpeedChange(event.target.value as Speed)}
            className="rounded-md border border-neutral-200 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-800 dark:bg-black"
          >
            {(Object.keys(SPEEDS) as Speed[]).map((key) => (
              <option key={key} value={key}>
                {SPEEDS[key].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-neutral-600 dark:text-neutral-400">Status</dt>
          <dd className="flex items-center gap-2">
            {(running || trainer.phase === 'starting') && (
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500 dark:bg-[#47a3f3]" aria-hidden="true" />
            )}
            {statusText(trainer)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-600 dark:text-neutral-400">Step</dt>
          <dd className="tabular-nums">{trainer.step.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-600 dark:text-neutral-400">Loss</dt>
          <dd className="tabular-nums">{trainer.loss === null ? '—' : trainer.loss.toFixed(4)}</dd>
        </div>
      </dl>

      {trainer.message && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
        >
          <span className="flex-1">{trainer.message}</span>
          {trainer.phase === 'failed' ? (
            <button type="button" className={buttonClass} onClick={trainer.retry}>
              Try again
            </button>
          ) : (
            <button type="button" className={buttonClass} onClick={trainer.dismissMessage}>
              Dismiss
            </button>
          )}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
