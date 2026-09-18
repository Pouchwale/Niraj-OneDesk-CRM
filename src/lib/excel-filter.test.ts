import { describe, expect, it } from 'vitest'

import {
  NO_FILTER,
  affectsBook,
  describeImportFilter,
  isFilterActive,
  keepByAge,
  keepByDate,
  windowBounds,
  type ImportFilter,
} from './excel-filter'

const TODAY = '2026-09-09'

const filter = (over: Partial<ImportFilter> = {}): ImportFilter => ({ ...NO_FILTER, ...over })
const row = (invoice: string | null, due: string | null = null) => ({
  invoice_date: invoice,
  due_date: due,
})

describe('a rolling window', () => {
  it('is the last N days counted back from today', () => {
    // Inclusive of today, so "last 30 days" is 30 days, not 31.
    expect(windowBounds({ kind: 'recent', days: 30 }, TODAY)).toEqual({
      from: '2026-08-11',
      to: '2026-09-09',
    })
  })

  it('moves with the calendar, so a saved choice never goes stale', () => {
    const week = { kind: 'recent', days: 7 } as const
    expect(windowBounds(week, '2026-09-09').from).toBe('2026-09-03')
    expect(windowBounds(week, '2026-10-09').from).toBe('2026-10-03')
  })

  it('crosses a month and a year boundary correctly', () => {
    expect(windowBounds({ kind: 'recent', days: 10 }, '2026-01-05').from).toBe('2025-12-27')
  })

  it('leaves both ends open when nothing is set', () => {
    expect(windowBounds({ kind: 'any' }, TODAY)).toEqual({ from: null, to: null })
  })
})

describe('filtering invoice rows by date', () => {
  const lastQuarter = filter({ dateField: 'invoice_date', window: { kind: 'recent', days: 90 } })

  it('keeps a row inside the window and drops one outside it', () => {
    expect(keepByDate(row('2026-08-20'), lastQuarter, TODAY)).toBe(true)
    expect(keepByDate(row('2026-01-05'), lastQuarter, TODAY)).toBe(false)
  })

  it('includes both ends of the window', () => {
    expect(keepByDate(row('2026-06-12'), lastQuarter, TODAY)).toBe(true) // exactly 90 days back
    expect(keepByDate(row(TODAY), lastQuarter, TODAY)).toBe(true)
  })

  it('measures against whichever date was chosen', () => {
    // An old invoice that is not due until December: in by due date, out by
    // invoice date. The choice of field is the whole point.
    const old = row('2026-01-05', '2026-12-30')
    expect(keepByDate(old, filter({ dateField: 'invoice_date', window: { kind: 'recent', days: 90 } }), TODAY)).toBe(false)
    expect(
      keepByDate(old, filter({ dateField: 'due_date', window: { kind: 'range', from: '2026-12-01', to: null } }), TODAY)
    ).toBe(true)
  })

  it('takes an open-ended range from either side', () => {
    const from = filter({ window: { kind: 'range', from: '2026-04-01', to: null } })
    expect(keepByDate(row('2026-04-01'), from, TODAY)).toBe(true)
    expect(keepByDate(row('2026-03-31'), from, TODAY)).toBe(false)

    const to = filter({ window: { kind: 'range', from: null, to: '2026-03-31' } })
    expect(keepByDate(row('2026-03-31'), to, TODAY)).toBe(true)
    expect(keepByDate(row('2026-04-01'), to, TODAY)).toBe(false)
  })

  it('keeps a row whose date is blank', () => {
    // A window says which part of the timeline is wanted. A row that never
    // claimed a place on it is not evidence of being outside; dropping it
    // would lose money over an empty cell.
    expect(keepByDate(row(null), lastQuarter, TODAY)).toBe(true)
  })

  it('keeps everything when no window is set', () => {
    expect(keepByDate(row('2019-01-01'), NO_FILTER, TODAY)).toBe(true)
  })
})

describe('filtering ageing rows by how old the money is', () => {
  const aged = (buckets: Partial<Record<string, number>>) => ({
    due_0_30: 0,
    due_31_60: 0,
    due_61_90: 0,
    due_91_120: 0,
    due_121_plus: 0,
    ...buckets,
  })

  it('keeps a row carrying money at least that old', () => {
    const past90 = filter({ minDaysOverdue: 90 })
    expect(keepByAge(aged({ due_121_plus: 800000 }), past90)).toBe(true)
    expect(keepByAge(aged({ due_91_120: 5000 }), past90)).toBe(true)
  })

  it('drops one whose whole balance is younger', () => {
    const past90 = filter({ minDaysOverdue: 90 })
    expect(keepByAge(aged({ due_0_30: 900000, due_61_90: 100000 }), past90)).toBe(false)
  })

  it('reads each threshold off the right buckets', () => {
    const row61to90 = aged({ due_61_90: 1000 })
    expect(keepByAge(row61to90, filter({ minDaysOverdue: 30 }))).toBe(true)
    expect(keepByAge(row61to90, filter({ minDaysOverdue: 60 }))).toBe(true)
    expect(keepByAge(row61to90, filter({ minDaysOverdue: 90 }))).toBe(false)
    expect(keepByAge(row61to90, filter({ minDaysOverdue: 120 }))).toBe(false)
  })

  it('counts a credit sitting in an old bucket as a position of that age', () => {
    expect(keepByAge(aged({ due_121_plus: -22275 }), filter({ minDaysOverdue: 90 }))).toBe(true)
  })

  it('keeps everything when no age is set', () => {
    expect(keepByAge(aged({ due_0_30: 100 }), NO_FILTER)).toBe(true)
  })
})

describe('which book a filter touches', () => {
  it('never applies a date window to the ageing sheet, which has no dates', () => {
    const dated = filter({ window: { kind: 'recent', days: 30 } })
    expect(affectsBook(dated, 'companies')).toBe(true)
    expect(affectsBook(dated, 'overdue')).toBe(false)
  })

  it('never applies an age to the invoice sheet', () => {
    const byAge = filter({ minDaysOverdue: 90 })
    expect(affectsBook(byAge, 'overdue')).toBe(true)
    expect(affectsBook(byAge, 'companies')).toBe(false)
  })

  it('knows when nothing is set at all', () => {
    expect(isFilterActive(NO_FILTER)).toBe(false)
    expect(isFilterActive(filter({ minDaysOverdue: 30 }))).toBe(true)
  })
})

describe('describing the filter', () => {
  it('says what will be imported, not what will be lost', () => {
    expect(describeImportFilter(NO_FILTER, 'companies')).toBe('Importing every row in the sheet')
    expect(
      describeImportFilter(filter({ window: { kind: 'recent', days: 90 } }), 'companies')
    ).toBe('Importing the last 90 days by invoice date')
    expect(
      describeImportFilter(
        filter({ dateField: 'due_date', window: { kind: 'range', from: null, to: '2026-03-31' } }),
        'companies'
      )
    ).toBe('Importing due date up to 31 Mar 2026')
  })

  it('speaks the ageing sheet\'s own language', () => {
    expect(describeImportFilter(NO_FILTER, 'overdue')).toBe('Importing every balance')
    expect(describeImportFilter(filter({ minDaysOverdue: 90 }), 'overdue')).toBe(
      'Importing only money past 90 days'
    )
  })
})
