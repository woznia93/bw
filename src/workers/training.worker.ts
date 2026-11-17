// Runs the network off the main thread so the page stays responsive while it trains.
// All the behavior lives in TrainingSession; this file connects it to the worker's
// messages. The page loads it with `new Worker(new URL(...))`.

import { REFERENCE_ENGINE_LABEL, REFERENCE_ENGINE_NOTE, ReferenceEngine } from '@/lib/playground/engine'
import type { TrainerCommand, TrainerEvent } from '@/lib/playground/protocol'
import { TrainingSession } from '@/lib/playground/session'
import type { NetworkEngine } from '@/lib/playground/types'
import { WASM_ENGINE_LABEL, WasmEngine, compileEngine, wasmEngineNote } from '@/lib/playground/wasm-engine'

// The C++ engine compiled to WebAssembly, built by cpp/wasm/build.sh. It is resolved against
// the site's origin because during development the worker can run from a blob: address,
// which a plain /path can't be resolved against.
const ENGINE_PATH = '/playground/engine.wasm'

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

// The C++ engine if it loads, otherwise the TypeScript stand-in. Either way the page is
// told which one it got, so it can say so.
async function createEngine(): Promise<{ engine: NetworkEngine; label: string; note: string }> {
  try {
    const response = await fetch(new URL(ENGINE_PATH, self.location.origin))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const engine = new WasmEngine(await compileEngine(response))
    return { engine, label: WASM_ENGINE_LABEL, note: wasmEngineNote(engine.version) }
  } catch (error) {
    console.warn('Could not load the C++ engine, using the TypeScript one instead:', error)
    return { engine: new ReferenceEngine(), label: REFERENCE_ENGINE_LABEL, note: REFERENCE_ENGINE_NOTE }
  }
}

createEngine().then(({ engine, label, note }) => {
  const session = new TrainingSession(
    engine,
    // The arrays are handed over rather than copied
    (event) => scope.postMessage(event, transferables(event)),
    {
      now: () => performance.now(),
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }
  )
  scope.onmessage = (event) => session.handle(event.data)
  // The page waits for this before sending anything
  scope.postMessage({ type: 'ready', engine: { label, note } })
})
