'use client'

import { useMemo, useState } from 'react'
import { DATASETS, DATASET_NAMES } from '@/lib/playground/datasets'
import type { Speed } from '@/lib/playground/protocol'
import type { Activation, DatasetName, NetworkConfig } from '@/lib/playground/types'
import { ClassLegend, DatasetPlot } from './DatasetPlot'
import { MetricsChart } from './MetricsChart'
import { NetworkEditor, learningRateFromExponent } from './NetworkEditor'
import { TrainingControls, buttonClass } from './TrainingControls'
import { useTrainer } from './useTrainer'

const SAMPLE_COUNT = 200
// Until the seed is a control (step 5), every run starts from the same weights
const NETWORK_SEED = 1

function Panel({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {badge && (
          <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

export function Playground() {
  const [dataset, setDataset] = useState<DatasetName>('xor')
  const [noise, setNoise] = useState(0.1)
  const [sampleSeed, setSampleSeed] = useState(1)

  const [hidden, setHidden] = useState([8])
  const [activation, setActivation] = useState<Activation>('tanh')
  const [learningRateExponent, setLearningRateExponent] = useState(-0.3)
  const [speed, setSpeed] = useState<Speed>('normal')

  const points = useMemo(
    () => DATASETS[dataset].generate(SAMPLE_COUNT, noise, sampleSeed),
    [dataset, noise, sampleSeed]
  )

  const config = useMemo<NetworkConfig>(
    () => ({
      hidden,
      activation,
      learningRate: learningRateFromExponent(learningRateExponent),
      seed: NETWORK_SEED,
    }),
    [hidden, activation, learningRateExponent]
  )

  const trainer = useTrainer({ config, points, speed })

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
        Work in progress. This page isn&apos;t linked from the rest of the site yet, and a few
        controls and views are still to come.
      </p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <Panel title="Training dashboard">
          <div role="radiogroup" aria-label="Dataset" className="mb-1 flex flex-wrap gap-2">
            {DATASET_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={dataset === name}
                onClick={() => setDataset(name)}
                className={`${buttonClass} ${
                  dataset === name
                    ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-[#47a3f3] dark:bg-blue-950 dark:text-blue-100'
                    : ''
                }`}
              >
                {DATASETS[name].label}
              </button>
            ))}
          </div>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            {DATASETS[dataset].description}
          </p>

          <DatasetPlot
            points={points}
            name={DATASETS[dataset].label}
            grid={trainer.grid}
            running={trainer.status === 'running'}
            step={trainer.step}
          />

          <div className="mt-3 space-y-3">
            <ClassLegend showPrediction={trainer.grid !== null} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex items-center gap-3 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Noise</span>
                <input
                  type="range"
                  min={0}
                  max={0.4}
                  step={0.05}
                  value={noise}
                  onChange={(event) => setNoise(Number(event.target.value))}
                  className="accent-blue-500"
                />
                <span className="w-10 tabular-nums">{noise.toFixed(2)}</span>
              </label>
              <button
                type="button"
                className={buttonClass}
                onClick={() => setSampleSeed(sampleSeed + 1)}
              >
                New sample
              </button>
            </div>
          </div>

          <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <TrainingControls trainer={trainer} speed={speed} onSpeedChange={setSpeed} />
          </div>

          <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <MetricsChart
              history={trainer.history}
              step={trainer.step}
              learningRate={config.learningRate}
            />
          </div>
        </Panel>

        <Panel title="Network editor">
          <NetworkEditor
            hidden={hidden}
            onHiddenChange={setHidden}
            activation={activation}
            onActivationChange={setActivation}
            learningRateExponent={learningRateExponent}
            onLearningRateExponentChange={setLearningRateExponent}
            engine={trainer.engine}
          />
        </Panel>
      </div>

      <Panel title="Autograd inspector" badge="Coming in step 7">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Click through the computation graph to see activations, weights and gradients.
        </p>
      </Panel>
    </div>
  )
}
