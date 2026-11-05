/**
 * A dispute covers the amount disputed. New money the file shows for the same
 * customer goes on the Regular list (the Jainam Invamed case, 26 Oct 2026).
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import { splitDisputedBalance } from './dispute-split'
import { isSetAside } from './no-followup'
import type { Followup, OverduePayment } from './types'

const COORD = 'coord-1'

function fileRow(overrides: Partial<OverduePayment> = {}): OverduePayment {
  return {
    id: '',
    bp_code: 'C1472',
    customer_name: 'Jainam Invamed Private Limited',
    balance_due: 14681,
    due_0_30: 0,
    due_31_60: 0,
    due_61_90: 0,
    due_91_120: 0,
    due_121_plus: 14681,
    payment_terms: null,
    contact_person: null,
    contact_number: null,
    email: null,
    coordinator_name: 'Disha Acharya',
    sales_person_name: null,
    department: null,
    account_type: null,
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: COORD,
    status: 'critical',
    extra_fields: {},
    imported_at: new Date().toISOString(),
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

/** The file on 26 Oct: the old disputed money plus a new invoice in 0-30. */
const WITH_NEW_INVOICE = { balance_due: 160317, due_0_30: 145636, due_121_plus: 14681, status: 'critical' as const }

const rows = () => demoCompanyStore.getAllOverduePayments()
const regular = () => rows().filter((p) => !isSetAside(p) && p.status !== 'settled')

beforeEach(() => {
  demoCompanyStore.companies = []
  demoCompanyStore.overduePayments = []
  demoCompanyStore.followups = []
})

function disputedCustomer(): string {
  const { payment } = demoCompanyStore.upsertOverduePayment(fileRow({ id: 'ovd-jainam' }))
  demoCompanyStore.setNoFollowup('C1472', payment.id, 'admin-1', 'customer disputes the amount', 'dispute')
  return payment.id
}

describe('splitDisputedBalance', () => {
  it('takes the extra from the newest buckets', () => {
    const { disputed, extra } = splitDisputedBalance(
      { balance_due: 160317, due_0_30: 145636, due_31_60: 0, due_61_90: 0, due_91_120: 0, due_121_plus: 14681 },
      14681
    )
    expect(extra).toMatchObject({ balance_due: 145636, due_0_30: 145636, due_121_plus: 0 })
    expect(disputed).toMatchObject({ balance_due: 14681, due_0_30: 0, due_121_plus: 14681 })
  })

  it('leaves no extra when the balance is at or below the disputed amount', () => {
    const { disputed, extra } = splitDisputedBalance(
      { balance_due: 10000, due_0_30: 0, due_31_60: 0, due_61_90: 0, due_91_120: 0, due_121_plus: 10000 },
      14681
    )
    expect(extra.balance_due).toBe(0)
    expect(disputed.balance_due).toBe(10000)
  })
})

describe('a disputed customer whose balance grows', () => {
  it('saves the disputed amount when the dispute is applied', () => {
    const id = disputedCustomer()
    expect(demoCompanyStore.getOverduePaymentById(id)?.no_followup_amount).toBe(14681)
  })

  it('puts the new money on the Regular list and keeps the disputed part in dispute', () => {
    const id = disputedCustomer()
    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))

    const disputed = demoCompanyStore.getOverduePaymentById(id)!
    expect(isSetAside(disputed)).toBe(true)
    expect(disputed.balance_due).toBe(14681)

    expect(regular()).toHaveLength(1)
    expect(regular()[0]).toMatchObject({
      id: `${id}-extra`,
      dispute_extra_of: id,
      balance_due: 145636,
      due_0_30: 145636,
      due_121_plus: 0,
      status: 'overdue',
      assigned_coordinator_id: COORD,
    })
  })

  it('settles the extra row when the new invoice is paid, and reuses it next time', () => {
    const id = disputedCustomer()
    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))
    demoCompanyStore.upsertOverduePayment(fileRow())

    expect(regular()).toHaveLength(0)
    expect(demoCompanyStore.getOverduePaymentById(`${id}-extra`)).toMatchObject({ balance_due: 0, status: 'settled' })

    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))
    expect(rows()).toHaveLength(2)
    expect(regular()[0].balance_due).toBe(145636)
  })

  it('makes no extra row while the balance stays within the dispute', () => {
    disputedCustomer()
    demoCompanyStore.upsertOverduePayment(fileRow())
    expect(rows()).toHaveLength(1)
  })

  it('keeps an older dispute with no saved amount covering the whole balance', () => {
    const id = disputedCustomer()
    demoCompanyStore.updateOverduePayment(id, { no_followup_amount: null })
    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))
    expect(rows()).toHaveLength(1)
    expect(demoCompanyStore.getOverduePaymentById(id)?.balance_due).toBe(160317)
  })

  it('puts the customer back on one row, with the follow-ups, when the dispute is undone', () => {
    const id = disputedCustomer()
    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))
    demoCompanyStore.followups = [{ id: 'f-1', entity_type: 'overdue_payment', entity_id: `${id}-extra` } as Followup]

    demoCompanyStore.clearNoFollowup('C1472', id)

    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ id, balance_due: 160317, due_0_30: 145636, due_121_plus: 14681, no_followup_amount: null })
    expect(isSetAside(rows()[0])).toBe(false)
    expect(demoCompanyStore.followups[0].entity_id).toBe(id)
  })

  it('disputes everything owed today when the new amount is disputed too', () => {
    const id = disputedCustomer()
    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))

    demoCompanyStore.setNoFollowup('C1472', `${id}-extra`, 'admin-1', 'disputes the new invoice too', 'dispute')

    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ id, balance_due: 160317, no_followup_amount: 160317 })
    expect(regular()).toHaveLength(0)
  })

  it('removes the extra row with the disputed row', () => {
    const id = disputedCustomer()
    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))
    demoCompanyStore.deleteOverduePayment(id)
    expect(rows()).toHaveLength(0)
  })

  it('does not split a plain no follow-up or an export client', () => {
    const { payment } = demoCompanyStore.upsertOverduePayment(fileRow({ id: 'ovd-plain' }))
    demoCompanyStore.setNoFollowup('C1472', payment.id, 'admin-1', 'inter-company', null)
    demoCompanyStore.upsertOverduePayment(fileRow(WITH_NEW_INVOICE))
    expect(rows()).toHaveLength(1)
    expect(rows()[0].no_followup_amount).toBeNull()
  })
})
