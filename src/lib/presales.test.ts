import { describe, expect, it } from 'vitest'

import type { PresalesCustomer, PresalesLine } from '../../shared/presales'
import { analysePresales, defaultMonths, monthWindows, reminderOf, windowLabel } from './presales'

const customer = (code: string, coordinatorId: string | null = 'coord-1'): PresalesCustomer => ({ code, name: `Customer ${code}`, coordinatorId, assignedFrom: coordinatorId ? 'crm' : null, fileCoordinator: null })
const line = (c: string, so: string, d: string, ic = 'IT1', q = 100): PresalesLine => ({ c, so, d, ic, in: `Item ${ic}`, q })

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

describe('customers to remind', () => {
  const windows = monthWindows([11, 12], '2026-11-14')
  const lines = [
    // A: ordered Nov and Dec 2025, nothing yet in Nov-Dec 2026 (ordered in Oct 2026 though).
    line('A', '202526/1', '2025-11-03', 'IT1', 1000),
    line('A', '202526/1', '2025-11-03', 'IT2', 500),
    line('A', '202526/2', '2025-12-10', 'IT1', 1000),
    line('A', '202627/9', '2026-10-20', 'IT1', 800),
    // B: ordered Nov 2025 and again Nov 2026.
    line('B', '202526/3', '2025-11-15'),
    line('B', '202627/7', '2026-11-05', 'IT1', 300),
    // C: nothing in Nov-Dec 2025.
    line('C', '202526/4', '2025-10-01'),
  ]
  const result = analysePresales([customer('A'), customer('B'), customer('C', null)], lines, windows)

  it('lists only customers who ordered in those months last year', () => {
    expect(result.map((r) => r.code)).toEqual(['A', 'B'])
  })

  it('counts sales orders and quantity, and flags those with no order this year', () => {
    const a = result.find((r) => r.code === 'A')!
    expect(a).toMatchObject({ status: 'to_remind', lastYear: { orders: 2, qty: 2500 }, thisYear: { orders: 0, qty: 0 }, lastOrder: '2026-10-20' })
    expect(a.lastYear.items).toEqual([
      { itemCode: 'IT1', itemName: 'Item IT1', orders: 2, qty: 2000, lastDate: '2025-12-10' },
      { itemCode: 'IT2', itemName: 'Item IT2', orders: 1, qty: 500, lastDate: '2025-11-03' },
    ])
    expect(result.find((r) => r.code === 'B')).toMatchObject({ status: 'ordered_again', thisYear: { orders: 1, qty: 300 } })
  })
})

describe('reminders', () => {
  const r = (at: string) => ({ id: at, customerCode: 'A', at, by: 'coord-1', byName: 'Krina', note: null })
  it('takes the latest, counting it as reminded for 30 days', () => {
    expect(reminderOf([r('2026-11-01T05:00:00.000Z'), r('2026-11-10T05:00:00.000Z')], 'A', '2026-11-14')).toMatchObject({ reminded: true, count: 2, latest: { at: '2026-11-10T05:00:00.000Z' } })
    expect(reminderOf([r('2026-09-01T05:00:00.000Z')], 'A', '2026-11-14').reminded).toBe(false)
    expect(reminderOf([], 'A', '2026-11-14')).toEqual({ latest: null, reminded: false, count: 0 })
  })
})
