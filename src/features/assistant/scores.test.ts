import { describe, expect, it } from 'vitest'

import type { Followup } from '@/lib/types'
import type { DailyPlan } from './daily-plan'

import type { HistoryResult, HistoryRow } from './plan-history'
import { extraWork, dailyScores, scoreLabel, weekAverage, weekDays, weekStart } from './scores'

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
    expect(scores.get('coord-1|2026-10-05')).toEqual({ done: 6, given: 8, score: -25, extra: 0, credited: 0 })
    expect(scores.get('coord-1|2026-10-06')).toEqual({ done: 8, given: 8, score: 0, extra: 0, credited: 0 })
    expect(scoreLabel(-20)).toBe('-20%')
  })

  it('counts leftovers on the day they are on the list, and leaves out extra rounds and closed accounts', () => {
    const rows = [
      ...Array.from({ length: 9 }, () => row('2026-10-07', 'done')),
      row('2026-10-07', 'open'), // a leftover still open today counts against today
      row('2026-10-07', 'not_reached', true), // extra overdue round: not part of the score
      row('2026-10-07', 'closed'), // paid before anyone acted: not part of the score
    ]
    expect(dailyScores(rows).get('coord-1|2026-10-07')).toEqual({ done: 9, given: 10, score: -10, extra: 0, credited: 0 })
  })

  it('weeks run Monday to Saturday, and days with no plan stay out of the average', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05') // Wednesday → Monday
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // Sunday belongs to the week before
    expect(weekDays('2026-10-05')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
    expect(weekAverage([{ done: 6, given: 8, score: -25, extra: 0, credited: 0 }, undefined, { done: 8, given: 8, score: 0, extra: 0, credited: 0 }])).toBe(-13)
    expect(weekAverage([undefined, undefined])).toBeNull()
  })

  it('counts extra work once per customer, and lets it make up for missed tasks up to 0%', () => {
    const plan = { userId: 'coord-1', date: '2026-10-12', items: ['a', 'b', 'c', 'd'].map((id) => ({ taskId: id, kind: 'stale_contact', message: '', entityType: 'company', entityId: id })), skipped: [], createdAt: '2026-10-12T03:00:00Z' } as unknown as DailyPlan
    const f = (id: string, entityId: string, at: string) =>
      ({ id, entity_type: 'company', entity_id: entityId, coordinator_id: 'coord-1', followup_date: at, created_at: at }) as Followup
    const followups = [
      f('1', 'a', '2026-10-12T10:00:00'), // a planned task
      f('2', 'x', '2026-10-12T11:00:00'), // extra
      f('3', 'x', '2026-10-12T12:00:00'), // same customer again: still one
      f('4', 'y', '2026-10-12T13:00:00'), // extra
      f('5', 'z', '2026-10-13T10:00:00'), // another day, no plan
    ]
    const extra = extraWork([plan], followups)
    expect(extra.get('coord-1|2026-10-12')?.map((x) => x.entity_id)).toEqual(['x', 'y'])
    expect(extra.get('coord-1|2026-10-13')).toHaveLength(1)

    const row = (taskId: string, result: string) => ({ date: '2026-10-12', coordinatorId: 'coord-1', item: { taskId }, result }) as unknown as HistoryRow
    // 1 of 4 done, 2 extra: counts as 3 of 4.
    const scored = dailyScores([row('a', 'done'), row('b', 'not_done'), row('c', 'not_done'), row('d', 'not_done')], extra).get('coord-1|2026-10-12')
    expect(scored).toEqual({ done: 1, given: 4, score: -25, extra: 2, credited: 2 })
    // All 4 done, 2 extra: never above 0%.
    const full = dailyScores(['a', 'b', 'c', 'd'].map((t) => row(t, 'done')), extra).get('coord-1|2026-10-12')
    expect(full).toEqual({ done: 4, given: 4, score: 0, extra: 2, credited: 0 })
  })
})
