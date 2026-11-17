import { describe, expect, it } from 'vitest'
import { describeBackward, describeForward, fmt } from './explain'
import { buildTrace } from './graph'
import { inspectWithTs } from './inspect-ts'

const worked = buildTrace(inspectWithTs({ kind: 'worked', x: 2, w: 3, b: -1 }))
const node = (label: string) => worked.nodes.find((n) => n.label === label)!

describe('fmt', () => {
  it('keeps numbers short', () => {
    expect(fmt(5)).toBe('5')
    expect(fmt(0)).toBe('0')
    expect(fmt(0.123456)).toBe('0.1235')
    expect(fmt(-1)).toBe('-1')
    expect(fmt(1234567)).toBe('1.23e6')
    expect(fmt(0.00001)).toBe('1.00e-5')
  })
})

describe('describeForward', () => {
  it('puts the numbers in for single values', () => {
    expect(describeForward(worked, node('wx'))).toBe('wx = w × x = 3 × 2 = 6')
    expect(describeForward(worked, node('z'))).toBe('z = wx + b = 6 + (-1) = 5')
    expect(describeForward(worked, node('a'))).toBe('a = relu(z) = relu(5) = 5')
  })

  it('says whether an input will get a gradient', () => {
    expect(describeForward(worked, node('x'))).toContain('x = 2')
    const broadcast = buildTrace(inspectWithTs({ kind: 'broadcast' }))
    expect(describeForward(broadcast, broadcast.nodes.find((n) => n.label === 'X')!)).toContain('no gradient')
  })

  it('describes larger tensors by shape', () => {
    const broadcast = buildTrace(inspectWithTs({ kind: 'broadcast' }))
    expect(describeForward(broadcast, broadcast.nodes.find((n) => n.label === 'Y')!)).toContain('[3 × 2]')
  })
})

describe('describeBackward', () => {
  it('starts at the output with a gradient of 1', () => {
    const first = describeBackward(worked, worked.steps[0])
    expect(first.headline).toContain('Start at a')
    expect(first.lines).toEqual(["z gets 1 (z = 5 > 0, so it passes)"])
  })

  it('shows the multiplication behind each gradient', () => {
    const mulStep = worked.steps[2]
    const lines = describeBackward(worked, mulStep).lines
    expect(lines).toContain('w gets 2 (1 × x = 1 × 2)')
    expect(lines).toContain('x gets 3 (1 × w = 1 × 3)')
  })

  it('explains a blocked gradient', () => {
    const blocked = buildTrace(inspectWithTs({ kind: 'worked', x: 1, w: 1, b: -3 }))
    expect(describeBackward(blocked, blocked.steps[0]).lines[0]).toContain('blocked')
  })

  it('mentions a value used more than once', () => {
    const reuse = buildTrace(inspectWithTs({ kind: 'reuse', x: 3 }))
    const text = describeBackward(reuse, reuse.steps[1]).lines.join('\n')
    expect(text).toContain('used 2 times')
  })
})
