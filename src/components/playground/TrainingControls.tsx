'use client'

import { useEffect, useState } from 'react'
import { l2Norm } from '@/lib/playground/metrics'
import { SPEEDS } from '@/lib/playground/protocol'
import type { Speed } from '@/lib/playground/protocol'
import type { Trainer } from './useTrainer'

export const buttonClass =
  'touch-manipulation rounded-md border border-neutral-200 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-800 dark:hover:bg-neutral-900'

const primaryClass =
  'rounded-md border border-blue-500 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-50 dark:border-[#47a3f3] dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900 dark:disabled:hover:bg-blue-950'

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${(value * 100).toFixed(0)}%`

// Four decimals for ordinary sizes, scientific notation for very small ones
const formatSmall = (value: number) => (value >= 0.001 ? value.toFixed(4) : value.toExponential(1))

function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-600 dark:text-neutral-400" title={hint}>
        {label}
      </dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  )
}

function statusText(trainer: Trainer) {
  if (trainer.phase === 'starting') return 'Starting the training engine…'
  if (trainer.phase === 'failed') return 'Training is unavailable'
  if (trainer.status === 'running') return 'Training'
  return trainer.step === 0 ? 'Ready' : 'Paused'
}

// Start, Pause, Step and Reset. This sits directly inside the dashboard panel and
// sticks to the bottom of the screen while the panel is in view, so on a phone the
// controls are always in reach while looking at the plot.
export function ControlBar({ trainer }: { trainer: Trainer }) {
  const ready = trainer.phase === 'ready'
  const running = trainer.status === 'running'
  return (
    <div
      role="group"
      aria-label="Training controls"
      className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-black"
    >
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
    </div>
  )
}

// Speed, the numbers, and any message about training
export function TrainingReadout({
  trainer,
  speed,
  onSpeedChange,
}: {
  trainer: Trainer
  speed: Speed
  onSpeedChange: (speed: Speed) => void
}) {
  const evaluation = trainer.evaluation
  const gradientNorm = evaluation?.gradientNorms ? l2Norm([evaluation.gradientNorms]) : null
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
      <label className="flex items-center gap-2 text-sm">
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

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-x-3 gap-y-2 text-sm">
        <Stat label="Status">
          <span className="flex items-center gap-2">
            {(running || trainer.phase === 'starting') && (
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none dark:bg-[#47a3f3]"
                aria-hidden="true"
              />
            )}
            {statusText(trainer)}
          </span>
        </Stat>
        <Stat label="Step">{trainer.step.toLocaleString('en-US')}</Stat>
        <Stat label="Loss">{trainer.loss === null ? '—' : trainer.loss.toFixed(4)}</Stat>
        <Stat label="Train accuracy" hint="Share of the training points the network classifies correctly">
          {percent(evaluation?.trainAccuracy)}
        </Stat>
        <Stat
          label="Test accuracy"
          hint="The same on held-out points the network never trains on, so it shows how well it generalizes"
        >
          {percent(evaluation?.testAccuracy)}
        </Stat>
        <Stat label="Gradient norm" hint="How big the gradients were at the latest step, over all the weights. It shrinks as training settles.">
          {gradientNorm === null ? '—' : formatSmall(gradientNorm)}
        </Stat>
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
