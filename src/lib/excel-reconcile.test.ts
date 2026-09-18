import { describe, expect, it } from 'vitest'

import { accountKeyOf } from './account-key'
import {
  countSettlements,
  guardSettlements,
  planSettlements,
  readFileAccounts,
  SETTLEMENT_ALARM_FLOOR,
  type FileAccounts,
} from './excel-reconcile'

/**
 * Making the app agree with the file about what is no longer owed.
 *
 * The import used to be additive: rows in the file were written, and anything
 * the file stopped saying was left untouched. So a customer who paid kept their
 * balance here forever, and the outstanding total drifted further from the
 * truth with every sync that reported success.
 *
 * The risk in fixing that is the mirror image — writing money out of the book
 * because a file did not mention it. These tests are mostly about the
 * conditions on that: an unreadable cell is not a payment, a filtered import is
 * not a statement about the whole book, and a decision somebody made here
 * outranks a row going missing from tomorrow's export.
 */

interface Row {
  code: string | null
  name: string
  amount: number
}

const rows = (...list: [string | null, string, number][]): Row[] =>
  list.map(([code, name, amount]) => ({ code, name, amount }))

const readRows = (list: Row[]): FileAccounts =>
  readFileAccounts(list, (r) => accountKeyOf(r.code, r.name), (r) => r.amount)

interface Account {
  id: string
  code: string | null
  name: string
  amount: number
  settledAlready?: boolean
  setAside?: boolean
}

const plan = (
  accounts: Account[],
  file: FileAccounts,
  reconcileAbsent = true
) =>
  planSettlements({
    records: accounts,
    file,
    reconcileAbsent,
    idOf: (a) => a.id,
    keyOf: (a) => accountKeyOf(a.code, a.name),
    nameOf: (a) => a.name,
    amountOf: (a) => a.amount,
    isProtected: (a) => Boolean(a.settledAlready || a.setAside),
  })

describe('what the file says about each customer', () => {
  it('adds a customer up across their invoice rows', () => {
    const file = readRows(rows(['C1', 'Alpha', 100], ['C1', 'Alpha', 250], ['C2', 'Beta', 40]))
    expect(file.present).toEqual(new Set(['bp:C1', 'bp:C2']))
    expect(file.nil.size).toBe(0)
  })

  it('calls a customer nil when every invoice of theirs is paid', () => {
    const file = readRows(rows(['C1', 'Alpha', 0], ['C1', 'Alpha', 0]))
    expect(file.nil.has('bp:C1')).toBe(true)
  })

  it('does not call them nil while one invoice still carries money', () => {
    const file = readRows(rows(['C1', 'Alpha', 0], ['C1', 'Alpha', 5]))
    expect(file.nil.has('bp:C1')).toBe(false)
  })

  it('treats a cell it cannot read as unknown, never as paid', () => {
    // The one that would be unforgivable: a typo in an amount column writing a
    // live debt out of the book.
    const file = readRows(rows(['C1', 'Alpha', NaN]))
    expect(file.present.has('bp:C1')).toBe(true)
    expect(file.nil.has('bp:C1')).toBe(false)
  })

  it('falls back to the name when a row has no BP code', () => {
    const file = readRows(rows([null, 'Alpha Ltd', 0]))
    expect(file.nil.has('name:alpha ltd')).toBe(true)
  })

  it('ignores a blank row rather than inventing a nameless customer', () => {
    const file = readRows(rows([null, '', 0], [null, '   ', 0]))
    expect(file.present.size).toBe(0)
  })
})

describe('which accounts a sync settles', () => {
  const accounts: Account[] = [
    { id: 'a', code: 'C1', name: 'Alpha', amount: 500 },
    { id: 'b', code: 'C2', name: 'Beta', amount: 900 },
    { id: 'c', code: 'C3', name: 'Gamma', amount: 100 },
  ]

  it('settles a customer the file now lists at nothing', () => {
    const settled = plan(accounts, readRows(rows(['C1', 'Alpha', 0], ['C2', 'Beta', 900], ['C3', 'Gamma', 100])))
    expect(settled.map((s) => s.id)).toEqual(['a'])
    expect(settled[0].reason).toBe('paid-in-file')
    expect(settled[0].amount).toBe(500)
  })

  it('settles a customer the file has stopped mentioning', () => {
    const settled = plan(accounts, readRows(rows(['C1', 'Alpha', 500], ['C3', 'Gamma', 100])))
    expect(settled.map((s) => s.id)).toEqual(['b'])
    expect(settled[0].reason).toBe('gone-from-file')
  })

  it('leaves a customer alone while the file still claims money', () => {
    expect(plan(accounts, readRows(rows(['C1', 'Alpha', 500], ['C2', 'Beta', 900], ['C3', 'Gamma', 100])))).toEqual([])
  })

  it('leaves a row alone whose amount the file could not state', () => {
    // Present but unreadable: neither paid nor gone, so nothing happens.
    const settled = plan(accounts, readRows(rows(['C1', 'Alpha', NaN], ['C2', 'Beta', 900], ['C3', 'Gamma', 100])))
    expect(settled).toEqual([])
  })
})

