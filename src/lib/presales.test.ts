import { describe, expect, it } from 'vitest'

import type { PresalesCustomer, PresalesFollowup, PresalesLine } from '../../shared/presales'
import { analysePresales, defaultMonths, followupHolds, monthWindows, windowLabel } from './presales'

const customer = (code: string, coordinatorId: string | null = 'coord-1'): PresalesCustomer => ({ code, name: `Customer ${code}`, coordinatorId, assignedFrom: coordinatorId ? 'crm' : null, fileCoordinator: null })
const line = (c: string, so: string, d: string, ic = 'IT1', q = 100): PresalesLine => ({ c, so, d, ic, in: `Item ${ic}`, q })
const followup = (o: Partial<PresalesFollowup>): PresalesFollowup => ({
  id: 'f',
  customerCode: 'A',
  items: ['IT2'],
  at: '2026-11-10T05:00:00.000Z',
  by: 'coord-1',
  byName: 'Krina',
  mode: 'call',
  response: 'will_order',
  said: 'Will send the PO',
  expectedOrderDate: null,
  nextDate: null,
  ...o,
})

describe('the months compared', () => {
  it('starts on this month and the next, and puts each month in its coming year', () => {
    expect(defaultMonths('2026-11-14')).toEqual([11, 12])
    expect(defaultMonths('2026-12-02')).toEqual([12, 1])
    expect(monthWindows([11, 12, 1], '2026-11-14')).toEqual([
      { month: 11, thisYear: 2026, lastYear: 2025 },
      { month: 12, thisYear: 2026, lastYear: 2025 },
      { month: 1, thisYear: 2027, lastYear: 2026 },
    ])
    expect(windowLabel(monthWindows([11, 12], '2026-11-14'), 'lastYear')).toBe('Nov 2025 – Dec 2025')
  })
})

describe('items to remind', () => {
  const windows = monthWindows([11, 12], '2026-11-14')
  const lines = [
    // A ordered three items in Nov-Dec 2025; this November it has reordered IT1 only.
    line('A', '202526/1', '2025-11-03', 'IT1', 1000),
    line('A', '202526/1', '2025-11-03', 'IT2', 500),
    line('A', '202526/2', '2025-12-10', 'IT1', 1000),
    line('A', '202526/2', '2025-12-10', 'IT3', 50),
    line('A', '202627/9', '2026-11-05', 'IT1', 800),
    // B: everything reordered.
    line('B', '202526/3', '2025-11-15'),
    line('B', '202627/7', '2026-11-05', 'IT1', 300),
    // C: nothing in Nov-Dec 2025.
    line('C', '202526/4', '2025-10-01'),
  ]
  const result = analysePresales([customer('A'), customer('B'), customer('C', null)], lines, windows, [followup({})], '2026-11-14')

  it('follows each item on its own: reordered, followed up, or to remind', () => {
    const a = result.find((r) => r.code === 'A')!
    expect(a.items.map((i) => [i.key, i.state, i.qty, i.thisYearQty])).toEqual([
      ['IT3', 'to_remind', 50, 0],
      ['IT2', 'followed_up', 500, 0],
      ['IT1', 'ordered_again', 2000, 800],
    ])
    expect(a.counts).toEqual({ to_remind: 1, followed_up: 1, ordered_again: 1 })
    expect(a.status).toBe('to_remind')
    expect(a.lastYear).toEqual({ orders: 2, qty: 2550 })
    expect(a.items[1].followup?.said).toBe('Will send the PO')
  })

  it('lists only customers who ordered in those months last year; one with everything reordered is done', () => {
    expect(result.map((r) => r.code)).toEqual(['A', 'B'])
    expect(result.find((r) => r.code === 'B')).toMatchObject({ status: 'ordered_again', counts: { to_remind: 0, followed_up: 0, ordered_again: 1 } })
  })
})

describe('how long a follow-up holds an item', () => {
  it('until its next date, or 30 days without one', () => {
    expect(followupHolds({ at: '2026-11-10T05:00:00.000Z', nextDate: '2026-11-20' }, '2026-11-19')).toBe(true)
    expect(followupHolds({ at: '2026-11-10T05:00:00.000Z', nextDate: '2026-11-20' }, '2026-11-20')).toBe(false)
    expect(followupHolds({ at: '2026-11-10T05:00:00.000Z', nextDate: null }, '2026-12-08')).toBe(true)
    expect(followupHolds({ at: '2026-11-10T05:00:00.000Z', nextDate: null }, '2026-12-11')).toBe(false)
  })
})
