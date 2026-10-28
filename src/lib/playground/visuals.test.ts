import { describe, expect, it } from 'vitest'
import { GRID_SIZE, contourSegments, gridCoordinate, gridInputs } from './grid'
import { heatmapColor } from './heatmap'
import { appendHistory, thin } from './history'

describe('grid', () => {
  it('cell centers run from just inside -1 to just inside 1', () => {
    expect(gridCoordinate(0, 4)).toBeCloseTo(-0.75)
    expect(gridCoordinate(3, 4)).toBeCloseTo(0.75)
    expect(gridCoordinate(0, GRID_SIZE)).toBeGreaterThan(-1)
    expect(gridCoordinate(GRID_SIZE - 1, GRID_SIZE)).toBeLessThan(1)
  })

  it('gridInputs lists x, y for every cell with the top row first', () => {
    const inputs = gridInputs(2)
    expect(Array.from(inputs)).toEqual([-0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5])
    expect(gridInputs(GRID_SIZE)).toHaveLength(GRID_SIZE * GRID_SIZE * 2)
  })
})

describe('contourSegments', () => {
  const field = (size: number, f: (x: number, y: number) => number) => {
    const values = new Float32Array(size * size)
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) values[row * size + col] = f(gridCoordinate(col, size), -gridCoordinate(row, size))
    }
    return values
  }
  const points = (segments: number[]) => {
    const result: [number, number][] = []
    for (let i = 0; i < segments.length; i += 2) result.push([segments[i], segments[i + 1]])
    return result
  }

  it('finds nothing when every value is on one side', () => {
    expect(contourSegments(field(8, () => 0.9), 8)).toEqual([])
    expect(contourSegments(field(8, () => 0.1), 8)).toEqual([])
  })

  it('puts a straight line exactly where a linear field crosses 0.5', () => {
    // p = 0.5 + 0.3 x crosses 0.5 along x = 0
    const segments = contourSegments(field(16, (x) => 0.5 + 0.3 * x), 16)
    expect(segments.length).toBeGreaterThan(0)
    points(segments).forEach(([x]) => expect(Math.abs(x)).toBeLessThan(1e-6))
    // and it runs the whole height
    const ys = points(segments).map(([, y]) => y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1.7)
  })

  it('follows a diagonal and a slanted line', () => {
    // p = 0.5 + 0.2 (x + y) crosses along x + y = 0
    points(contourSegments(field(16, (x, y) => 0.5 + 0.2 * (x + y)), 16)).forEach(([x, y]) => {
      expect(Math.abs(x + y)).toBeLessThan(1e-5)
    })
  })

  it('traces a circle at the right radius', () => {
    // High inside radius 0.5, low outside, with a smooth slope so crossings can be interpolated
    const values = field(48, (x, y) => 0.5 - (Math.hypot(x, y) - 0.5))
    const radii = points(contourSegments(values, 48)).map(([x, y]) => Math.hypot(x, y))
    expect(radii.length).toBeGreaterThan(40)
    radii.forEach((radius) => expect(Math.abs(radius - 0.5)).toBeLessThan(0.01))
  })

  it('respects a different level', () => {
    // p = 0.5 + 0.3 x crosses 0.65 where x = 0.5
    points(contourSegments(field(16, (x) => 0.5 + 0.3 * x), 16, 0.65)).forEach(([x]) => {
      expect(Math.abs(x - 0.5)).toBeLessThan(1e-5)
    })
  })

  it('handles the ambiguous saddle case without crashing and joins consistently', () => {
    // Opposite corners high, 2x2 grid
    const high = new Float32Array([0.9, 0.1, 0.1, 0.9])
    expect(contourSegments(high, 2)).toHaveLength(8) // two segments
    expect(contourSegments(new Float32Array([0.1, 0.9, 0.9, 0.1]), 2)).toHaveLength(8)
  })
})

describe('heatmapColor', () => {
  it('is blue for class 0 and amber for class 1', () => {
    const [r0, , b0] = heatmapColor(0.05, 'dark')
    const [r1, , b1] = heatmapColor(0.95, 'dark')
    expect(b0).toBeGreaterThan(r0)
    expect(r1).toBeGreaterThan(b1)
  })

  it('fades out where the network is unsure and gets stronger with confidence', () => {
    expect(heatmapColor(0.5, 'dark')[3]).toBe(0)
    const alphas = [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((p) => heatmapColor(p, 'dark')[3])
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeGreaterThan(alphas[i - 1])
    expect(heatmapColor(0.2, 'dark')[3]).toBe(heatmapColor(0.8, 'dark')[3])
  })

  it('stays translucent, so the points on top are still readable', () => {
    expect(heatmapColor(1, 'light')[3]).toBeLessThan(180)
    expect(heatmapColor(0, 'light')[3]).toBeLessThan(180)
  })

  it('copes with values slightly outside 0-1', () => {
    expect(() => heatmapColor(-0.1, 'dark')).not.toThrow()
    expect(heatmapColor(1.2, 'dark')[3]).toBe(heatmapColor(1, 'dark')[3])
  })
})

describe('history', () => {
  const run = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ step: from + i, loss: 1 / (from + i) }))

  it('appends without changing anything while under the limit', () => {
    expect(appendHistory(run(3), run(2, 4), 100)).toEqual(run(5))
  })

  it('keeps the length bounded and always keeps the newest point', () => {
    let history = run(0)
    for (let i = 0; i < 100; i++) history = appendHistory(history, run(50, i * 50 + 1), 200)
    expect(history.length).toBeLessThanOrEqual(200)
    expect(history[history.length - 1].step).toBe(5000)
  })

  it('keeps the first point and the order, so the whole run stays visible', () => {
    let history = run(0)
    for (let i = 0; i < 40; i++) history = appendHistory(history, run(50, i * 50 + 1), 100)
    expect(history[0].step).toBe(1)
    for (let i = 1; i < history.length; i++) expect(history[i].step).toBeGreaterThan(history[i - 1].step)
    // spread across the run, not bunched at one end
    expect(history[Math.floor(history.length / 2)].step).toBeGreaterThan(500)
  })

  it('thin keeps the ends and spreads the rest', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i)
    const result = thin(items, 10)
    expect(result).toHaveLength(10)
    expect(result[0]).toBe(0)
    expect(result[9]).toBe(999)
    expect(thin([1, 2, 3], 10)).toEqual([1, 2, 3])
  })
})