describe('what a sync must never settle', () => {
  it('says nothing about absences when the import was filtered', () => {
    /*
     * The whole reason the flag exists. With a date window in force the file is
     * a slice, so a customer missing from it is outside the window, not paid -
     * and settling them would delete real money from the totals.
     */
    const accounts: Account[] = [{ id: 'a', code: 'C1', name: 'Alpha', amount: 500 }]
    expect(plan(accounts, readRows(rows(['C9', 'Other', 10])), false)).toEqual([])
  })

  it('still settles what a filtered file explicitly shows as paid', () => {
    const accounts: Account[] = [{ id: 'a', code: 'C1', name: 'Alpha', amount: 500 }]
    const settled = plan(accounts, readRows(rows(['C1', 'Alpha', 0])), false)
    expect(settled.map((s) => s.reason)).toEqual(['paid-in-file'])
  })

  it('leaves an account somebody set aside or already settled', () => {
    // A person decided these; a row going missing from an export is not an
    // argument against a decision a person made here.
    const accounts: Account[] = [
      { id: 'a', code: 'C1', name: 'Alpha', amount: 500, setAside: true },
      { id: 'b', code: 'C2', name: 'Beta', amount: 900, settledAlready: true },
    ]
    expect(plan(accounts, readRows(rows(['C9', 'Other', 10])))).toEqual([])
  })

  it('does not count an account that was already at nothing', () => {
    // Settling a zero changes no figure, and would only inflate the number
    // people read to decide whether the import did something alarming.
    const accounts: Account[] = [{ id: 'a', code: 'C1', name: 'Alpha', amount: 0 }]
    expect(plan(accounts, readRows(rows(['C9', 'Other', 10])))).toEqual([])
  })
})

describe('what the sync reports', () => {
  it('separates paid from merely absent', () => {
    const accounts: Account[] = [
      { id: 'a', code: 'C1', name: 'Alpha', amount: 500 },
      { id: 'b', code: 'C2', name: 'Beta', amount: 900 },
    ]
    const settled = plan(accounts, readRows(rows(['C1', 'Alpha', 0])))
    expect(countSettlements(settled)).toEqual({ paid: 1, gone: 1 })
  })
})

describe('refusing a plan that would empty the book', () => {
  /*
   * This exists because it happened. The file side of the reconciliation was
   * keyed by customer while the records were keyed by invoice, so nothing
   * matched, every record looked "gone from the file", and one sync wrote
   * 1,011 live invoices down to nil - reporting it as a success.
   */
  const plan = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i}`,
      key: `bp:C${i}`,
      name: `Customer ${i}`,
      amount: 100,
      reason: 'gone-from-file' as const,
    }))

  it('applies a plan that touches a modest share', () => {
    const guarded = guardSettlements(plan(10), 100)
    expect(guarded.apply).toHaveLength(10)
    expect(guarded.refused).toBe(0)
  })

  it('holds back a plan that would settle most of the book', () => {
    const guarded = guardSettlements(plan(60), 100)
    expect(guarded.apply).toEqual([])
    expect(guarded.refused).toBe(60)
  })

  it('holds back all of it, not the part that looks reasonable', () => {
    // Applying half a plan that cannot be trusted is not safer; it only makes
    // the damage harder to notice.
    expect(guardSettlements(plan(100), 100).apply).toEqual([])
  })

  it('does not second-guess a small book, where a share means nothing', () => {
    const small = SETTLEMENT_ALARM_FLOOR - 1
    expect(guardSettlements(plan(small), small).apply).toHaveLength(small)
  })
})

describe('the account key', () => {
  it('is the BP code however it was typed', () => {
    expect(accountKeyOf(' c1 ', 'Alpha')).toBe(accountKeyOf('C1', 'Something else'))
  })

  it('falls back to the name, case and spacing aside', () => {
    expect(accountKeyOf(null, ' Alpha Ltd ')).toBe(accountKeyOf('', 'alpha ltd'))
  })
})
