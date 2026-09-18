import { describe, expect, it } from 'vitest'

import { companyAttention, overdueAttention } from './attention'
import { buildReceivablesBook, summariseBook } from './receivables-book'
import { companyRowStats, overdueRowStats } from './row-stats'
import { buildDueNotifications } from './notifications'
import { CHASE_FLOOR, worthChasing } from './status-rules'
import { todayISO } from './utils'
import type { Company, OverduePayment } from './types'

/**
 * The few paise a part-payment leaves behind.
 *
 * The live file has ten invoices sitting between 8 and 50 paise — ₹3.34 in
 * total — and each was presenting as a critical account 120 days overdue,
 * because ₹0.39 is past due like any other balance. Nobody rings a customer
 * about 39 paise.
 *
 * The line these tests defend is the one between "stop chasing it" and "write
 * it off". The balance is untouched and still counts towards what is owed on
 * every screen; only the chasing stops. Getting that backwards would quietly
 * shrink the receivables, which is the one thing this must never do.
 */

const company = (over: Partial<Company> & { id: string }): Company => ({
  sap_bp_code: 'C0012',
  invoice_no: '1553',
  name: 'Amul Fed Dairy',
  contact_person: null,
  contact_number: '',
  email: null,
  payment_terms: 'Net-30',
  total_amount: 0.48,
  invoice_date: null,
  due_date: '2026-05-01',
  status: 'critical',
  assigned_coordinator_id: 'coord-1',
  module: null,
  remarks: null,
  extra_fields: {},
  created_at: '2026-05-01',
  updated_at: '2026-05-01',
  ...over,
})

const ageing = (over: Partial<OverduePayment> & { id: string }): OverduePayment => ({
  bp_code: 'C0012',
  customer_name: 'Amul Fed Dairy',
  balance_due: 0.48,
  due_0_30: 0,
  due_31_60: 0,
  due_61_90: 0,
  due_91_120: 0,
  due_121_plus: 0.48,
  payment_terms: null,
  contact_person: null,
  contact_number: null,
  email: null,
  coordinator_name: null,
  sales_person_name: null,
  department: null,
  account_type: null,
  followup_details: null,
  followup_timeline: null,
  assigned_coordinator_id: 'coord-1',
  status: 'critical',
  extra_fields: {},
  imported_at: '2026-09-01',
  created_at: '2026-09-01',
  updated_at: '2026-09-01',
  ...over,
})

const TODAY = '2026-09-09'

describe('what counts as worth chasing', () => {
  it('takes anything from a rupee up', () => {
    expect(worthChasing(CHASE_FLOOR)).toBe(true)
    expect(worthChasing(4419)).toBe(true)
  })

  it('leaves the paise alone', () => {
    expect(worthChasing(0.48)).toBe(false)
    expect(worthChasing(0.08)).toBe(false)
    expect(worthChasing(0)).toBe(false)
  })

  it('reads a credit by its size, not its sign', () => {
    // A real credit balance keeps behaving as it always has; a credit of a few
    // paise is as uninteresting as a debt of a few paise.
    expect(worthChasing(-22275)).toBe(true)
    expect(worthChasing(-0.5)).toBe(false)
  })
})

describe('a few paise stop asking for attention', () => {
  it('leaves the Critical & closing in window, on both screens', () => {
    // 130 days past due and still not worth a phone call.
    expect(companyAttention(company({ id: 'c1' }), TODAY)).toBeNull()
    expect(overdueAttention(ageing({ id: 'o1' }))).toBeNull()
  })

  it('while a real balance on the same dates still is', () => {
    expect(companyAttention(company({ id: 'c1', total_amount: 4419 }), TODAY)?.reason).toBe('critical')
    expect(overdueAttention(ageing({ id: 'o1', balance_due: 4419, due_121_plus: 4419 }))?.reason).toBe('critical')
  })

  it('and the bell says nothing about it', () => {
    // The bell reads the real clock rather than the date it is handed, so the
    // account has to fall due on the actual today or this tests nothing.
    const now = todayISO()
    const due = company({ id: 'c1', due_date: now, status: 'overdue' })
    expect(buildDueNotifications([due], now)).toEqual([])
    expect(buildDueNotifications([{ ...due, total_amount: 4419 }], now)).toHaveLength(1)
  })
})

describe('but the money is still owed', () => {
  /*
   * The whole point of choosing "stop chasing" over "settle": these are not
   * written off. A balance that vanished from the totals would overstate
   * collections, and ₹3.34 of quiet arithmetic is still arithmetic nobody
   * asked for.
   */
  it('still counts in the Active Payments outstanding figure', () => {
    const stats = companyRowStats([company({ id: 'c1' }), company({ id: 'c2', total_amount: 100 })])
    expect(stats.totalOutstanding).toBeCloseTo(100.48, 2)
    expect(stats.noFollowup).toBe(0)
  })

  it('still counts in the Overdue balance', () => {
    const stats = overdueRowStats([ageing({ id: 'o1' })])
    expect(stats.totalBalance).toBeCloseTo(0.48, 2)
  })

  it('and still stands in the shared receivables book', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1' })],
      overduePayments: [],
      today: TODAY,
    })
    expect(book).toHaveLength(1)
    expect(summariseBook(book).outstanding).toBeCloseTo(0.48, 2)
  })
})

describe('a paid invoice leaves the working list', () => {
  /*
   * Active Payments is what is still to be collected. Once the file says an
   * invoice is settled it is history, and history in the middle of a chase list
   * is just rows to scroll past — the more so now that there is one row per
   * invoice rather than one per customer.
   *
   * The count above the list has to move with it, or the card says 1,011 while
   * the table shows 900 and neither figure can be trusted.
   */
  it('is counted on its own line, not in the working total', () => {
    const stats = companyRowStats([
      company({ id: 'c1', total_amount: 4419, status: 'overdue' }),
      company({ id: 'c2', total_amount: 0, status: 'paid' }),
    ])
    expect(stats.paid).toBe(1)
    expect(stats.totalOutstanding).toBe(4419)
  })

  it('and carries no outstanding balance', () => {
    const stats = companyRowStats([company({ id: 'c2', total_amount: 900000, status: 'paid' })])
    expect(stats.totalOutstanding).toBe(0)
  })
})
