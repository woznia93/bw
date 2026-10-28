import { SPEEDS } from './protocol'
import type { Speed, TrainerCommand, TrainerEvent, TrainerStatus } from './protocol'
import type { NetworkEngine } from './types'

// Time functions are passed in so tests can control the clock
export type Scheduler = {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

// How often training work is done, and the longest it runs in one go. Between
// ticks the worker is free to receive messages, so pause and reset take effect
// almost immediately even at max speed.
export const TICK_MS = 16
export const TICK_BUDGET_MS = 12
// Safety limit per tick, whatever the speed
export const MAX_STEPS_PER_TICK = 2000
// The page hears about progress at most this often, however fast training runs
export const SNAPSHOT_MS = 50

// Runs training for the page: owns the engine, paces the steps and reports
// progress. The Web Worker (src/workers/training.worker.ts) is a thin wrapper
// around this so that all of the behavior can be tested without a browser.
export class TrainingSession {
  private configured = false
  private status: TrainerStatus = 'paused'
  private speed: Speed = 'normal'
  private step = 0
  private loss: number | null = null
  private timer: unknown = null
  private lastTick = 0
  private lastSnapshot = -Infinity
  // Steps owed from slow speeds, where a tick is worth less than one whole step
  private owed = 0

  constructor(
    private engine: NetworkEngine,
    private post: (event: TrainerEvent) => void,
    private scheduler: Scheduler
  ) {}

  handle(command: TrainerCommand) {
    try {
      switch (command.type) {
        case 'configure':
          this.stop()
          // Only counts as set up once both calls succeed
          this.configured = false
          this.engine.initialize(command.config)
          this.engine.setDataset(command.points)
          this.configured = true
          this.step = 0
          this.loss = null
          this.snapshot()
          break
        case 'setLearningRate':
          this.requireConfigured()
          this.engine.setLearningRate(command.learningRate)
          break
        case 'setSpeed':
          this.speed = command.speed
          break
        case 'start':
          this.start()
          break
        case 'pause':
          this.stop()
          this.snapshot()
          break
        case 'step':
          this.requireConfigured()
          this.stop()
          this.train(1)
          this.snapshot()
          break
        case 'reset':
          this.requireConfigured()
          this.stop()
          this.engine.reset()
          this.step = 0
          this.loss = null
          this.snapshot()
          break
      }
    } catch (error) {
      this.stop()
      this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      if (this.configured) this.snapshot()
    }
  }

  private requireConfigured() {
    if (!this.configured) throw new Error('The network has not been set up yet')
  }

  private start() {
    this.requireConfigured()
    if (this.status === 'running') return
    this.status = 'running'
    this.lastTick = this.scheduler.now()
    this.owed = 0
    this.schedule()
    this.snapshot()
  }

  private stop() {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer)
    this.timer = null
    this.status = 'paused'
  }

  private schedule() {
    this.timer = this.scheduler.setTimeout(() => this.tick(), TICK_MS)
  }

  private tick() {
    this.timer = null
    if (this.status !== 'running') return

    const started = this.scheduler.now()
    const rate = SPEEDS[this.speed].stepsPerSecond
    let count = MAX_STEPS_PER_TICK
    if (Number.isFinite(rate)) {
      this.owed += (rate * (started - this.lastTick)) / 1000
      count = Math.min(Math.floor(this.owed), MAX_STEPS_PER_TICK)
      this.owed -= count
    }
    this.lastTick = started

    try {
      // Stop early if the time budget runs out, so the worker stays responsive
      this.train(count, started + TICK_BUDGET_MS)
    } catch (error) {
      this.stop()
      this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      this.snapshot()
      return
    }

    if (this.status !== 'running') {
      this.snapshot()
      return
    }
    if (this.scheduler.now() - this.lastSnapshot >= SNAPSHOT_MS) this.snapshot()
    this.schedule()
  }

  private train(count: number, deadline = Infinity) {
    for (let i = 0; i < count; i++) {
      const loss = this.engine.trainStep()
      this.step++
      this.loss = loss
      if (!Number.isFinite(loss)) {
        this.stop()
        this.post({
          type: 'error',
          message:
            'Training diverged: the loss stopped being a number. Lower the learning rate, then press Reset.',
        })
        return
      }
      if (this.scheduler.now() >= deadline) return
    }
  }

  private snapshot() {
    this.lastSnapshot = this.scheduler.now()
    this.post({ type: 'snapshot', status: this.status, step: this.step, loss: this.loss })
  }
}
