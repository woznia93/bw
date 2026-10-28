import { describe, expect, it } from 'vitest'
import { DATASETS } from './datasets'
import { ReferenceEngine } from './engine'
import { gridInputs } from './grid'
import { binaryCrossEntropy } from './metrics'
import type { TrainerCommand, TrainerEvent } from './protocol'
import {
  GRID_MS,
  MAX_LOSSES_PER_SNAPSHOT,
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

const TEST_GRID = 8

const config: NetworkConfig = { hidden: [8], activation: 'tanh', optimizer: 'sgd', learningRate: 0.5, seed: 1 }
const points = DATASETS.xor.generate(100, 0.1, 1)
const testPoints = DATASETS.xor.generate(100, 0.1, 777)

function setup(engine: NetworkEngine = new ReferenceEngine(), gridSize = TEST_GRID) {
  const clock = fakeClock()
  const events: TrainerEvent[] = []
  const session = new TrainingSession(engine, (event) => events.push(event), clock.scheduler, gridSize)
  const send = (command: TrainerCommand) => session.handle(command)
  const snapshots = () => events.filter((e) => e.type === 'snapshot') as Extract<TrainerEvent, { type: 'snapshot' }>[]
  const errors = () => events.filter((e) => e.type === 'error') as Extract<TrainerEvent, { type: 'error' }>[]
  const last = () => snapshots()[snapshots().length - 1]
  return { clock, events, send, snapshots, errors, last }
}

const configure: TrainerCommand = { type: 'configure', config, points, testPoints }

// The parts of a snapshot most tests care about
const brief = (snapshot: { status: string; step: number; loss: number | null }) => ({
  status: snapshot.status,
  step: snapshot.step,
  loss: snapshot.loss,
})

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
    expect(brief(last())).toEqual({ status: 'paused', step: 0, loss: null })
  })

  it('reconfiguring while running stops training and starts over', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    clock.advance(500)
    expect(last().step).toBeGreaterThan(0)

    send({ ...configure, config: { ...config, hidden: [4, 4] } })
    expect(brief(last())).toEqual({ status: 'paused', step: 0, loss: null })
    expect(clock.pending()).toBe(0)
  })

  it('reports a bad configuration instead of crashing', () => {
    const { send, errors } = setup()
    send({ ...configure, config: { ...config, learningRate: -1 } })
    expect(errors()[0].message).toMatch(/learning rate/)
    send({ ...configure, points: [], testPoints: [] })
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
    expect(brief(last())).toEqual({ status: 'paused', step: 0, loss: null })
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
    expect(brief(last())).toEqual({ status: 'paused', step: 0, loss: null })
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

describe('what each snapshot carries', () => {
  type Snapshot = Extract<TrainerEvent, { type: 'snapshot' }>
  const evaluationOf = (snapshot: Snapshot) => snapshot.evaluation!
  const labelsOf = (pts: typeof points) => pts.map((p) => p.label)
  const inputsOf = (pts: typeof points) => Float32Array.from(pts.flatMap((p) => [p.x, p.y]))

  it('has the decision boundary and accuracy straight after configuring', () => {
    const { send, last } = setup()
    send(configure)
    const evaluation = evaluationOf(last())
    expect(evaluation.grid).toBeInstanceOf(Float32Array)
    expect(evaluation.grid).toHaveLength(TEST_GRID * TEST_GRID)
    expect(evaluation.trainAccuracy).toBeGreaterThanOrEqual(0)
    expect(evaluation.trainAccuracy).toBeLessThanOrEqual(1)
    expect(evaluation.gradientNorms).toBeNull()
    expect(last().losses).toEqual([])
  })

  it('grid holds the network\'s own predictions at each cell', () => {
    const engine = new ReferenceEngine()
    const { send, last } = setup(engine)
    send(configure)
    send({ type: 'step' })
    send({ type: 'step' })
    expect(Array.from(evaluationOf(last()).grid)).toEqual(Array.from(engine.predict(gridInputs(TEST_GRID))))
  })

  it('train accuracy is the fraction of training points the network gets right', () => {
    const engine = new ReferenceEngine()
    const { send, last } = setup(engine)
    send(configure)
    for (let i = 0; i < 60; i++) send({ type: 'step' })
    const predictions = engine.predict(inputsOf(points))
    const expected = points.filter((p, i) => (predictions[i] > 0.5 ? 1 : 0) === p.label).length / points.length
    expect(evaluationOf(last()).trainAccuracy).toBe(expected)
  })

  it('accuracy improves as the network learns', () => {
    const { send, last } = setup()
    send(configure)
    const before = evaluationOf(last()).trainAccuracy
    for (let i = 0; i < 600; i++) send({ type: 'step' })
    expect(evaluationOf(last()).trainAccuracy).toBeGreaterThan(before)
    expect(evaluationOf(last()).trainAccuracy).toBeGreaterThan(0.9)
  })

  it('measures the held-out test points separately and never trains on them', () => {
    const engine = new ReferenceEngine()
    const { send, last } = setup(engine)
    send(configure)
    for (let i = 0; i < 300; i++) send({ type: 'step' })
    const { testAccuracy, testLoss } = evaluationOf(last())
    const predictions = engine.predict(inputsOf(testPoints))
    expect(testAccuracy).toBe(testPoints.filter((p, i) => (predictions[i] > 0.5 ? 1 : 0) === p.label).length / testPoints.length)
    expect(testLoss).toBeCloseTo(binaryCrossEntropy(predictions, labelsOf(testPoints)), 10)
    expect(testAccuracy).toBeGreaterThan(0.8)
    // Training on the test points would give different losses than training on the
    // training points alone
    expect(last().loss).toBe(referenceLosses(300)[299])
  })

  it('has no test numbers without test points', () => {
    const { send, last } = setup()
    send({ ...configure, testPoints: [] } as TrainerCommand)
    expect(evaluationOf(last()).testAccuracy).toBeNull()
    expect(evaluationOf(last()).testLoss).toBeNull()
  })

  it('reports the weights, and one gradient norm per layer after the first step', () => {
    const engine = new ReferenceEngine()
    const { send, last } = setup(engine)
    send(configure)
    expect(evaluationOf(last()).parameters.map((p) => p.length)).toEqual([16, 8, 8, 1])
    expect(evaluationOf(last()).gradientNorms).toBeNull()
    send({ type: 'step' })
    const { gradientNorms, parameters } = evaluationOf(last())
    expect(parameters).toEqual(engine.getParameterValues())
    // Two Linear layers: [2 -> 8] and [8 -> 1]
    expect(gradientNorms).toHaveLength(2)
    const grads = engine.getGradientValues()
    expect(gradientNorms![0]).toBeCloseTo(Math.hypot(...Array.from(grads[0]), ...Array.from(grads[1])), 6)
    expect(gradientNorms![1]).toBeCloseTo(Math.hypot(...Array.from(grads[2]), ...Array.from(grads[3])), 6)
    expect(gradientNorms!.every((n) => n > 0)).toBe(true)
  })

  it('reports the loss for every step since the last snapshot, in order', () => {
    const { send, snapshots } = setup()
    send(configure)
    send({ type: 'step' })
    send({ type: 'step' })
    send({ type: 'step' })
    const reported = snapshots().flatMap((snapshot) => snapshot.losses)
    expect(reported.map((sample) => sample.step)).toEqual([1, 2, 3])
    expect(reported.map((sample) => sample.loss)).toEqual(referenceLosses(3))
  })

  it('does not repeat or drop steps while running', () => {
    const { send, clock, snapshots } = setup()
    send(configure)
    send({ type: 'setSpeed', speed: 'normal' })
    send({ type: 'start' })
    clock.advance(500)
    send({ type: 'pause' })
    const steps = snapshots().flatMap((snapshot) => snapshot.losses).map((sample) => sample.step)
    const total = snapshots()[snapshots().length - 1].step
    expect(steps.length).toBe(total)
    expect(steps).toEqual(Array.from({ length: total }, (_, i) => i + 1))
  })

  it('thins the losses when a lot of steps ran between snapshots, keeping the newest', () => {
    const { send, clock, snapshots } = setup()
    send(configure)
    send({ type: 'setSpeed', speed: 'max' })
    send({ type: 'start' })
    clock.advance(SNAPSHOT_MS * 3)
    send({ type: 'pause' })
    snapshots().forEach((snapshot) => {
      expect(snapshot.losses.length).toBeLessThanOrEqual(MAX_LOSSES_PER_SNAPSHOT)
    })
    const withLosses = snapshots().filter((snapshot) => snapshot.losses.length > 0)
    expect(withLosses.length).toBeGreaterThan(0)
    withLosses.forEach((snapshot) => {
      expect(snapshot.losses[snapshot.losses.length - 1].step).toBe(snapshot.step)
    })
  })

  it('starts a new run when configured again or reset, and keeps the run while training', () => {
    const { send, clock, last } = setup()
    send(configure)
    const first = last().run
    send({ type: 'start' })
    clock.advance(200)
    expect(last().run).toBe(first)
    send({ type: 'reset' })
    const second = last().run
    expect(second).not.toBe(first)
    send(configure)
    expect(last().run).not.toBe(second)
  })

  it('refreshes the evaluation no more often than it is due while running', () => {
    const { send, clock, snapshots } = setup()
    send(configure)
    send({ type: 'setSpeed', speed: 'fast' })
    send({ type: 'start' })
    const before = snapshots().length
    clock.advance(1000)
    const running = snapshots().slice(before)
    const withEvaluation = running.filter((snapshot) => snapshot.evaluation !== null).length
    expect(withEvaluation).toBeLessThanOrEqual(Math.ceil(1000 / GRID_MS) + 1)
    expect(withEvaluation).toBeGreaterThan(3)
    expect(running.length).toBeGreaterThan(withEvaluation)
  })

  it('always refreshes the evaluation when the visitor pauses, steps or resets', () => {
    const { send, clock, last } = setup()
    send(configure)
    send({ type: 'start' })
    clock.advance(60)
    send({ type: 'pause' })
    expect(last().evaluation).not.toBeNull()
    send({ type: 'step' })
    expect(last().evaluation).not.toBeNull()
    send({ type: 'reset' })
    expect(last().evaluation).not.toBeNull()
  })

  it('refreshes the evaluation less often for a network that is slow to evaluate', () => {
    // Make each evaluation look like it takes 150 ms of fake time
    const engine = new ReferenceEngine()
    const clock = fakeClock()
    const original = engine.predict.bind(engine)
    let extra = 0
    const events: TrainerEvent[] = []
    const session = new TrainingSession(engine, (event) => events.push(event), {
      ...clock.scheduler,
      now: () => clock.scheduler.now() + extra,
    }, TEST_GRID)
    session.handle(configure)
    session.handle({ type: 'setSpeed', speed: 'fast' })
    session.handle({ type: 'start' })
    engine.predict = (inputs) => {
      if (inputs.length === TEST_GRID * TEST_GRID * 2) extra += 150
      return original(inputs)
    }
    const evaluations = () => events.filter((e) => e.type === 'snapshot' && e.evaluation).length
    const before = evaluations()
    clock.advance(3000)
    // The interval grows to about 5 x 150 ms = 750 ms, so about 4 in 3 s rather than 30
    expect(evaluations() - before).toBeLessThanOrEqual(6)
    expect(evaluations() - before).toBeGreaterThanOrEqual(1)
  })

  it('has no evaluation before anything is configured', () => {
    const { send, snapshots, errors } = setup()
    send({ type: 'start' })
    expect(errors()).toHaveLength(1)
    expect(snapshots()).toHaveLength(0)
  })
})
