import { describe, expect, it } from 'vitest'
import { DATASETS } from './datasets'
import { ReferenceEngine } from './engine'
import type { TrainerCommand, TrainerEvent } from './protocol'
import {
  MAX_STEPS_PER_TICK,
  SNAPSHOT_MS,
  TICK_MS,
  TrainingSession,
  type Scheduler,
} from './session'
import type { NetworkConfig, NetworkEngine } from './types'

// A clock the test controls: nothing runs until advance() moves time forward
function fakeClock() {
  let time = 0
  let nextId = 1
  const tasks = new Map<number, { at: number; run: () => void }>()
  const scheduler: Scheduler = {
    now: () => time,
    setTimeout: (callback, ms) => {
      const id = nextId++
      tasks.set(id, { at: time + ms, run: callback })
      return id
    },
    clearTimeout: (handle) => {
      tasks.delete(handle as number)
    },
  }
  return {
    scheduler,
    pending: () => tasks.size,
    advance(ms: number) {
      const end = time + ms
      for (;;) {
        const due = Array.from(tasks.entries())
          .filter(([, task]) => task.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        tasks.delete(due[0])
        time = Math.max(time, due[1].at)
        due[1].run()
      }
      time = end
    },
  }
}

const config: NetworkConfig = { hidden: [8], activation: 'tanh', learningRate: 0.5, seed: 1 }
const points = DATASETS.xor.generate(100, 0.1, 1)

function setup(engine: NetworkEngine = new ReferenceEngine()) {
  const clock = fakeClock()
  const events: TrainerEvent[] = []
  const session = new TrainingSession(engine, (event) => events.push(event), clock.scheduler)
  const send = (command: TrainerCommand) => session.handle(command)
  const snapshots = () => events.filter((e) => e.type === 'snapshot') as Extract<TrainerEvent, { type: 'snapshot' }>[]
  const errors = () => events.filter((e) => e.type === 'error') as Extract<TrainerEvent, { type: 'error' }>[]
  const last = () => snapshots()[snapshots().length - 1]
  return { clock, events, send, snapshots, errors, last }
}

const configure: TrainerCommand = { type: 'configure', config, points }

// The losses a plain engine produces, for checking the session doesn't change them
function referenceLosses(count: number, learningRate = config.learningRate) {
  const engine = new ReferenceEngine()
  engine.initialize({ ...config, learningRate })
  engine.setDataset(points)
  return Array.from({ length: count }, () => engine.trainStep())
}

describe('configure', () => {
  it('starts paused at step 0 with no loss yet', () => {
    const { send, last } = setup()
    send(configure)
    expect(last()).toEqual({ type: 'snapshot', status: 'paused', step: 0, loss: null })
  })

  it('reconfiguring while running stops training and starts over', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    clock.advance(500)
    expect(last().step).toBeGreaterThan(0)

    send({ ...configure, config: { ...config, hidden: [4, 4] } })
    expect(last()).toEqual({ type: 'snapshot', status: 'paused', step: 0, loss: null })
    expect(clock.pending()).toBe(0)
  })

  it('reports a bad configuration instead of crashing', () => {
    const { send, errors } = setup()
    send({ ...configure, config: { ...config, learningRate: -1 } })
    expect(errors()[0].message).toMatch(/learning rate/)
    send({ ...configure, points: [] })
    expect(errors()[1].message).toMatch(/no points/)
    // and is not usable until set up properly
    send({ type: 'step' })
    expect(errors()[2].message).toMatch(/not been set up/)
  })
})

describe('step', () => {
  it('does exactly one step and reports it', () => {
    const { send, last } = setup()
    send(configure)
    send({ type: 'step' })
    expect(last().step).toBe(1)
    expect(last().status).toBe('paused')
    expect(last().loss).toBe(referenceLosses(1)[0])
  })

  it('pauses a running session first', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    clock.advance(200)
    send({ type: 'step' })
    const stopped = last().step
    clock.advance(1000)
    expect(last().step).toBe(stopped)
    expect(last().status).toBe('paused')
  })
})

