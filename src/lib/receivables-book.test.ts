import { describe, expect, it } from 'vitest'

import {
  bookForCoordinator,
  buildReceivablesBook,
  findAccountForRecord,
  summariseBook,
} from './receivables-book'
import { normalizeBpCode, sameBpCode } from './bp-code'
import type { Company, OverduePayment } from './types'
import { toLocalISODate } from './utils'

const TODAY = '2026-09-06'

function day(offset: number): string {
  const date = new Date(`${TODAY}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return toLocalISODate(date)
}

function company(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: 'BP-1001',
    name: 'Balaji Print Pack',
    contact_person: null,
    contact_number: '',
    email: null,
    payment_terms: '30 days',
    total_amount: 550000,
    invoice_date: day(-90),
    due_date: day(-70),
    status: 'critical',
    assigned_coordinator_id: 'coord-1',
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: day(-90),
    updated_at: day(-90),
    ...overrides,
  }
}

function ageing(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'BP-3002',
    customer_name: 'Gokul Beverages',
    balance_due: 985000,
    due_0_30: 0,
    due_31_60: 200000,
    due_61_90: 0,
    due_91_120: 485000,
    due_121_plus: 300000,
    payment_terms: null,
    contact_person: null,
    contact_number: null,
    email: null,
    coordinator_name: 'Pragati',
    sales_person_name: null,
    department: null,
    account_type: null,
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: 'coord-1',
    status: 'critical',
    extra_fields: {},
    imported_at: day(-5),
    created_at: day(-5),
    updated_at: day(-5),
    ...overrides,
  }
}

describe('normalizeBpCode', () => {
  it('trims and upper-cases, and treats blank as no code', () => {
    expect(normalizeBpCode(' bp-3002 ')).toBe('BP-3002')
    expect(normalizeBpCode('')).toBeNull()
    expect(normalizeBpCode('   ')).toBeNull()
    expect(normalizeBpCode(null)).toBeNull()
  })

  it('matches the same customer however the code was typed', () => {
    expect(sameBpCode('bp-3002', 'BP-3002 ')).toBe(true)
    expect(sameBpCode('BP-3002', 'BP-3003')).toBe(false)
    expect(sameBpCode(null, null)).toBe(false)
  })
})

describe('buildReceivablesBook', () => {
  it('counts one customer once, letting the Active Payments record speak', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1', sap_bp_code: 'bp-1001' })],
      overduePayments: [ageing({ id: 'o1', bp_code: 'BP-1001', balance_due: 600000 })],
      today: TODAY,
    })

    expect(book).toHaveLength(1)
    expect(book[0].source).toBe('company')
    expect(book[0].outstanding).toBe(550000)
  })

  it('falls back to the ageing row when there is no Active Payments record', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1' })],
      overduePayments: [ageing({ id: 'o1' }), ageing({ id: 'o2', bp_code: 'BP-3005', balance_due: 100 })],
      today: TODAY,
    })

    const bySource = Object.fromEntries(book.map((a) => [a.bpCode, a.source]))
    expect(bySource).toEqual({ 'BP-1001': 'company', 'BP-3002': 'ageing', 'BP-3005': 'ageing' })
  })

  it('lets a paid record close the customer everywhere', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1', status: 'paid' })],
      // Stale rows elsewhere for the same customer do not bring them back.
      overduePayments: [ageing({ id: 'o1', bp_code: 'BP-1001' })],
      today: TODAY,
    })
    expect(book).toHaveLength(0)
  })

  it('skips settled ageing rows and zero balances', () => {
    const book = buildReceivablesBook({
      companies: [],
      overduePayments: [
        ageing({ id: 'o1', status: 'settled' }),
        ageing({ id: 'o2', bp_code: 'BP-3003', balance_due: 0 }),
      ],
      today: TODAY,
    })
    expect(book).toHaveLength(0)
  })

  it('reads overdue and critical the way each record defines them', () => {
    const book = buildReceivablesBook({
      companies: [
        company({ id: 'c1', status: 'critical' }),
        company({ id: 'c2', sap_bp_code: 'BP-1002', status: 'overdue', total_amount: 250000 }),
        company({ id: 'c3', sap_bp_code: 'BP-1003', status: 'upcoming', total_amount: 100000, due_date: day(5) }),
      ],
      overduePayments: [
        // Being worked on, but the money is still past 90 days.
        ageing({ id: 'o1', status: 'in_progress' }),
        ageing({ id: 'o2', bp_code: 'BP-3003', balance_due: 50000, due_31_60: 50000, due_91_120: 0, due_121_plus: 0 }),
      ],
      today: TODAY,
    })

    const totals = summariseBook(book)
    expect(totals.accounts).toBe(5)
    expect(totals.outstanding).toBe(550000 + 250000 + 100000 + 985000 + 50000)
    // Critical: the critical record and the ageing row with money past 91 days.
    expect(totals.criticalAccounts).toBe(2)
    expect(totals.criticalAmount).toBe(550000 + 785000)
    // Past due: everything but the record that is not yet due.
    expect(totals.pastDue).toBe(550000 + 250000 + 985000 + 50000)
    expect(totals.overdueAccounts).toBe(4)
  })

  it('splits the book by the coordinator who owns each record', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1' })],
      overduePayments: [ageing({ id: 'o1', assigned_coordinator_id: 'coord-2' })],
      today: TODAY,
    })
    expect(bookForCoordinator(book, 'coord-1').map((a) => a.bpCode)).toEqual(['BP-1001'])
    expect(bookForCoordinator(book, 'coord-2').map((a) => a.bpCode)).toEqual(['BP-3002'])
    expect(bookForCoordinator(book, 'coord-5')).toEqual([])
  })

  it('groups a customer without a BP code by their name, the way the import does', () => {
    // Active Payments holds a record per invoice, so a customer has several
    // rows here by design. With no code to group them by, the name has to do -
    // and it is the same fallback the import itself uses, so the book and the
    // file cannot end up disagreeing about how many customers there are.
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1', sap_bp_code: null }), company({ id: 'c2', sap_bp_code: '' })],
      overduePayments: [],
      today: TODAY,
    })
    expect(book).toHaveLength(1)
    expect(book[0].key).toBe('company:c1')
    expect(book[0].outstanding).toBe(company({ id: 'x' }).total_amount * 2)
  })

  it('still keeps two differently named codeless customers apart', () => {
    const book = buildReceivablesBook({
      companies: [
        company({ id: 'c1', sap_bp_code: null }),
        company({ id: 'c2', sap_bp_code: null, name: 'Someone Else' }),
      ],
      overduePayments: [],
      today: TODAY,
    })
    expect(book).toHaveLength(2)
    expect(book.map((a) => a.key)).toEqual(['company:c1', 'company:c2'])
  })

  it('adds a customer’s invoices together, counting them once', () => {
    // The change this whole book turns on: three invoice records, one account.
    const book = buildReceivablesBook({
      companies: [
        company({ id: 'c1', invoice_no: 'INV-1', total_amount: 100, due_date: '2026-08-01' }),
        company({ id: 'c2', invoice_no: 'INV-2', total_amount: 250, due_date: '2026-05-10' }),
        company({ id: 'c3', invoice_no: 'INV-3', total_amount: 400, due_date: '2026-06-15' }),
      ],
      overduePayments: [],
      today: TODAY,
    })
    expect(book).toHaveLength(1)
    expect(book[0].outstanding).toBe(750)
    // It reads from the oldest open invoice, which is the money waiting longest.
    expect(book[0].company?.id).toBe('c2')
    expect(book[0].invoices_open?.map((i) => i.invoice_no)).toEqual(['INV-2', 'INV-3', 'INV-1'])
  })

  it('finds the account a follow-up was logged against', () => {
    const book = buildReceivablesBook({
      companies: [company({ id: 'c1' })],
      overduePayments: [ageing({ id: 'o1', bp_code: 'BP-1001' })],
      today: TODAY,
    })
    expect(findAccountForRecord(book, 'company', 'c1')?.bpCode).toBe('BP-1001')
    // The ageing row lost to the company record, so it is not an account.
    expect(findAccountForRecord(book, 'overdue_payment', 'o1')).toBeUndefined()
  })
})
