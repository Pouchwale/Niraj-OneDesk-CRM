import { describe, expect, it } from 'vitest'

import {
  closingPoints,
  figuresFor,
  inPeriod,
  periodChoices,
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
  it('starts a week on Saturday (the company week, Saturday to Friday), local time', () => {
    expect(weekStartOf('2026-11-02T07:34:35')).toBe('2026-10-31') // Monday
    expect(weekStartOf('2026-11-06T23:59:00')).toBe('2026-10-31') // Friday ends the week
    expect(weekStartOf('2026-11-07T10:03:31')).toBe('2026-11-07') // Saturday starts the next
    expect(weekStartOf('2026-11-08T23:00:00')).toBe('2026-11-07') // Sunday
  })

  it('keeps the earliest save of each week, latest week first', () => {
    const weeks = pickWeekly([
      { id: 'b', savedAt: '2026-09-28T09:42:00' },
      { id: 'a', savedAt: '2026-09-28T09:35:00' },
      { id: 'c', savedAt: '2026-10-02T10:34:00' }, // Friday: still the week of Saturday 26 Sep
      { id: 'd', savedAt: '2026-10-06T10:32:00' },
      { id: 'f', savedAt: '2026-10-12T09:59:00' }, // Monday
      { id: 'e', savedAt: '2026-10-10T10:03:00' }, // Saturday: the first save of its week wins over Monday's
    ])
    expect(weeks.map((w) => [w.weekStart, w.id])).toEqual([
      ['2026-10-10', 'e'],
      ['2026-10-03', 'd'],
      ['2026-09-26', 'a'],
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
      ['Q3 2026 (Jul–Sep)', 1],
      ['Q4 2026 (Oct–Dec)', 3],
    ])
    expect(periodLabel('2027-Q1')).toBe('Q1 2027 (Jan–Mar)')
    expect(periodLabel('2026')).toBe('2026')
    expect(rollUp([at('2026-09-28', 1), at('2026-11-05', 3, true)], 'year').map((y) => [y.label, y.rows[0].accounts])).toEqual([
      ['2026', 3],
    ])
  })
})

describe('choosing a month or quarter', () => {
  const rows = (accounts: number) => [
    { coordinatorId: 'coord-1', segment: 'regular' as const, accounts, d0_30: 0, d31_120: 0, d121_plus: 0 },
  ]

  it('tells which dates fall in a chosen period', () => {
    expect(inPeriod('2026-10-26', 'm:2026-10')).toBe(true)
    expect(inPeriod('2026-11-02', 'm:2026-10')).toBe(false)
    expect(inPeriod('2026-11-02', 'q:2026-Q4')).toBe(true)
    expect(inPeriod('2026-09-28', 'q:2026-Q4')).toBe(false)
    expect(inPeriod('2026-09-28', 'all')).toBe(true)
    expect(inPeriod('2026-03-02', 'y:2026')).toBe(true)
    // A chosen week keeps its month's other weeks in view.
    expect(inPeriod('2026-10-26', 'w:2026-10-05')).toBe(true)
    expect(inPeriod('2026-11-02', 'w:2026-10-05')).toBe(false)
  })

  it('lists every month and quarter there is a point for, latest first', () => {
    const choices = periodChoices([
      { date: '2026-09-14', rows: [] },
      { date: '2026-10-26', rows: [] },
      { date: '2026-11-05', rows: [], live: true },
    ])
    expect(choices.months).toEqual(['2026-11', '2026-10', '2026-09'])
    expect(choices.quarters).toEqual(['2026-Q4', '2026-Q3'])
    expect(choices.years).toEqual(['2026'])
  })

  it('closes a month with its recorded close, else its last saved week; the running one with today', () => {
    const live = { date: '2026-11-05', rows: rows(5), live: true }
    const points = closingPoints(
      [
        { dayId: 'a', savedAt: '2026-10-26T07:00:00Z', weekStart: '2026-10-26', rows: rows(3) },
        { dayId: 'b', savedAt: '2026-09-28T07:00:00Z', weekStart: '2026-09-28', rows: rows(2) },
      ],
      [
        // Last rewritten on 20 Oct, but it is October's close: it outranks the week of 26 Oct.
        { month: '2026-10', savedAt: '2026-10-20T10:00:00Z', rows: rows(9) },
        { month: '2026-11', savedAt: '2026-11-04T10:00:00Z', rows: rows(7) },
      ],
      live
    )
    const months = rollUp(points, 'month')
    expect(months.map((m) => [m.key, m.rows[0].accounts])).toEqual([
      ['2026-09', 2],
      ['2026-10', 9],
      ['2026-11', 5],
    ])
  })
})