describe('start and pause', () => {
  it('trains at the chosen speed without changing the numbers', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'setSpeed', speed: 'normal' }) // 100 steps per second
    send({ type: 'start' })
    expect(last().status).toBe('running')
    clock.advance(1000)
    expect(last().step).toBeGreaterThanOrEqual(95)
    expect(last().step).toBeLessThanOrEqual(105)
    expect(last().loss).toBe(referenceLosses(last().step)[last().step - 1])
  })

  it.each([
    ['slow', 20],
    ['fast', 600],
  ] as const)('%s speed runs about %d steps per second', (speed, perSecond) => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'setSpeed', speed })
    send({ type: 'start' })
    clock.advance(2000)
    expect(last().step).toBeGreaterThan(perSecond * 2 * 0.9)
    expect(last().step).toBeLessThan(perSecond * 2 * 1.1)
  })

  it('max speed is limited per tick so the worker can still hear commands', () => {
    // Count the engine's own steps, since progress reports are throttled
    const engine = new ReferenceEngine()
    let steps = 0
    const original = engine.trainStep.bind(engine)
    engine.trainStep = () => {
      steps++
      return original()
    }
    const { send, clock } = setup(engine)
    send(configure)
    send({ type: 'setSpeed', speed: 'max' })
    send({ type: 'start' })
    clock.advance(TICK_MS)
    expect(steps).toBeGreaterThan(0)
    expect(steps).toBeLessThanOrEqual(MAX_STEPS_PER_TICK)
  })

  it('stops the tick loop when the time budget runs out', () => {
    // An engine that is slow: each step costs 5 ms on the fake clock
    const clock = fakeClock()
    let steps = 0
    const slow = new ReferenceEngine()
    const original = slow.trainStep.bind(slow)
    slow.trainStep = () => {
      steps++
      clock.advance(0)
      return original()
    }
    const session = new TrainingSession(slow, () => {}, {
      ...clock.scheduler,
      now: () => clock.scheduler.now() + steps * 5,
    })
    session.handle(configure)
    session.handle({ type: 'setSpeed', speed: 'max' })
    session.handle({ type: 'start' })
    clock.advance(TICK_MS)
    // 12 ms budget at 5 ms a step: only a few steps, not the 2000-step safety limit
    expect(steps).toBeGreaterThan(0)
    expect(steps).toBeLessThan(10)
  })

  it('pause stops training immediately and keeps the state', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    clock.advance(300)
    send({ type: 'pause' })
    const paused = last()
    expect(paused.status).toBe('paused')
    expect(clock.pending()).toBe(0)
    clock.advance(1000)
    expect(last()).toEqual(paused)
  })

  it('starting twice does not run two loops', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    send({ type: 'start' })
    expect(clock.pending()).toBe(1)
    clock.advance(1000)
    expect(last().step).toBeLessThanOrEqual(105)
  })

  it('can resume after pausing and continues the same run', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    clock.advance(300)
    send({ type: 'pause' })
    const before = last().step
    send({ type: 'start' })
    clock.advance(300)
    expect(last().step).toBeGreaterThan(before)
    expect(last().loss).toBe(referenceLosses(last().step)[last().step - 1])
  })

  it('does not report progress more often than the snapshot interval', () => {
    const { send, clock, snapshots } = setup()
    send(configure)
    send({ type: 'setSpeed', speed: 'fast' })
    send({ type: 'start' })
    const before = snapshots().length
    clock.advance(1000)
    // About one per SNAPSHOT_MS, not one per tick
    const posted = snapshots().length - before
    expect(posted).toBeLessThanOrEqual(Math.ceil(1000 / SNAPSHOT_MS) + 1)
    expect(posted).toBeGreaterThan(5)
  })

  it('refuses to start before the network is set up', () => {
    const { send, errors, clock } = setup()
    send({ type: 'start' })
    expect(errors()[0].message).toMatch(/not been set up/)
    expect(clock.pending()).toBe(0)
  })
})

describe('reset and learning rate', () => {
  it('reset goes back to the start and repeats the same run', () => {
    const { send, last } = setup()
    send(configure)
    for (let i = 0; i < 25; i++) send({ type: 'step' })
    const firstRun = last().loss
    send({ type: 'reset' })
    expect(last()).toEqual({ type: 'snapshot', status: 'paused', step: 0, loss: null })
    for (let i = 0; i < 25; i++) send({ type: 'step' })
    expect(last().loss).toBe(firstRun)
  })

  it('reset stops a running session', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    clock.advance(200)
    send({ type: 'reset' })
    clock.advance(1000)
    expect(last()).toEqual({ type: 'snapshot', status: 'paused', step: 0, loss: null })
  })

  it('a new learning rate applies from the next step without resetting', () => {
    const { send, last } = setup()
    send(configure)
    send({ type: 'step' })
    send({ type: 'setLearningRate', learningRate: 0.05 })
    send({ type: 'step' })
    send({ type: 'step' })
    expect(last().step).toBe(3)
    // A step's loss is measured before its update, so the new rate (used for the
    // update in step 2) first shows in step 3's loss
    const engine = new ReferenceEngine()
    engine.initialize(config)
    engine.setDataset(points)
    engine.trainStep()
    engine.setLearningRate(0.05)
    engine.trainStep()
    expect(last().loss).toBe(engine.trainStep())
    expect(last().loss).not.toBe(referenceLosses(3)[2])
  })

  it('rejects a bad learning rate and keeps going with the old one', () => {
    const { send, errors, last } = setup()
    send(configure)
    send({ type: 'setLearningRate', learningRate: 0 })
    expect(errors()[0].message).toMatch(/learning rate/)
    send({ type: 'step' })
    expect(last().loss).toBe(referenceLosses(1)[0])
  })
})

describe('when training goes wrong', () => {
  it('pauses and says so if the loss stops being a number', () => {
    const broken = new ReferenceEngine()
    let calls = 0
    broken.trainStep = () => (++calls > 3 ? NaN : 0.7)
    const { send, clock, last, errors } = setup(broken)
    send(configure)
    send({ type: 'start' })
    clock.advance(500)
    expect(errors()).toHaveLength(1)
    expect(errors()[0].message).toMatch(/diverged/i)
    expect(last().status).toBe('paused')
    expect(clock.pending()).toBe(0)
  })

  it('pauses and reports an unexpected error from the engine', () => {
    const broken = new ReferenceEngine()
    let calls = 0
    broken.trainStep = () => {
      if (++calls > 2) throw new Error('out of memory')
      return 0.7
    }
    const { send, clock, last, errors } = setup(broken)
    send(configure)
    send({ type: 'start' })
    clock.advance(500)
    expect(errors()[0].message).toBe('out of memory')
    expect(last().status).toBe('paused')
    expect(clock.pending()).toBe(0)
  })
})
