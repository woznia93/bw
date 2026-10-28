'use client'

import { useEffect, useState } from 'react'
import { MAX_HIDDEN_LAYERS, MAX_NEURONS } from '@/lib/playground/engine'
import type { Activation, Optimizer } from '@/lib/playground/types'
import { RadioGroup } from './RadioGroup'
import { buttonClass } from './TrainingControls'

export const MIN_LEARNING_RATE_EXPONENT = -3
export const MAX_LEARNING_RATE_EXPONENT = 0.5
export const MAX_SEED = 999999

// The slider is on a log scale: its value is the exponent of the learning rate
export const learningRateFromExponent = (exponent: number) =>
  Number((10 ** exponent).toPrecision(2))

// A learning rate that works well for each optimizer; they aren't interchangeable
// (Adam takes much smaller steps than plain SGD)
export const DEFAULT_LEARNING_RATE: Record<Optimizer, number> = {
  sgd: 0.5,
  momentum: 0.1,
  adam: 0.05,
}

const ACTIVATIONS: { value: Activation; label: string }[] = [
  { value: 'relu', label: 'ReLU' },
  { value: 'tanh', label: 'Tanh' },
  { value: 'sigmoid', label: 'Sigmoid' },
]

const OPTIMIZERS: { value: Optimizer; label: string }[] = [
  { value: 'sgd', label: 'SGD' },
  { value: 'momentum', label: 'Momentum' },
  { value: 'adam', label: 'Adam' },
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
  const small = `${buttonClass} h-8 w-8 px-0 py-0`
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={small}
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
          className={small}
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

// A whole number from 0 to MAX_SEED. Typing is kept as text so that it can be
// edited freely, and only a valid number is passed on.
function SeedField({ seed, onChange }: { seed: number; onChange: (seed: number) => void }) {
  const [text, setText] = useState(String(seed))
  useEffect(() => setText(String(seed)), [seed])

  const commit = (value: string) => {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_SEED) {
      onChange(parsed)
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor="seed" className="block text-sm text-neutral-600 dark:text-neutral-400">
        Random seed
      </label>
      <div className="flex items-center gap-2">
        <input
          id="seed"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          aria-describedby="seed-hint"
          aria-invalid={text !== String(seed)}
          onChange={(event) => {
            setText(event.target.value)
            commit(event.target.value)
          }}
          onBlur={() => setText(String(seed))}
          className="w-24 rounded-md border border-neutral-200 bg-transparent px-2 py-1.5 text-sm tabular-nums dark:border-neutral-800"
        />
        <button
          type="button"
          className={buttonClass}
          onClick={() => onChange(Math.floor(Math.random() * (MAX_SEED + 1)))}
        >
          Randomize
        </button>
      </div>
      <p id="seed-hint" className="text-xs text-neutral-600 dark:text-neutral-400">
        The same seed always gives the same starting weights. Whole numbers from 0 to {MAX_SEED.toLocaleString('en-US')}.
      </p>
    </div>
  )
}

export function NetworkEditor({
  hidden,
  onHiddenChange,
  activation,
  onActivationChange,
  optimizer,
  onOptimizerChange,
  learningRateExponent,
  onLearningRateExponentChange,
  seed,
  onSeedChange,
  engine,
}: {
  hidden: number[]
  onHiddenChange: (hidden: number[]) => void
  activation: Activation
  onActivationChange: (activation: Activation) => void
  optimizer: Optimizer
  onOptimizerChange: (optimizer: Optimizer) => void
  learningRateExponent: number
  onLearningRateExponentChange: (exponent: number) => void
  seed: number
  onSeedChange: (seed: number) => void
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

      <div className="space-y-2">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Activation</p>
        <RadioGroup
          label="Activation function"
          options={ACTIVATIONS}
          value={activation}
          onChange={onActivationChange}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Optimizer</p>
        <RadioGroup label="Optimizer" options={OPTIMIZERS} value={optimizer} onChange={onOptimizerChange} />
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Switching optimizer picks a learning rate that suits it, and starts training over.
        </p>
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

      <SeedField seed={seed} onChange={onSeedChange} />

      <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">
          Engine: {engine ? engine.label : 'starting…'}
        </p>
        {engine && <p className="mt-1">{engine.note}</p>}
      </div>
    </div>
  )
}
