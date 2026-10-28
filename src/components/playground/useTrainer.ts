'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { appendHistory } from '@/lib/playground/history'
import type { LossPoint } from '@/lib/playground/history'
import type {
  Evaluation,
  Speed,
  TrainerCommand,
  TrainerEvent,
  TrainerStatus,
} from '@/lib/playground/protocol'
import type { NetworkConfig, Point } from '@/lib/playground/types'

// How many points of loss history the page keeps; older ones are thinned out
const MAX_HISTORY = 1500

// 'starting' while the worker loads, 'failed' if it can't run at all
export type Phase = 'starting' | 'ready' | 'failed'

export type Trainer = ReturnType<typeof useTrainer>

// Runs the network in a Web Worker and mirrors its progress into React state.
// Changing the network structure, dataset or seed builds a fresh network (paused
// at step 0); changing the learning rate or speed does not.
export function useTrainer({
  config,
  points,
  testPoints,
  speed,
}: {
  config: NetworkConfig
  points: Point[]
  testPoints: Point[]
  speed: Speed
}) {
  const workerRef = useRef<Worker | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<Phase>('starting')
  const [status, setStatus] = useState<TrainerStatus>('paused')
  const [step, setStep] = useState(0)
  const [loss, setLoss] = useState<number | null>(null)
  // The latest evaluation (boundary, accuracies, weights), which keeps showing until a newer one arrives
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [history, setHistory] = useState<LossPoint[]>([])
  const [testHistory, setTestHistory] = useState<LossPoint[]>([])
  const [engine, setEngine] = useState<{ label: string; note: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // The worker's startup handshake needs the latest values, not the ones from
  // when the effect was created
  const run = useRef(0)
  const latest = useRef({ config, points, testPoints, speed })
  latest.current = { config, points, testPoints, speed }

  const send = useCallback((command: TrainerCommand) => {
    workerRef.current?.postMessage(command)
  }, [])

  useEffect(() => {
    setPhase('starting')
    setStatus('paused')
    setMessage(null)
    run.current = 0

    let worker: Worker
    try {
      worker = new Worker(new URL('../../workers/training.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      setPhase('failed')
      setMessage("This browser couldn't start the training engine.")
      return
    }
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<TrainerEvent>) => {
      const data = event.data
      if (data.type === 'ready') {
        setEngine(data.engine)
        setPhase('ready')
      } else if (data.type === 'snapshot') {
        setStatus(data.status)
        setStep(data.step)
        setLoss(data.loss)
        const newRun = data.run !== run.current
        run.current = data.run
        if (data.evaluation) setEvaluation(data.evaluation)
        // A new run clears the loss curves; otherwise the new points are added to them
        if (newRun) setHistory(data.losses)
        else if (data.losses.length > 0) {
          setHistory((current) => appendHistory(current, data.losses, MAX_HISTORY))
        }
        const testLoss = data.evaluation?.testLoss ?? null
        if (newRun) setTestHistory([])
        else if (testLoss !== null && data.step > 0) {
          setTestHistory((current) =>
            current[current.length - 1]?.step === data.step
              ? current
              : appendHistory(current, [{ step: data.step, loss: testLoss }], MAX_HISTORY)
          )
        }
      } else if (data.type === 'error') {
        setMessage(data.message)
      }
    }
    worker.onerror = () => {
      setPhase('failed')
      setStatus('paused')
      setMessage('The training engine stopped unexpectedly.')
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [attempt])

  // A new network whenever its shape, activation, seed or the data change
  const structure = JSON.stringify([config.hidden, config.activation, config.optimizer, config.seed])
  useEffect(() => {
    if (phase !== 'ready') return
    setMessage(null)
    send({
      type: 'configure',
      config: latest.current.config,
      points,
      testPoints: latest.current.testPoints,
    })
  }, [phase, structure, points, testPoints, send])

  useEffect(() => {
    if (phase === 'ready') send({ type: 'setLearningRate', learningRate: config.learningRate })
  }, [phase, config.learningRate, send])

  useEffect(() => {
    if (phase === 'ready') send({ type: 'setSpeed', speed })
  }, [phase, speed, send])

  return {
    phase,
    status,
    step,
    loss,
    evaluation,
    history,
    testHistory,
    engine,
    message,
    dismissMessage: () => setMessage(null),
    start: () => send({ type: 'start' }),
    pause: () => send({ type: 'pause' }),
    stepOnce: () => send({ type: 'step' }),
    reset: () => {
      setMessage(null)
      send({ type: 'reset' })
    },
    retry: () => setAttempt((count) => count + 1),
  }
}
