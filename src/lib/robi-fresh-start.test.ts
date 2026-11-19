import { describe, expect, it } from 'vitest'

import { beforeFreshStart, dropBeforeFreshStart, ROBI_FRESH_START, withoutCarryBeforeFreshStart } from './robi-fresh-start'
import { demoCompanyStore } from './demo-companies'

const starts = { a: '2026-11-20' }

describe('a fresh start of the Robi score', () => {
  it('leaves the days before it unscored, the coordinator alone', () => {
    expect(beforeFreshStart('a', '2026-11-19', starts)).toBe(true)
    expect(beforeFreshStart('a', '2026-11-20', starts)).toBe(false)
    expect(beforeFreshStart('b', '2026-11-19', starts)).toBe(false)
    const scores = new Map([['a|2026-11-14', 1], ['a|2026-11-19', 2], ['a|2026-11-20', 3], ['b|2026-11-19', 4]])
    expect([...dropBeforeFreshStart(scores, starts).keys()]).toEqual(['a|2026-11-20', 'b|2026-11-19'])
  })

  it('carries nothing from before it into its first day, and later days carry as usual', () => {
    const items = [{ id: 1, carriedFrom: '2026-11-19' }, { id: 2 }, { id: 3, carriedFrom: '2026-11-20' }]
    expect(withoutCarryBeforeFreshStart('a', '2026-11-20', items, starts).map((i) => i.id)).toEqual([2, 3])
    expect(withoutCarryBeforeFreshStart('a', '2026-11-21', items, starts).map((i) => i.id)).toEqual([2, 3])
    expect(withoutCarryBeforeFreshStart('a', '2026-11-19', items, starts)).toHaveLength(3)
    expect(withoutCarryBeforeFreshStart('b', '2026-11-20', items, starts)).toHaveLength(3)
  })

  it('is Avani Patel from 20 Nov 2026, and the shared store keeps a stale page from carrying work in', () => {
    expect(ROBI_FRESH_START).toEqual({ 'coord-11': '2026-11-20' })
    const saved = demoCompanyStore.recordDailyPlan({
      userId: 'coord-11', date: '2026-11-20', skipped: [], createdAt: '2026-11-20T03:00:00.000Z',
      items: [
        { taskId: 'old', kind: 'rfd_followup', carriedFrom: '2026-11-19' },
        { taskId: 'new', kind: 'rfd_followup' },
      ] as never,
    })
    expect(saved.items.map((i) => i.taskId)).toEqual(['new'])
  })
})
