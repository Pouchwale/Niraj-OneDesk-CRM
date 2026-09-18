import { describe, expect, it } from 'vitest'

import { BOOK_LABEL, columnMessage, describeSync, explainSkips, type ExcelSyncResult } from './excel-source'

/** A delta shaped the way an import produces one. */
const moved = (added: number, addedValue: number, changed = 0, delta = 0) => ({
  added,
  addedValue,
  changed,
  delta,
  unchanged: 0,
})

const ok = (over: Partial<ExcelSyncResult> = {}): ExcelSyncResult => ({
  success: true,
  created: 0,
  updated: 0,
  skipped: 0,
  modifiedAt: '2026-09-07T10:00:00.000Z',
  ...over,
})

describe('columnMessage', () => {
  it('names the missing column and says nothing was imported', () => {
    expect(columnMessage(['bp_code'], 'Ageing')).toBe(
      'Sheet "Ageing" has no BP Code column. Nothing was imported.'
    )
  })

  it('lists several in the words the import uses', () => {
    expect(columnMessage(['bp_code', 'coordinator_name', 'balance_due'], 'Sheet1')).toBe(
      'Sheet "Sheet1" has no BP Code, Coordinator and Balance Due columns. Nothing was imported.'
    )
  })
})

describe('describeSync', () => {
  it('reports what is different, not how many rows it wrote', () => {
    expect(describeSync(ok({ created: 12, changes: moved(12, 480000) }), 'overdue')).toBe(
      'Overdue Payments: 12 new worth ₹4,80,000'
    )
    expect(
      describeSync(ok({ updated: 4, changes: moved(0, 0, 2, 110000) }), 'companies')
    ).toBe('Active Payments: 2 changed (₹1,10,000 more)')
  })

  it('says which way the book moved', () => {
    // A book that grew and one that shrank are not the same news, and
    // "2 changed" on its own hides which happened.
    expect(describeSync(ok({ changes: moved(0, 0, 2, -50000) }), 'companies')).toBe(
      'Active Payments: 2 changed (₹50,000 less)'
    )
  })

  it('says when a sync changed nothing, however many rows it wrote', () => {
    /*
     * The failure this replaces. A sync over an untouched workbook wrote a
     * thousand rows and reported "1,011 updated accounts", which is true of
     * the writing and useless as news.
     */
    expect(describeSync(ok({ updated: 1011, changes: moved(0, 0, 0, 0) }), 'companies')).toBe(
      'Active Payments: nothing changed'
    )
    expect(describeSync(ok(), 'overdue')).toBe('Overdue Payments: nothing changed')
  })

  it('counts the rows the validator refused', () => {
    expect(describeSync(ok({ updated: 3, skipped: 2 }), 'overdue')).toBe(
      'Overdue Payments: nothing changed · 2 skipped'
    )
  })

  it('separates the rows nobody need worry about from the ones they should', () => {
    // "3,012 skipped" was alarming and told nobody anything. Almost all of it
    // is invoices that are already paid, which is the import working.
    const result = describeSync(
      ok({
        created: 287,
        changes: moved(287, 12500000),
        skipped: 3012,
        skippedBecause: { settled: 2848, needsCoordinator: 164, malformed: 0 },
      }),
      'companies'
    )
    expect(result).toBe(
      'Active Payments: 287 new worth ₹1,25,00,000 · 2,848 already paid · 164 waiting on a coordinator name'
    )
  })

  it('says nothing about a reason that did not happen', () => {
    expect(
      describeSync(
        ok({ created: 5, changes: moved(5, 90000), skipped: 3, skippedBecause: { settled: 3, needsCoordinator: 0, malformed: 0 } }),
        'companies'
      )
    ).toBe('Active Payments: 5 new worth ₹90,000 · 3 already paid')
  })

  it('names rows that could not be read at all', () => {
    expect(
      describeSync(
        ok({ created: 2, changes: moved(2, 40000), skipped: 1, skippedBecause: { settled: 0, needsCoordinator: 0, malformed: 1 } }),
        'overdue'
      )
    ).toBe('Overdue Payments: 2 new worth ₹40,000 · 1 could not be read')
  })
})

describe('explainSkips', () => {
  const errors = {
    0: ['Total Amount must be greater than zero'],
    1: ['Unassigned coordinator'],
    2: ['BP Code is required'],
    3: ['Total Amount must be greater than zero', 'Unassigned coordinator'],
  }
  const rows = [0, 1, 2, 3].map((i) => ({ _originalIndex: i }))

  it('sorts each refused row into what it actually is', () => {
    const breakdown = explainSkips(rows, [{ _originalIndex: 1 }, { _originalIndex: 3 }], errors)
    // Row 3 is paid AND unassigned: naming its coordinator would not import it,
    // so it counts as paid rather than as work for somebody.
    expect(breakdown).toEqual({ settled: 2, needsCoordinator: 1, malformed: 1 })
  })

  it('counts nothing when nothing was refused', () => {
    expect(explainSkips([], [], {})).toEqual({ settled: 0, needsCoordinator: 0, malformed: 0 })
  })

  it('gives the reason back when the sync failed', () => {
    expect(
      describeSync({ success: false, created: 0, updated: 0, skipped: 0, modifiedAt: null, error: 'No file at that path.' }, 'companies')
    ).toBe('No file at that path.')
  })

  it('labels the two books the way the screens do', () => {
    expect(BOOK_LABEL).toEqual({ companies: 'Active Payments', overdue: 'Overdue Payments' })
  })
})

describe('a date filter in the sync message', () => {
  it('names the rows a window left out, separately from failures', () => {
    // A window somebody set themselves is not a problem with the file, and
    // must never read like one.
    expect(
      describeSync(
        ok({
          created: 120,
          changes: moved(120, 3400000),
          filteredOut: 806,
          skippedBecause: { settled: 2848, needsCoordinator: 164, malformed: 0 },
        }),
        'companies'
      )
    ).toBe(
      'Active Payments: 120 new worth ₹34,00,000 · 806 outside your date filter · 2,848 already paid · 164 waiting on a coordinator name'
    )
  })

  it('says nothing about a filter that held nothing back', () => {
    expect(describeSync(ok({ created: 5, changes: moved(5, 75000), filteredOut: 0 }), 'companies')).toBe(
      'Active Payments: 5 new worth ₹75,000'
    )
  })
})
