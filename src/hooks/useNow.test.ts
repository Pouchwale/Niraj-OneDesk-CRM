import { describe, expect, it } from 'vitest'

import { msUntilNextStep } from './useNow'

const MINUTE = 60_000

describe('msUntilNextStep', () => {
  it('waits only as long as the rest of the current minute', () => {
    // 20 seconds into a minute leaves 40 to run.
    expect(msUntilNextStep(20_000, MINUTE)).toBe(40_000)
    expect(msUntilNextStep(59_999, MINUTE)).toBe(1)
  })

  it('gives a whole step when sitting exactly on a boundary', () => {
    // Never zero: a zero delay would spin without the clock having moved.
    expect(msUntilNextStep(0, MINUTE)).toBe(MINUTE)
    expect(msUntilNextStep(5 * MINUTE, MINUTE)).toBe(MINUTE)
  })

  it('lands on the boundary from any point in time', () => {
    const now = Date.UTC(2026, 8, 8, 9, 55, 13, 250)
    const next = now + msUntilNextStep(now, MINUTE)
    const at = new Date(next)
    expect(at.getUTCSeconds()).toBe(0)
    expect(at.getUTCMilliseconds()).toBe(0)
    expect(at.getUTCMinutes()).toBe(56)
  })

  it('works for other steps, so an hourly clock costs one wake an hour', () => {
    const hour = 60 * MINUTE
    const now = Date.UTC(2026, 8, 8, 9, 55, 0)
    expect(msUntilNextStep(now, hour)).toBe(5 * MINUTE)
    expect(msUntilNextStep(1_500, 1_000)).toBe(500)
  })

  it('never returns a negative or nonsensical delay', () => {
    expect(msUntilNextStep(Date.now(), 0)).toBe(0)
    expect(msUntilNextStep(Date.now(), -1)).toBe(0)
  })
})
