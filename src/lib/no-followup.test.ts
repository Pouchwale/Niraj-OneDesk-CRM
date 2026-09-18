import { describe, expect, it } from 'vitest'

import { companyAttention, overdueAttention } from './attention'
import { buildReceivablesBook, summariseBook } from './receivables-book'
import { companyRowStats, overdueRowStats } from './row-stats'
import { isNoFollowup, markNoFollowup, summariseNoFollowup, CLEAR_NO_FOLLOWUP } from './no-followup'
import type { Company, OverduePayment } from './types'

/**
 * Setting a customer aside.
 *
 * The whole feature is one sentence — not chased, and not counted. Since 11
 * Sept 2026 bankruptcy holds the money out the same way, on its own line and
 * in its own register. So the tests here are mostly about the money: that the
 * balance leaves every total, that it leaves them on both screens rather than
 * one, and that it is still reported as excluded rather than simply gone.
 *
 * A balance that quietly disappeared from the outstanding figure would overstate
 * collections exactly the way a written-off debt does, which is the one outcome
 * nobody would forgive.
 */

const ageing = (over: Partial<OverduePayment> & { id: string }): OverduePayment => ({
  bp_code: 'BP-1',
  customer_name: 'Set Aside Ltd',
  balance_due: 800000,
  due_0_30: 0,
  due_31_60: 0,
  due_61_90: 0,
  due_91_120: 0,
  due_121_plus: 800000,
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

const company = (over: Partial<Company> & { id: string }): Company => ({
  sap_bp_code: 'BP-1',
  name: 'Set Aside Ltd',
  contact_person: null,
  contact_number: '',
  email: null,
  payment_terms: '30 days',
  total_amount: 500000,
  invoice_date: null,
  due_date: '2026-01-01',
  status: 'critical',
  assigned_coordinator_id: 'coord-1',
  module: null,
  remarks: null,
  extra_fields: {},
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
})

const TODAY = '2026-09-08'
const SET_ASIDE = markNoFollowup('coord-1', 'Written off after the dispute')

describe('the flag itself', () => {
  it('is the timestamp, not the note', () => {
    expect(isNoFollowup(company({ id: 'c1' }))).toBe(false)
    expect(isNoFollowup(company({ id: 'c1', ...SET_ASIDE }))).toBe(true)
    // A note without the timestamp is somebody halfway through an edit.
    expect(isNoFollowup(company({ id: 'c1', no_followup_note: 'maybe' }))).toBe(false)
  })

  it('records who decided it and why', () => {
    expect(SET_ASIDE.no_followup_by).toBe('coord-1')
    expect(SET_ASIDE.no_followup_note).toBe('Written off after the dispute')
    expect(markNoFollowup('coord-1', '   ').no_followup_note).toBeNull()
  })

  it('clears back to nothing, so a re-import cannot half-restore it', () => {
    expect(CLEAR_NO_FOLLOWUP.no_followup_at).toBeNull()
    expect(CLEAR_NO_FOLLOWUP.no_followup_by).toBeNull()
    expect(CLEAR_NO_FOLLOWUP.no_followup_note).toBeNull()
  })
})

describe('a set-aside balance leaves the chase', () => {
  it('is not something to decide about this week', () => {
    expect(overdueAttention(ageing({ id: 'o1', ...SET_ASIDE }))).toBeNull()
    expect(companyAttention(company({ id: 'c1', ...SET_ASIDE }), TODAY)).toBeNull()
  })

  it('while the same balance, not set aside, still is', () => {
    expect(overdueAttention(ageing({ id: 'o1' }))?.reason).toBe('critical')
    expect(companyAttention(company({ id: 'c1' }), TODAY)).not.toBeNull()
  })
})

describe('a set-aside balance leaves the totals', () => {
  it('drops out of the Overdue outstanding figure', () => {
    const stats = overdueRowStats([
      ageing({ id: 'o1', ...SET_ASIDE }),
      ageing({ id: 'o2', bp_code: 'BP-2', balance_due: 200000 }),
    ])
    expect(stats.totalBalance).toBe(200000)
    expect(stats.noFollowup).toBe(1)
    expect(stats.noFollowupAmount).toBe(800000)
  })

  it('drops out of the Active Payments outstanding figure', () => {
    const stats = companyRowStats([
      company({ id: 'c1', ...SET_ASIDE }),
      company({ id: 'c2', sap_bp_code: 'BP-2', total_amount: 100000 }),
    ])
    expect(stats.totalOutstanding).toBe(100000)
    expect(stats.noFollowup).toBe(1)
    expect(stats.noFollowupAmount).toBe(500000)
  })

  it('is reported as excluded, never as collected', () => {
    // The screens show this figure under the total. Money held back has to
    // stay nameable, or the drop reads as a payment that never arrived.
    const { count, amount } = summariseNoFollowup(
      [company({ id: 'c1', ...SET_ASIDE }), company({ id: 'c2' })],
      (c) => c.total_amount || 0
    )
    expect(count).toBe(1)
    expect(amount).toBe(500000)
  })

  it('leaves the shared receivables book too', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1', ...SET_ASIDE })],
      overduePayments: [ageing({ id: 'o1', ...SET_ASIDE })],
      today: TODAY,
    })
    expect(summariseBook(book).outstanding).toBe(0)
  })
})

