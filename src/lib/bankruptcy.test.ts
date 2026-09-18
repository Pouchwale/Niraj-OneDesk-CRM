import { describe, expect, it } from 'vitest'

import { overdueAttention } from './attention'
import { bankruptCodes, buildReceivablesBook, summariseBook } from './receivables-book'
import type { Company, OverduePayment } from './types'

/**
 * Declaring a company bankrupt.
 *
 * Since 11 Sept 2026 a bankrupt customer is held out the way no follow-up is:
 * out of every working list and every total, in both books, and listed only in
 * the Bankrupt register. (It used to stay in the totals as "still owed".)
 */

const ageing = (over: Partial<OverduePayment> & { id: string }): OverduePayment => ({
  bp_code: 'BP-1',
  customer_name: 'Gone Under Ltd',
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
  name: 'Gone Under Ltd',
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

describe('a bankrupt balance leaves the chase', () => {
  it('is not something to decide about this week', () => {
    // Even with 8 lakh past 120 days, which would otherwise be the most
    // urgent thing on the screen.
    expect(overdueAttention(ageing({ id: 'o1', status: 'bankrupt' }))).toBeNull()
  })

  it('while the same balance, not yet declared, still is', () => {
    expect(overdueAttention(ageing({ id: 'o1' }))?.reason).toBe('critical')
  })
})

describe('a bankrupt customer leaves the book', () => {
  it('is not counted towards what is owed', () => {
    const book = buildReceivablesBook({
      companies: [],
      overduePayments: [ageing({ id: 'o1', status: 'bankrupt' })],
      today: TODAY,
    })

    expect(book).toHaveLength(0)
    expect(summariseBook(book).outstanding).toBe(0)
  })

  it('takes the Active Payments invoices out with it, even before they are stamped', () => {
    // Most customers are in both books and the company record supplies the
    // figures. A declaration made before invoices were stamped must still
    // hold them out.
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1' })],
      overduePayments: [ageing({ id: 'o1', status: 'bankrupt' })],
      today: TODAY,
    })

    expect(book).toHaveLength(0)
    expect(summariseBook(book).outstanding).toBe(0)
  })

  it('holds out an invoice that carries the stamp itself', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1', bankrupt_declared_at: '2026-09-11T10:00:00Z' })],
      overduePayments: [],
      today: TODAY,
    })
    expect(book).toHaveLength(0)
  })

  it('leaves an undeclared customer alone', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1' })],
      overduePayments: [ageing({ id: 'o1' })],
      today: TODAY,
    })
    expect(book[0].isBankrupt).toBe(false)
    expect(summariseBook(book).outstanding).toBe(500000)
  })
})

describe('bankruptCodes', () => {
  it('collects the declared customers by BP code', () => {
    const codes = bankruptCodes([
      ageing({ id: 'o1', bp_code: 'BP-1', status: 'bankrupt' }),
      ageing({ id: 'o2', bp_code: 'BP-2' }),
      ageing({ id: 'o3', bp_code: 'bp-3', status: 'bankrupt' }),
    ])

    expect(codes.has('BP-1')).toBe(true)
    expect(codes.has('BP-2')).toBe(false)
    // Normalised, so a lower-case code in one book matches an upper-case one
    // in the other — the same rule the rest of the book uses.
    expect(codes.has('BP-3')).toBe(true)
  })

  it('is empty when nobody has been declared', () => {
    expect(bankruptCodes([ageing({ id: 'o1' })]).size).toBe(0)
  })
})
