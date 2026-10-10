import { describe, expect, it } from 'vitest'

import type { HistoryResult, HistoryRow } from './plan-history'
import { dailyScores, scoreLabel, weekAverage, weekDays, weekStart } from './scores'

function row(date: string, result: HistoryResult, extra = false): HistoryRow {
  return {
    date,
    coordinatorId: 'coord-1',
    item: { taskId: `${date}-${Math.random()}`, kind: 'stale_contact', message: '', entityType: 'company', entityId: 'x', ...(extra ? { round: 1 } : {}) },
    result,
    followup: null,
    carriedTo: null,
    doneLater: null,
  }
}

describe('coordinator scores', () => {
  it('scores 6 of 8 as -25%, all 8 as 0%', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => row('2026-10-05', 'done')),
      row('2026-10-05', 'not_done'),
      row('2026-10-05', 'later'),
      ...Array.from({ length: 8 }, () => row('2026-10-06', 'done')),
    ]
    const scores = dailyScores(rows)
    expect(scores.get('coord-1|2026-10-05')).toEqual({ done: 6, given: 8, score: -25 })
    expect(scores.get('coord-1|2026-10-06')).toEqual({ done: 8, given: 8, score: 0 })
    expect(scoreLabel(-20)).toBe('-20%')
  })

  it('counts leftovers on the day they are on the list, and leaves out extra rounds and closed accounts', () => {
    const rows = [
      ...Array.from({ length: 9 }, () => row('2026-10-07', 'done')),
      row('2026-10-07', 'open'), // a leftover still open today counts against today
      row('2026-10-07', 'not_reached', true), // extra overdue round: not part of the score
      row('2026-10-07', 'closed'), // paid before anyone acted: not part of the score
    ]
    expect(dailyScores(rows).get('coord-1|2026-10-07')).toEqual({ done: 9, given: 10, score: -10 })
  })

  it('weeks run Monday to Saturday, and days with no plan stay out of the average', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05') // Wednesday → Monday
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // Sunday belongs to the week before
    expect(weekDays('2026-10-05')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
    expect(weekAverage([{ done: 6, given: 8, score: -25 }, undefined, { done: 8, given: 8, score: 0 }])).toBe(-13)
    expect(weekAverage([undefined, undefined])).toBeNull()
  })
})
