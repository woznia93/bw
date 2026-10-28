// The decision boundary is drawn from the network's predictions on a grid of
// points covering the square [-1, 1] x [-1, 1]. Values are stored row by row with
// row 0 at the top (largest y), the way they're drawn.

export const GRID_SIZE = 64

// The coordinate at the middle of cell `index` out of `size`, from -1 to 1
export const gridCoordinate = (index: number, size: number) => -1 + ((index + 0.5) * 2) / size

// Flattened [x0, y0, x1, y1, ...] for every cell, in the order of the values
export function gridInputs(size: number): Float32Array {
  const inputs = new Float32Array(size * size * 2)
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = 2 * (row * size + col)
      inputs[i] = gridCoordinate(col, size)
      inputs[i + 1] = -gridCoordinate(row, size)
    }
  }
  return inputs
}

// Line segments where the values cross `level` (marching squares), as a flat list
// [x1, y1, x2, y2, ...] in data coordinates. Where a cell's edge crosses the
// level, the point is placed in proportion to the values at its two ends.
export function contourSegments(values: Float32Array, size: number, level = 0.5): number[] {
  const segments: number[] = []
  const x = (col: number) => gridCoordinate(col, size)
  const y = (row: number) => -gridCoordinate(row, size)
  const between = (v1: number, v2: number) => (level - v1) / (v2 - v1)

  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      // Corners: a top-left, b top-right, c bottom-right, d bottom-left
      const a = values[row * size + col]
      const b = values[row * size + col + 1]
      const c = values[(row + 1) * size + col + 1]
      const d = values[(row + 1) * size + col]
      const index = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0)
      if (index === 0 || index === 15) continue

      // Where the contour crosses each edge of the cell
      const top: [number, number] = [x(col) + between(a, b) * (x(col + 1) - x(col)), y(row)]
      const right: [number, number] = [x(col + 1), y(row) + between(b, c) * (y(row + 1) - y(row))]
      const bottom: [number, number] = [x(col) + between(d, c) * (x(col + 1) - x(col)), y(row + 1)]
      const left: [number, number] = [x(col), y(row) + between(a, d) * (y(row + 1) - y(row))]

      const join = (p: [number, number], q: [number, number]) => segments.push(p[0], p[1], q[0], q[1])
      // Two opposite corners above the level: the middle decides how the lines connect
      const centerHigh = (a + b + c + d) / 4 >= level

      switch (index) {
        case 1: case 14: join(left, bottom); break
        case 2: case 13: join(bottom, right); break
        case 3: case 12: join(left, right); break
        case 4: case 11: join(top, right); break
        case 6: case 9: join(top, bottom); break
        case 7: case 8: join(top, left); break
        case 5:
          if (centerHigh) { join(top, left); join(bottom, right) } else { join(top, right); join(left, bottom) }
          break
        case 10:
          if (centerHigh) { join(top, right); join(left, bottom) } else { join(top, left); join(bottom, right) }
          break
      }
    }
  }
  return segments
}
