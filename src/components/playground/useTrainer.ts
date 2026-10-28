'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Speed, TrainerCommand, TrainerEvent, TrainerStatus } from '@/lib/playground/protocol'
import type { NetworkConfig, Point } from '@/lib/playground/types'

// 'starting' while the worker loads, 'failed' if it can't run at all
export type Phase = 'starting' | 'ready' | 'failed'

export type Trainer = ReturnType<typeof useTrainer>

// Runs the network in a Web Worker and mirrors its progress into React state.
// Changing the network structure, dataset or seed builds a fresh network (paused
// at step 0); changing the learning rate or speed does not.
export function useTrainer({
  config,
  points,
  speed,
}: {
  config: NetworkConfig
  points: Point[]
  speed: Speed
}) {
  const workerRef = useRef<Worker | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<Phase>('starting')
  const [status, setStatus] = useState<TrainerStatus>('paused')
  const [step, setStep] = useState(0)
  const [loss, setLoss] = useState<number | null>(null)
  const [engine, setEngine] = useState<{ label: string; note: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // The worker's startup handshake needs the latest values, not the ones from
  // when the effect was created
  const latest = useRef({ config, points, speed })
  latest.current = { config, points, speed }

  const send = useCallback((command: TrainerCommand) => {
    workerRef.current?.postMessage(command)
  }, [])

  useEffect(() => {
    setPhase('starting')
    setStatus('paused')
    setMessage(null)

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
  const structure = JSON.stringify([config.hidden, config.activation, config.seed])
  useEffect(() => {
    if (phase !== 'ready') return
    setMessage(null)
    send({ type: 'configure', config: latest.current.config, points })
  }, [phase, structure, points, send])

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
