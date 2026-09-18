import { describe, expect, it } from 'vitest'

import {
  isAdvancePayment,
  parsePaymentTermDays,
  recalculateDueDate,
  REFUSAL_MESSAGE,
} from './due-date'

/**
 * Working a due date out from the invoice date.
 *
 * The arithmetic is trivial; the exception is the feature. "Advance 50%" is not
 * a credit period of nothing — the money was due before the goods moved — so
 * counting zero days from the invoice date would stamp every such account as
 * overdue the morning after it was raised, and the chase list would fill with
 * customers who owe nothing yet.
 *
 * The live file spells these as "Advance 50%" beside "Net-30", "Net-45",
 * "Net-60" and "Net-90".
 */

describe('telling advance payment from a credit period', () => {
  it('recognises the terms in the live file', () => {
    expect(isAdvancePayment('Advance 50%')).toBe(true)
    expect(isAdvancePayment('advance')).toBe(true)
    expect(isAdvancePayment('Proforma')).toBe(true)
  })

  it('leaves a real credit period alone', () => {
    expect(isAdvancePayment('Net-30')).toBe(false)
    expect(isAdvancePayment('60 Days')).toBe(false)
    expect(isAdvancePayment(null)).toBe(false)
  })

  it('does not mistake "immediate" for advance', () => {
    // Due on the invoice date is a real zero: the money is due now, not before.
    expect(isAdvancePayment('Immediate')).toBe(false)
    expect(isAdvancePayment('COD')).toBe(false)
    expect(parsePaymentTermDays('Immediate')).toBe(0)
  })
})

describe('recalculating from the invoice date', () => {
  it('counts the credit period forward', () => {
    const result = recalculateDueDate('2026-04-12', 'Net-30', '2026-06-01')
    expect(result).toMatchObject({ ok: true, dueDate: '2026-05-12', days: 30, changed: true })
  })

  it('handles each of the terms the file actually uses', () => {
    const on = (terms: string) => {
      const r = recalculateDueDate('2026-01-01', terms, null)
      return r.ok ? r.dueDate : r.reason
    }
    expect(on('Net-30')).toBe('2026-01-31')
    expect(on('Net-45')).toBe('2026-02-15')
    expect(on('Net-60')).toBe('2026-03-02')
    expect(on('Net-90')).toBe('2026-04-01')
  })

  it('says when the date already follows the terms', () => {
    // The button reads "Already matches the terms" and does nothing, rather
    // than writing the same value back and claiming it changed something.
    const result = recalculateDueDate('2026-04-12', 'Net-30', '2026-05-12')
    expect(result).toMatchObject({ ok: true, changed: false })
  })
})

describe('what it refuses, and why', () => {
  it('refuses advance payment by name', () => {
    /*
     * The whole exception. Left to the day count these answer 0 and would be
     * stamped due on the day of the invoice — overdue the day after, for money
     * that was collected before the goods moved.
     */
    const result = recalculateDueDate('2026-04-12', 'Advance 50%', '2026-08-01')
    expect(result).toEqual({ ok: false, reason: 'advance-payment' })
    expect(REFUSAL_MESSAGE['advance-payment']).toMatch(/advance-payment terms/i)
  })

  it('refuses when there is no invoice date to count from', () => {
    expect(recalculateDueDate(null, 'Net-30', '2026-05-12')).toEqual({
      ok: false,
      reason: 'no-invoice-date',
    })
  })

  it('refuses terms that state no period, rather than guessing', () => {
    expect(recalculateDueDate('2026-04-12', 'to be agreed', null)).toEqual({
      ok: false,
      reason: 'unreadable-terms',
    })
  })

  it('every refusal has something to say to the person', () => {
    for (const reason of ['advance-payment', 'no-invoice-date', 'unreadable-terms'] as const) {
      expect(REFUSAL_MESSAGE[reason].length).toBeGreaterThan(20)
    }
  })
})
