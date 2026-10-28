export type LossPoint = { step: number; loss: number }

// Add new points to the loss history, keeping its length bounded. When it gets
// too long it is thinned by keeping every other point (and always the newest), so
// the whole run stays visible however long training goes on.
export function appendHistory(history: LossPoint[], added: LossPoint[], max: number): LossPoint[] {
  let result = history.concat(added)
  while (result.length > max) {
    const last = result[result.length - 1]
    result = result.filter((_, i) => i % 2 === 0)
    if (result[result.length - 1] !== last) result.push(last)
  }
  return result
}

// At most `max` points, spread evenly, always including the first and last
export function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const result: T[] = []
  for (let i = 0; i < max; i++) result.push(items[Math.round((i * (items.length - 1)) / (max - 1))])
  return result
}
