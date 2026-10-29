import { GRID_SIZE, gridInputs } from './grid'
import { thin } from './history'
import { binaryCrossEntropy, classificationAccuracy, l2Norm } from './metrics'
import { SPEEDS } from './protocol'
import type {
  Evaluation,
  LossSample,
  Speed,
  TrainerCommand,
  TrainerEvent,
  TrainerStatus,
} from './protocol'
import type { NetworkEngine, Point } from './types'

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
// The evaluation (decision boundary, accuracies, weights) is the expensive part of a
// snapshot, so it's refreshed less often, and less often still (5x its own cost)
// for big networks
export const GRID_MS = 100
export const GRID_COST_FACTOR = 5
// Loss values sent per snapshot, evenly spread if more steps than this ran
export const MAX_LOSSES_PER_SNAPSHOT = 64

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

  private points: Point[] = []
  private testPoints: Point[] = []
  private run = 0
  private pendingLosses: LossSample[] = []
  private lastEvaluation = -Infinity
  private evaluationInterval = GRID_MS

  constructor(
    private engine: NetworkEngine,
    private post: (event: TrainerEvent) => void,
    private scheduler: Scheduler,
    private gridSize = GRID_SIZE
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
          this.points = command.points
          this.testPoints = command.testPoints
          this.startRun()
          this.snapshot(true)
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
          this.snapshot(true)
          break
        case 'step':
          this.requireConfigured()
          this.stop()
          this.train(1)
          this.snapshot(true)
          break
        case 'reset':
          this.requireConfigured()
          this.stop()
          this.engine.reset()
          this.startRun()
          this.snapshot(true)
          break
      }
    } catch (error) {
      this.stop()
      this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      if (this.configured) this.snapshot(true)
    }
  }

  // A fresh start: step 0, no loss history
  private startRun() {
    this.run++
    this.step = 0
    this.loss = null
    this.pendingLosses = []
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
    this.snapshot(true)
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
      this.snapshot(true)
      return
    }

    if (this.status !== 'running') {
      this.snapshot(true)
      return
    }
    if (this.scheduler.now() - this.lastSnapshot >= SNAPSHOT_MS) this.snapshot(false)
    this.schedule()
  }

  private train(count: number, deadline = Infinity) {
    for (let i = 0; i < count; i++) {
      const loss = this.engine.trainStep()
      this.step++
      this.loss = loss
      this.pendingLosses.push({ step: this.step, loss })
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

  // `forceEvaluation` is for moments the visitor caused (pause, step, reset, a new
  // network), when the decision boundary and numbers should always be up to date.
  // While running they're only recomputed when due.
  private snapshot(forceEvaluation: boolean) {
    const now = this.scheduler.now()
    this.lastSnapshot = now

    let evaluation: Evaluation | null = null
    if (this.configured && (forceEvaluation || now - this.lastEvaluation >= this.evaluationInterval)) {
      evaluation = this.evaluate()
      const cost = this.scheduler.now() - now
      this.lastEvaluation = this.scheduler.now()
      this.evaluationInterval = Math.max(GRID_MS, cost * GRID_COST_FACTOR)
    }

    const losses = thin(this.pendingLosses, MAX_LOSSES_PER_SNAPSHOT)
    this.pendingLosses = []
    this.post({
      type: 'snapshot',
      status: this.status,
      step: this.step,
      loss: this.loss,
      run: this.run,
      losses,
      evaluation,
    })
  }

  private evaluate(): Evaluation {
    const predict = (points: Point[]) => {
      const inputs = new Float32Array(points.length * 2)
      points.forEach((point, i) => {
        inputs[2 * i] = point.x
        inputs[2 * i + 1] = point.y
      })
      return this.engine.predict(inputs)
    }
    const labels = (points: Point[]) => points.map((point) => point.label)

    const trainPredictions = predict(this.points)
    const hasTest = this.testPoints.length > 0
    const testPredictions = hasTest ? predict(this.testPoints) : null
    const parameters = this.engine.getParameterValues()

    // One norm per layer, over its weight and bias together
    let gradientNorms: number[] | null = null
    if (this.step > 0) {
      const gradients = this.engine.getGradientValues()
      gradientNorms = []
      for (let layer = 0; layer < gradients.length; layer += 2) {
        gradientNorms.push(l2Norm([gradients[layer], gradients[layer + 1]]))
      }
    }

    return {
      grid: this.engine.predict(gridInputs(this.gridSize)),
      trainAccuracy: classificationAccuracy(trainPredictions, labels(this.points)),
      testAccuracy: testPredictions ? classificationAccuracy(testPredictions, labels(this.testPoints)) : null,
      testLoss: testPredictions ? binaryCrossEntropy(testPredictions, labels(this.testPoints)) : null,
      parameters,
      gradientNorms,
    }
  }
}
