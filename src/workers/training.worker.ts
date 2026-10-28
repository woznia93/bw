// Runs the network off the main thread so the page stays responsive while it trains.
// All the behavior lives in TrainingSession; this file connects it to the worker's
// messages. The page loads it with `new Worker(new URL(...))`.

import { REFERENCE_ENGINE_LABEL, REFERENCE_ENGINE_NOTE, ReferenceEngine } from '@/lib/playground/engine'
import type { TrainerCommand, TrainerEvent } from '@/lib/playground/protocol'
import { TrainingSession } from '@/lib/playground/session'

// The worker's global scope, which the DOM typings don't describe
const scope = self as unknown as {
  postMessage: (event: TrainerEvent, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<TrainerCommand>) => void) | null
}

function transferables(event: TrainerEvent): Transferable[] {
  if (event.type !== 'snapshot' || !event.evaluation) return []
  const { grid, parameters } = event.evaluation
  return [grid.buffer, ...parameters.map((values) => values.buffer)]
}

const session = new TrainingSession(
  new ReferenceEngine(),
  // The arrays are handed over rather than copied
  (event) => scope.postMessage(event, transferables(event)),
  {
    now: () => performance.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
)

scope.onmessage = (event) => session.handle(event.data)
scope.postMessage({
  type: 'ready',
  engine: { label: REFERENCE_ENGINE_LABEL, note: REFERENCE_ENGINE_NOTE },
})
