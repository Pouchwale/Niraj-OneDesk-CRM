import { describe, it, expect, beforeEach } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import { addFollowup, editFollowup, getOverdueCommitments } from './followups-api'
import { getCompanies, getCompanyStats } from './companies-api'
import { getOverdueStats } from './overdue-api'
import { getFollowupCommitments } from './followups-api'
import { todayISO, addDaysISO } from './utils'
import type { Company, Followup, OverduePayment } from './types'

const COORD = 'coord-1'

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: `comp-sync-${Math.random().toString(36).slice(2, 8)}`,
    sap_bp_code: `BP-${Math.floor(Math.random() * 100000)}`,
    name: 'Sync Traders',
    contact_person: null,
    contact_number: '9000000000',
    email: null,
    payment_terms: '30 days',
    total_amount: 100000,
    invoice_date: addDaysISO(todayISO(), -40),
    due_date: addDaysISO(todayISO(), -10),
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

function makePayment(overrides: Partial<OverduePayment> = {}): OverduePayment {
  const id = `ovd-sync-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    bp_code: `BP-${Math.floor(Math.random() * 100000)}`,
    customer_name: 'Sync Beverages',
    balance_due: 50000,
    due_0_30: 50000,
    due_31_60: 0,
    due_61_90: 0,
    due_91_120: 0,
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
    status: 'overdue',
    extra_fields: {},
    imported_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function payload(entityType: 'company' | 'overdue_payment', entityId: string, overrides: Partial<Followup> = {}) {
  return {
    entity_type: entityType,
    entity_id: entityId,
    coordinator_id: COORD,
    followup_date: new Date().toISOString(),
    mode: 'call' as const,
    notes: 'Spoke to accounts.',
    customer_response: null,
    status: 'pending' as const,
    committed_date: null,
    committed_amount: null,
    next_reminder_date: null,
    proof_attachment_url: null,
    ...overrides,
  }
}

// The demo store is a module singleton; every test starts from an empty book.
beforeEach(() => {
  demoCompanyStore.companies = []
  demoCompanyStore.overduePayments = []
  demoCompanyStore.followups = []
})

describe('a closed account silences every rule at once', () => {
  it('drops a broken promise once the company is paid', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany({ name: 'Settled Co', sap_bp_code: 'BP-8001' }))
    await addFollowup(
      payload('company', company.id, {
        committed_date: addDaysISO(todayISO(), -3),
        committed_amount: 40000,
        status: 'committed',
      })
    )
    expect(await getOverdueCommitments(COORD)).toHaveLength(1)
    expect((await getFollowupCommitments()).some((c) => c.bp_code === 'BP-8001')).toBe(true)

    await addFollowup(payload('company', company.id, { status: 'paid' }))

    // The Overview count and the dashboard's promises agree.
    expect(await getOverdueCommitments(COORD)).toHaveLength(0)
    expect((await getFollowupCommitments()).some((c) => c.bp_code === 'BP-8001')).toBe(false)
  })

  it('drops a due reminder once the balance is settled', async () => {
    const { payment } = demoCompanyStore.upsertOverduePayment(makePayment({ customer_name: 'Closed Ltd' }))
    await addFollowup(
      payload('overdue_payment', payment.id, { next_reminder_date: addDaysISO(todayISO(), -1) })
    )
    expect((await getCompanyStats(COORD)).followupsDueToday).toBe(1)

    await addFollowup(payload('overdue_payment', payment.id, { status: 'paid' }))

    expect((await getCompanyStats(COORD)).followupsDueToday).toBe(0)
  })
})

describe('editing a follow-up re-syncs the record it belongs to', () => {
  it('reopens an overdue balance when "paid" is corrected', async () => {
    const { payment } = demoCompanyStore.upsertOverduePayment(makePayment())
    const logged = await addFollowup(payload('overdue_payment', payment.id, { status: 'paid' }))
    expect(demoCompanyStore.getOverduePaymentById(payment.id)?.status).toBe('settled')

    await editFollowup(logged!.id, { status: 'no_response' }, COORD)

    expect(demoCompanyStore.getOverduePaymentById(payment.id)?.status).toBe('in_progress')
  })

  it('settles the balance when a follow-up is corrected to paid', async () => {
    const { payment } = demoCompanyStore.upsertOverduePayment(makePayment())
    const logged = await addFollowup(payload('overdue_payment', payment.id, { status: 'no_response' }))
    expect(demoCompanyStore.getOverduePaymentById(payment.id)?.status).toBe('in_progress')

    await editFollowup(logged!.id, { status: 'paid' }, COORD)

    expect(demoCompanyStore.getOverduePaymentById(payment.id)?.status).toBe('settled')
  })
})

describe('the summary cards count the way the Overview does', () => {
  it('leave paid accounts out of the outstanding figure', async () => {
    demoCompanyStore.upsertCompany(makeCompany({ name: 'Open Co', total_amount: 100000, status: 'overdue' }))
    demoCompanyStore.upsertCompany(makeCompany({ name: 'Done Co', total_amount: 900000, status: 'paid' }))

    const stats = await getCompanyStats(COORD)
    // 'total' is the working list, which is what Active Payments shows: the
    // paid invoice is counted on its own line and left out of it, so the card
    // above the list and the list itself cannot disagree.
    expect(stats.total).toBe(1)
    expect(stats.paid).toBe(1)
    expect(stats.totalOutstanding).toBe(100000)
  })

  it('keep a balance critical while it is being worked on', async () => {
    demoCompanyStore.upsertOverduePayment(
      makePayment({ status: 'in_progress', balance_due: 300000, due_0_30: 0, due_91_120: 300000 })
    )
    demoCompanyStore.upsertOverduePayment(makePayment({ status: 'overdue' }))
    demoCompanyStore.upsertOverduePayment(
      makePayment({ status: 'settled', balance_due: 0, due_0_30: 0, due_121_plus: 0 })
    )

    const stats = await getOverdueStats(COORD)
    expect(stats.total).toBe(3)
    expect(stats.critical).toBe(1)
    expect(stats.inProgress).toBe(1)
    expect(stats.settled).toBe(1)
    expect(stats.totalBalance).toBe(350000)
  })
})

describe('promises to chase are the ones the team logged', () => {
  it('keeps the seeded matching hints out of the dashboard and the assistant', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany({ sap_bp_code: 'BP-8002' }))
    await addFollowup(
      payload('company', company.id, {
        committed_date: addDaysISO(todayISO(), -1),
        committed_amount: 25000,
        status: 'committed',
      })
    )

    // Only what a coordinator actually logged. The reconciliation desk used
    // to add seeded hints of its own here; it is gone, and a promise now has
    // exactly one source.
    const logged = await getFollowupCommitments()
    expect(logged.map((c) => c.bp_code)).toEqual(['BP-8002'])
  })
})

describe('an account\'s status follows the calendar, not the upload', () => {
  it('re-derives every status on read, so the badge, cards and filters agree', async () => {
    demoCompanyStore.upsertCompany(
      makeCompany({ name: 'Slipped Co', status: 'upcoming', due_date: addDaysISO(todayISO(), -10) })
    )
    demoCompanyStore.upsertCompany(
      makeCompany({ name: 'Old Co', status: 'overdue', due_date: addDaysISO(todayISO(), -75) })
    )
    demoCompanyStore.upsertCompany(
      makeCompany({ name: 'Settled Co', status: 'paid', due_date: addDaysISO(todayISO(), -90) })
    )

    const byName = new Map((await getCompanies(COORD)).map((c) => [c.name, c.status]))
    expect(byName.get('Slipped Co')).toBe('overdue')
    expect(byName.get('Old Co')).toBe('critical')
    // Paid is the team's decision; the calendar never reopens it.
    expect(byName.get('Settled Co')).toBe('paid')

    const stats = await getCompanyStats(COORD)
    expect(stats.overdue).toBe(1)
    expect(stats.critical).toBe(1)
    expect(stats.paid).toBe(1)
  })
})

describe('one BP code is one customer, however it was typed', () => {
  it('updates the existing row on a re-import typed differently', () => {
    demoCompanyStore.upsertOverduePayment(makePayment({ bp_code: 'BP-9100', balance_due: 10000 }))
    const { wasCreated } = demoCompanyStore.upsertOverduePayment(
      makePayment({ bp_code: ' bp-9100', balance_due: 12000 })
    )

    expect(wasCreated).toBe(false)
    expect(demoCompanyStore.getAllOverduePayments()).toHaveLength(1)
    expect(demoCompanyStore.getAllOverduePayments()[0].balance_due).toBe(12000)
  })

  it('matches a company on its code regardless of case', () => {
    const first = demoCompanyStore.upsertCompany(makeCompany({ sap_bp_code: 'BP-9200' }))
    const again = demoCompanyStore.upsertCompany(makeCompany({ sap_bp_code: 'bp-9200', total_amount: 5 }))

    expect(again.id).toBe(first.id)
    expect(demoCompanyStore.getAllCompanies()).toHaveLength(1)
  })
})