describe('and it leaves both books together', () => {
  /*
   * The customer usually exists twice. Setting aside the Active Payments
   * record alone would leave the ageing row still counted and still chased -
   * the exact confusion the option exists to remove - so the book has to stay
   * silent about the BP code either way round.
   */
  it('a set-aside company does not let its ageing row resurrect the balance', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1', ...SET_ASIDE })],
      overduePayments: [ageing({ id: 'o1' })],
      today: TODAY,
    })
    expect(summariseBook(book).outstanding).toBe(0)
    expect(book).toHaveLength(0)
  })

  it('and an unrelated customer is untouched', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1', ...SET_ASIDE })],
      overduePayments: [ageing({ id: 'o2', bp_code: 'BP-9', balance_due: 250000 })],
      today: TODAY,
    })
    expect(summariseBook(book).outstanding).toBe(250000)
  })
})

describe('beside bankruptcy', () => {
  it('holds the money out the same way, each on its own line', () => {
    const bankrupt = overdueRowStats([ageing({ id: 'o1', status: 'bankrupt' })])
    const setAside = overdueRowStats([ageing({ id: 'o2', ...SET_ASIDE })])

    // Both leave the chase.
    expect(overdueAttention(ageing({ id: 'o1', status: 'bankrupt' }))).toBeNull()
    expect(overdueAttention(ageing({ id: 'o2', ...SET_ASIDE }))).toBeNull()

    // Both leave the total — bankruptcy used to stay in it, until 11 Sept 2026.
    expect(bankrupt.totalBalance).toBe(0)
    expect(setAside.totalBalance).toBe(0)

    // Each on its own line, so each register shows only its own money.
    expect(bankrupt.bankruptBalance).toBe(800000)
    expect(bankrupt.noFollowupAmount).toBe(0)
    expect(setAside.noFollowupAmount).toBe(800000)
    expect(setAside.bankruptBalance).toBe(0)
  })
})

describe('deleting a customer that was set aside', () => {
  /*
   * A delete that does not stay deleted, chosen knowingly: the invoices are
   * still in the workbook, so a later sync imports them again without the mark.
   * What matters here is that it only ever reaches records somebody actually
   * set aside — this removes real money from the book, and it must not be
   * possible to point it at a live account.
   */
  it('only ever applies to records that were set aside', () => {
    const live = company({ id: 'c1' })
    const aside = company({ id: 'c2', ...SET_ASIDE })

    expect(isNoFollowup(live)).toBe(false)
    expect(isNoFollowup(aside)).toBe(true)
  })

  it('covers every record of that customer, in both books', () => {
    // Setting aside was a decision about the customer, so deleting is too:
    // leaving one invoice behind would put the customer back in the list with
    // part of their balance and no explanation.
    const records = [
      company({ id: 'c1', invoice_no: 'INV-1', ...SET_ASIDE }),
      company({ id: 'c2', invoice_no: 'INV-2', ...SET_ASIDE }),
      company({ id: 'c3', sap_bp_code: 'BP-OTHER', invoice_no: 'INV-3' }),
    ]
    const mine = records.filter((c) => isNoFollowup(c) && c.sap_bp_code === 'BP-1')
    expect(mine.map((c) => c.id)).toEqual(['c1', 'c2'])
  })
})
