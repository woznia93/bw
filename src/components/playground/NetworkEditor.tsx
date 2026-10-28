'use client'

import { MAX_HIDDEN_LAYERS, MAX_NEURONS } from '@/lib/playground/engine'
import type { Activation } from '@/lib/playground/types'
import { buttonClass } from './TrainingControls'

export const MIN_LEARNING_RATE_EXPONENT = -3
export const MAX_LEARNING_RATE_EXPONENT = 0.5

// The slider is on a log scale: its value is the exponent of the learning rate
export const learningRateFromExponent = (exponent: number) =>
  Number((10 ** exponent).toPrecision(2))

const ACTIVATIONS: { value: Activation; label: string }[] = [
  { value: 'relu', label: 'ReLU' },
  { value: 'tanh', label: 'Tanh' },
]

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  decreaseLabel: string
  increaseLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${buttonClass} h-7 w-7 px-0 py-0`}
          aria-label={decreaseLabel}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <span className="w-6 text-center tabular-nums" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          className={`${buttonClass} h-7 w-7 px-0 py-0`}
          aria-label={increaseLabel}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function NetworkEditor({
  hidden,
  onHiddenChange,
  activation,
  onActivationChange,
  learningRateExponent,
  onLearningRateExponentChange,
  engine,
}: {
  hidden: number[]
  onHiddenChange: (hidden: number[]) => void
  activation: Activation
  onActivationChange: (activation: Activation) => void
  learningRateExponent: number
  onLearningRateExponentChange: (exponent: number) => void
  engine: { label: string; note: string } | null
}) {
  const learningRate = learningRateFromExponent(learningRateExponent)

  const setLayerCount = (count: number) => {
    if (count < hidden.length) onHiddenChange(hidden.slice(0, count))
    else onHiddenChange([...hidden, hidden[hidden.length - 1] ?? 4])
  }
  const setWidth = (index: number, width: number) =>
    onHiddenChange(hidden.map((current, i) => (i === index ? width : current)))

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Stepper
          label="Hidden layers"
          value={hidden.length}
          min={0}
          max={MAX_HIDDEN_LAYERS}
          onChange={setLayerCount}
          decreaseLabel="Remove a hidden layer"
          increaseLabel="Add a hidden layer"
        />
        {hidden.map((width, index) => (
          <Stepper
            key={index}
            label={`Layer ${index + 1} neurons`}
            value={width}
            min={1}
            max={MAX_NEURONS}
            onChange={(next) => setWidth(index, next)}
            decreaseLabel={`Fewer neurons in layer ${index + 1}`}
            increaseLabel={`More neurons in layer ${index + 1}`}
          />
        ))}
        {hidden.length === 0 && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            With no hidden layers the network can only draw a straight line.
          </p>
        )}
      </div>

      <div role="radiogroup" aria-label="Activation function" className="space-y-2">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Activation</p>
        <div className="flex gap-2">
          {ACTIVATIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={activation === value}
              onClick={() => onActivationChange(value)}
              className={`${buttonClass} ${
                activation === value
                  ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-[#47a3f3] dark:bg-blue-950 dark:text-blue-100'
                  : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-2 text-sm">
        <span className="flex items-center justify-between">
          <span className="text-neutral-600 dark:text-neutral-400">Learning rate</span>
          <span className="tabular-nums">{learningRate}</span>
        </span>
        <input
          type="range"
          min={MIN_LEARNING_RATE_EXPONENT}
          max={MAX_LEARNING_RATE_EXPONENT}
          step={0.05}
          value={learningRateExponent}
          aria-valuetext={String(learningRate)}
          onChange={(event) => onLearningRateExponentChange(Number(event.target.value))}
          className="w-full accent-blue-500"
        />
      </label>

      <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">
          Engine: {engine ? engine.label : 'starting…'}
        </p>
        {engine && <p className="mt-1">{engine.note}</p>}
      </div>
    </div>
  )
}
