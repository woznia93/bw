'use client'

import { useMemo, useState } from 'react'
import { DATASETS, DATASET_NAMES } from '@/lib/playground/datasets'
import type { Speed } from '@/lib/playground/protocol'
import type { Activation, DatasetName, NetworkConfig, Optimizer } from '@/lib/playground/types'
import { ClassLegend, DatasetPlot } from './DatasetPlot'
import { MetricsChart } from './MetricsChart'
import { DEFAULT_LEARNING_RATE, NetworkEditor, learningRateFromExponent } from './NetworkEditor'
import { NetworkGraph } from './NetworkGraph'
import { RadioGroup } from './RadioGroup'
import { ControlBar, TrainingReadout, buttonClass } from './TrainingControls'
import { useTrainer } from './useTrainer'

const SAMPLE_COUNT = 200
// The held-out test points come from the same dataset with a different seed, so
// they are new points from the same distribution
const TEST_SEED_OFFSET = 1_000_003

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

const DATASET_OPTIONS: { value: DatasetName; label: string }[] = DATASET_NAMES.map((name) => ({
  value: name,
  label: DATASETS[name].label,
}))

export function Playground() {
  const [dataset, setDataset] = useState<DatasetName>('xor')
  const [noise, setNoise] = useState(0.1)
  const [sampleSeed, setSampleSeed] = useState(1)

  const [hidden, setHidden] = useState([8])
  const [activation, setActivation] = useState<Activation>('tanh')
  const [optimizer, setOptimizer] = useState<Optimizer>('sgd')
  const [learningRateExponent, setLearningRateExponent] = useState(Math.log10(DEFAULT_LEARNING_RATE.sgd))
  const [networkSeed, setNetworkSeed] = useState(1)
  const [speed, setSpeed] = useState<Speed>('normal')

  const points = useMemo(
    () => DATASETS[dataset].generate(SAMPLE_COUNT, noise, sampleSeed),
    [dataset, noise, sampleSeed]
  )
  const testPoints = useMemo(
    () => DATASETS[dataset].generate(SAMPLE_COUNT, noise, sampleSeed + TEST_SEED_OFFSET),
    [dataset, noise, sampleSeed]
  )

  const config = useMemo<NetworkConfig>(
    () => ({
      hidden,
      activation,
      optimizer,
      learningRate: learningRateFromExponent(learningRateExponent),
      seed: networkSeed,
    }),
    [hidden, activation, optimizer, learningRateExponent, networkSeed]
  )

  const trainer = useTrainer({ config, points, testPoints, speed })
  const evaluation = trainer.evaluation

  const changeOptimizer = (next: Optimizer) => {
    setOptimizer(next)
    setLearningRateExponent(Math.log10(DEFAULT_LEARNING_RATE[next]))
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
        Work in progress. This page isn&apos;t linked from the rest of the site yet, and a few
        views are still to come.
      </p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <Panel title="Training dashboard">
          <div className="space-y-3">
            <RadioGroup
              label="Dataset"
              options={DATASET_OPTIONS}
              value={dataset}
              onChange={(next) => setDataset(next)}
            />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{DATASETS[dataset].description}</p>
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
              <button type="button" className={buttonClass} onClick={() => setSampleSeed(sampleSeed + 1)}>
                New sample
              </button>
            </div>
          </div>

          <div className="mt-4">
            <DatasetPlot
              points={points}
              name={DATASETS[dataset].label}
              grid={evaluation?.grid ?? null}
              running={trainer.status === 'running'}
              step={trainer.step}
            />
          </div>
          <div className="mt-3">
            <ClassLegend showPrediction={evaluation !== null} />
          </div>

          <ControlBar trainer={trainer} />

          <div className="pt-1">
            <TrainingReadout trainer={trainer} speed={speed} onSpeedChange={setSpeed} />
          </div>

          <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <MetricsChart
              history={trainer.history}
              testHistory={trainer.testHistory}
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
            optimizer={optimizer}
            onOptimizerChange={changeOptimizer}
            learningRateExponent={learningRateExponent}
            onLearningRateExponentChange={setLearningRateExponent}
            seed={networkSeed}
            onSeedChange={setNetworkSeed}
            engine={trainer.engine}
          />
        </Panel>
      </div>

      <Panel title="Network weights">
        <NetworkGraph
          hidden={hidden}
          parameters={evaluation?.parameters ?? null}
          gradientNorms={evaluation?.gradientNorms ?? null}
        />
      </Panel>

      <Panel title="Autograd inspector" badge="Coming in step 7">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Click through the computation graph to see activations, weights and gradients.
        </p>
      </Panel>
    </div>
  )
}
