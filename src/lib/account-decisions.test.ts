/**
 * No follow-up and bankruptcy, decided from either book.
 *
 * Coordinators make these calls from the follow-up section of whichever
 * account they have open — an Active Payments invoice or an ageing row — and
 * the customer has to leave both books either way, stay out through a sync,
 * and come back whole when the call is undone.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import { getOverdueCommitments } from './followups-api'
import { isBankrupt, listBankruptCustomers } from './no-followup'
import { addDaysISO, todayISO } from './utils'
import type { Company, OverduePayment } from './types'

const COORD = 'coord-1'

function invoice(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: 'BP-DEC',
    invoice_no: overrides.id.toUpperCase(),
    name: 'Gone Under Ltd',
    contact_person: null,
    contact_number: '9000000000',
    email: null,
    payment_terms: '30 days',
    total_amount: 100000,
    invoice_date: addDaysISO(todayISO(), -60),
    due_date: addDaysISO(todayISO(), -30),
    status: 'overdue',
    assigned_coordinator_id: COORD,
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function ageingRow(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'BP-DEC',
    customer_name: 'Gone Under Ltd',
    balance_due: 250000,
    due_0_30: 0,
    due_31_60: 0,
    due_61_90: 0,
    due_91_120: 250000,
    due_121_plus: 0,
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
    assigned_coordinator_id: COORD,
    status: 'critical',
    extra_fields: {},
    imported_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

const company = (id: string) => demoCompanyStore.getCompanyById(id)!
const row = (id: string) => demoCompanyStore.getOverduePaymentById(id)!

beforeEach(() => {
  demoCompanyStore.companies = []
  demoCompanyStore.overduePayments = []
  demoCompanyStore.followups = []
})

describe('declaring bankrupt from an Active Payments invoice', () => {
  it('reaches the ageing row and every invoice of the customer', () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1' }))
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-2' }))
    demoCompanyStore.upsertOverduePayment(ageingRow({ id: 'ovd-1' }))

    const touched = demoCompanyStore.declareCustomerBankrupt('company', 'inv-1', COORD, 'NCLT 12/2026')

    expect(touched).toBe(3)
    expect(row('ovd-1').status).toBe('bankrupt')
    expect(row('ovd-1').bankrupt_declared_by).toBe(COORD)
    expect(isBankrupt(company('inv-2'))).toBe(true)
    expect(company('inv-2').bankrupt_note).toBe('NCLT 12/2026')
  })

  it('holds the money out of every total', () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1', total_amount: 100000 }))
    demoCompanyStore.upsertOverduePayment(ageingRow({ id: 'ovd-1', balance_due: 250000 }))

    demoCompanyStore.declareCustomerBankrupt('company', 'inv-1', COORD)

    expect(demoCompanyStore.getCompanyStats(COORD).totalOutstanding).toBe(0)
    expect(demoCompanyStore.getOverdueStats(COORD).totalBalance).toBe(0)
  })

  it('works for a customer the ageing report does not list yet', () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1' }))
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-2' }))

    demoCompanyStore.declareCustomerBankrupt('company', 'inv-2', COORD)

    expect(isBankrupt(company('inv-1'))).toBe(true)
    // And it is listed, so the money held out is not held out invisibly.
    const [listed] = listBankruptCustomers(demoCompanyStore.companies, demoCompanyStore.overduePayments)
    expect(listed).toMatchObject({ bpCode: 'BP-DEC', ageingBalance: null, invoices: 2, invoiceAmount: 200000 })
  })

  it('touches only that invoice when it has no BP code to match on', () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1', sap_bp_code: null, name: 'No Code' }))
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-2', sap_bp_code: null, name: 'No Code' }))

    demoCompanyStore.declareCustomerBankrupt('company', 'inv-1', COORD)

    expect(isBankrupt(company('inv-1'))).toBe(true)
    expect(isBankrupt(company('inv-2'))).toBe(false)
  })

  it('keeps who declared it first when somebody declares it again', () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1' }))
    demoCompanyStore.declareCustomerBankrupt('company', 'inv-1', COORD, 'first')
    demoCompanyStore.declareCustomerBankrupt('company', 'inv-1', 'admin-1', 'second')

    expect(company('inv-1').bankrupt_declared_by).toBe(COORD)
    expect(company('inv-1').bankrupt_note).toBe('first')
  })

  it('holds out what the next sync brings for the customer, in both books', () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1' }))
    demoCompanyStore.declareCustomerBankrupt('company', 'inv-1', COORD)

    const newInvoice = demoCompanyStore.upsertCompany(invoice({ id: 'inv-new' }))
    const { payment: newRow } = demoCompanyStore.upsertOverduePayment(ageingRow({ id: 'ovd-new' }))

    expect(isBankrupt(newInvoice)).toBe(true)
    expect(newRow.status).toBe('bankrupt')
    expect(newRow.bankrupt_declared_by).toBe(COORD)
  })
})

describe('reinstating a bankrupt customer', () => {
  it('brings both books back from the invoice, the ageing row to what its buckets say', () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1' }))
    demoCompanyStore.upsertOverduePayment(ageingRow({ id: 'ovd-1' }))
    demoCompanyStore.declareCustomerBankrupt('overdue_payment', 'ovd-1', COORD)

    const touched = demoCompanyStore.reinstateCustomer('company', 'inv-1')

    expect(touched).toBe(2)
    expect(row('ovd-1').status).toBe('critical')
    expect(row('ovd-1').bankrupt_declared_by).toBeNull()
    expect(isBankrupt(company('inv-1'))).toBe(false)
  })
})

describe('a customer set aside falls silent', () => {
  const brokenPromise = (entityType: 'company' | 'overdue_payment', entityId: string) => ({
    id: `fu-${entityId}`,
    entity_type: entityType,
    entity_id: entityId,
    coordinator_id: COORD,
    followup_date: new Date().toISOString(),
    mode: 'call' as const,
    notes: 'Will pay Friday',
    customer_response: null,
    committed_date: addDaysISO(todayISO(), -5),
    committed_amount: 50000,
    status: 'committed' as const,
    proof_attachment_url: null,
    next_reminder_date: addDaysISO(todayISO(), -1),
    created_at: new Date().toISOString(),
    edited_at: null,
  })

  it('stops nagging about a promise once the customer is set to no follow-up', async () => {
    demoCompanyStore.upsertCompany(invoice({ id: 'inv-1' }))
    demoCompanyStore.addFollowup(brokenPromise('company', 'inv-1'))
    expect(await getOverdueCommitments(COORD)).toHaveLength(1)

    demoCompanyStore.setNoFollowup('BP-DEC', 'inv-1', COORD)

    expect(await getOverdueCommitments(COORD)).toHaveLength(0)
    expect(demoCompanyStore.getFollowupsDue(COORD)).toHaveLength(0)
  })

  it('stops nagging about a promise once the customer is declared bankrupt', async () => {
    demoCompanyStore.upsertOverduePayment(ageingRow({ id: 'ovd-1' }))
    demoCompanyStore.addFollowup(brokenPromise('overdue_payment', 'ovd-1'))

    demoCompanyStore.declareCustomerBankrupt('overdue_payment', 'ovd-1', COORD)

    expect(await getOverdueCommitments(COORD)).toHaveLength(0)
  })
})

describe('the bankrupt register reads both books', () => {
  it('lists each customer once, counting only open invoices', () => {
    const companies = [
      invoice({ id: 'a1', bankrupt_declared_at: '2026-09-10T00:00:00Z', total_amount: 40000 }),
      invoice({ id: 'a2', bankrupt_declared_at: '2026-09-10T00:00:00Z', status: 'paid', total_amount: 0 }),
      invoice({ id: 'b1', sap_bp_code: 'BP-B', name: 'Invoice Only', bankrupt_declared_at: '2026-09-12T00:00:00Z' }),
      invoice({ id: 'c1', sap_bp_code: 'BP-C', name: 'Still Trading' }),
    ]
    const payments = [ageingRow({ id: 'o1', status: 'bankrupt', bankrupt_declared_at: '2026-09-10T00:00:00Z' })]

    const listed = listBankruptCustomers(companies, payments)

    expect(listed.map((l) => l.name)).toEqual(['Invoice Only', 'Gone Under Ltd'])
    expect(listed[1]).toMatchObject({ entityType: 'overdue_payment', ageingBalance: 250000, invoices: 1, invoiceAmount: 40000 })
    expect(listed[0]).toMatchObject({ entityType: 'company', entityId: 'b1', ageingBalance: null })
  })
})
