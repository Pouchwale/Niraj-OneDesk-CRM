import { describe, expect, it } from 'vitest'

import {
  figuresFor,
  periodLabel,
  pickWeekly,
  rollUp,
  segmentOf,
  summariseBook,
  weekStartOf,
  PERSON_UNASSIGNED,
  type BookRow,
} from './ageing-trend'

function row(overrides: Partial<BookRow> = {}): BookRow {
  return {
    status: 'overdue',
    assigned_coordinator_id: 'coord-1',
    due_0_30: 100,
    due_31_60: 10,
    due_61_90: 20,
    due_91_120: 30,
    due_121_plus: 1000,
    ...overrides,
  }
}

describe('segmentOf', () => {
  it('puts each balance in its register, and leaves settled and bankrupt out', () => {
    expect(segmentOf(row())).toBe('regular')
    expect(segmentOf(row({ status: 'critical' }))).toBe('regular')
    expect(segmentOf(row({ no_followup_at: '2026-10-01', no_followup_kind: 'dispute' }))).toBe('dispute')
    expect(segmentOf(row({ no_followup_at: '2026-10-01', no_followup_kind: 'export' }))).toBe('export')
    expect(segmentOf(row({ no_followup_at: '2026-10-01', no_followup_kind: null }))).toBe('no_followup')
    // A kind without the date is not set aside: the date is what marks it.
    expect(segmentOf(row({ no_followup_kind: 'dispute' }))).toBe('regular')
    expect(segmentOf(row({ status: 'settled' }))).toBeNull()
    expect(segmentOf(row({ status: 'bankrupt' }))).toBeNull()
    expect(segmentOf(row({ bankrupt_declared_at: '2026-10-01', no_followup_at: '2026-10-01' }))).toBeNull()
  })
})

describe('summariseBook', () => {
  it('sums 31-120 as the three middle buckets, per coordinator and segment', () => {
    const rows = summariseBook([
      row(),
      row({ due_0_30: -50 }),
      row({ assigned_coordinator_id: 'coord-2', no_followup_at: 'x', no_followup_kind: 'dispute' }),
      row({ assigned_coordinator_id: null }),
      row({ status: 'settled' }),
    ])
    const mine = rows.find((r) => r.coordinatorId === 'coord-1' && r.segment === 'regular')
    expect(mine).toEqual({ coordinatorId: 'coord-1', segment: 'regular', accounts: 2, d0_30: 50, d31_120: 120, d121_plus: 2000 })
    expect(rows.find((r) => r.coordinatorId === 'coord-2')?.segment).toBe('dispute')
    expect(rows.find((r) => r.coordinatorId === null)?.accounts).toBe(1)
    expect(rows.reduce((sum, r) => sum + r.accounts, 0)).toBe(4)
  })

  it('adds up one segment for one person, or everything', () => {
    const rows = summariseBook([
      row(),
      row({ assigned_coordinator_id: 'coord-2' }),
      row({ assigned_coordinator_id: null }),
      row({ no_followup_at: 'x', no_followup_kind: 'export' }),
    ])
    expect(figuresFor(rows, 'regular').accounts).toBe(3)
    expect(figuresFor(rows, 'regular', 'coord-2').d121_plus).toBe(1000)
    expect(figuresFor(rows, 'regular', PERSON_UNASSIGNED).accounts).toBe(1)
    expect(figuresFor(rows, 'all', 'coord-1')).toEqual({ accounts: 2, d0_30: 200, d31_120: 120, d121_plus: 2000 })
    expect(figuresFor(rows, 'dispute').accounts).toBe(0)
  })
})

describe('weeks', () => {
  it('starts a week on Monday, local time', () => {
    expect(weekStartOf('2026-11-02T07:34:35')).toBe('2026-11-02') // Monday
    expect(weekStartOf('2026-11-08T23:00:00')).toBe('2026-11-02') // Sunday
    expect(weekStartOf('2026-11-09T00:30:00')).toBe('2026-11-09')
  })

  it('keeps the earliest save of each week, latest week first', () => {
    const weeks = pickWeekly([
      { id: 'b', savedAt: '2026-09-28T09:42:00' },
      { id: 'a', savedAt: '2026-09-28T09:35:00' },
      { id: 'c', savedAt: '2026-10-02T10:34:00' },
      { id: 'd', savedAt: '2026-10-06T10:32:00' },
    ])
    expect(weeks.map((w) => [w.weekStart, w.id])).toEqual([
      ['2026-10-05', 'd'],
      ['2026-09-28', 'a'],
    ])
  })
})

describe('rollUp', () => {
  const at = (date: string, accounts: number, live = false) => ({
    date,
    live,
    rows: [{ coordinatorId: 'coord-1', segment: 'regular' as const, accounts, d0_30: 0, d31_120: 0, d121_plus: 0 }],
  })

  it('shows each month at its last point, today for the month still running', () => {
    const months = rollUp([at('2026-09-21', 1), at('2026-09-28', 2), at('2026-10-26', 3), at('2026-11-02', 4), at('2026-11-05', 5, true)], 'month')
    expect(months.map((m) => [m.label, m.rows[0].accounts, Boolean(m.live)])).toEqual([
      ['Sep 2026', 2, false],
      ['Oct 2026', 3, false],
      ['Nov 2026', 5, true],
    ])
  })

  it('groups calendar quarters', () => {
    const quarters = rollUp([at('2026-09-28', 1), at('2026-10-26', 2), at('2026-11-05', 3, true)], 'quarter')
    expect(quarters.map((q) => [q.label, q.rows[0].accounts])).toEqual([
      ['Jul–Sep 2026', 1],
      ['Oct–Dec 2026', 3],
    ])
    expect(periodLabel('2027-Q1')).toBe('Jan–Mar 2027')
  })
})
