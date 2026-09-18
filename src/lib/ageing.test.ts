import { describe, expect, it } from 'vitest'

import { ageingRows, oldestAgeingBand, summariseAgeing } from './ageing'

/** The customer in the screenshot that prompted this: nothing collected. */
const meridian = {
  due_0_30: 176287,
  due_31_60: 135322,
  due_61_90: 3878,
  due_91_120: 0,
  due_121_plus: 296387,
  balance_due: 611874,
}

describe('ageingRows', () => {
  it('labels every bucket in days and marks the ones past 90', () => {
    expect(ageingRows(meridian)).toEqual([
      { key: 'due_0_30', label: '0–30 days', amount: 176287, isCritical: false },
      { key: 'due_31_60', label: '31–60 days', amount: 135322, isCritical: false },
      { key: 'due_61_90', label: '61–90 days', amount: 3878, isCritical: false },
      { key: 'due_91_120', label: '91–120 days', amount: 0, isCritical: true },
      { key: 'due_121_plus', label: '121+ days', amount: 296387, isCritical: true },
    ])
  })

  it('reads a missing bucket as nothing in it, not as a gap', () => {
    expect(ageingRows({}).map((row) => row.amount)).toEqual([0, 0, 0, 0, 0])
    expect(ageingRows({ due_61_90: null }).map((row) => row.amount)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('summariseAgeing', () => {
  it('adds the buckets up and ties them to the balance still owed', () => {
    const summary = summariseAgeing(meridian)
    expect(summary.total).toBe(611874)
    expect(summary.balance).toBe(611874)
    expect(summary.difference).toBe(0)
    expect(summary.tiesOut).toBe(true)
    expect(summary.hasBreakdown).toBe(true)
  })

  it('flags a report whose buckets do not explain the balance', () => {
    const short = summariseAgeing({ ...meridian, balance_due: 700000 })
    expect(short.tiesOut).toBe(false)
    expect(short.difference).toBe(88126)

    const over = summariseAgeing({ ...meridian, balance_due: 500000 })
    expect(over.tiesOut).toBe(false)
    expect(over.difference).toBe(-111874)
  })

  it('treats sub-rupee rounding as tying out', () => {
    expect(summariseAgeing({ due_0_30: 100.2, balance_due: 100 }).tiesOut).toBe(true)
    expect(summariseAgeing({ due_0_30: 100, balance_due: 102 }).tiesOut).toBe(false)
  })

  it('says when the report carried no split at all', () => {
    const none = summariseAgeing({ balance_due: 50000 })
    expect(none.hasBreakdown).toBe(false)
    expect(none.total).toBe(0)
    // A balance with no split is not a mismatch to chase; the caption says so.
    expect(none.balance).toBe(50000)
  })
})

describe('oldestAgeingBand', () => {
  it('finds the oldest bucket that still holds money', () => {
    expect(oldestAgeingBand(meridian)).toEqual({ label: '121+ days', fromDays: 121 })
    expect(oldestAgeingBand({ due_0_30: 5000, due_61_90: 200 })).toEqual({ label: '61–90 days', fromDays: 61 })
    expect(oldestAgeingBand({ due_0_30: 5000 })).toEqual({ label: '0–30 days', fromDays: 0 })
  })

  it('returns nothing when no bucket holds money, rather than guessing the youngest', () => {
    expect(oldestAgeingBand({})).toBeNull()
    expect(oldestAgeingBand({ due_0_30: 0, due_121_plus: 0 })).toBeNull()
  })
})
