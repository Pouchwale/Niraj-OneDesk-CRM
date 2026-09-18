import { describe, expect, it } from 'vitest'

import type { Company, OverduePayment } from './types'
import { companyAttention, countByReason, groupStartingAt, overdueAttention, sortByAttention } from './attention'

const TODAY = '2026-09-06'

function company(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: null,
    name: 'Test Co',
    contact_person: null,
    contact_number: '',
    email: null,
    payment_terms: '30 days',
    total_amount: 100000,
    invoice_date: null,
    due_date: '2026-09-10',
    status: 'upcoming',
    assigned_coordinator_id: 'coord-1',
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: '2026-08-01',
    updated_at: '2026-08-01',
    ...overrides,
  }
}

function payment(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'BP-1',
    customer_name: 'Test Ltd',
    balance_due: 100000,
    due_0_30: 0,
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
    assigned_coordinator_id: 'coord-1',
    status: 'overdue',
    extra_fields: {},
    imported_at: '2026-09-01',
    created_at: '2026-09-01',
    updated_at: '2026-09-01',
    ...overrides,
  }
}

describe('companyAttention', () => {
  it('flags critical accounts by status or by days', () => {
    expect(companyAttention(company({ id: 'a', status: 'critical', due_date: '2026-06-28' }), TODAY)).toMatchObject({
      reason: 'critical',
      detail: '70 days overdue',
    })
    // 61 days past due is critical even if the stored status has not caught up.
    expect(companyAttention(company({ id: 'b', status: 'overdue', due_date: '2026-07-07' }), TODAY)?.reason).toBe('critical')
  })

  it('flags every overdue account, and says when critical is near', () => {
    // 15 days overdue: plainly overdue.
    expect(companyAttention(company({ id: 'a', status: 'overdue', due_date: '2026-08-22' }), TODAY)).toEqual({
      reason: 'overdue',
      detail: '15 days overdue',
      urgency: 46,
    })
    // 46 days overdue: 15 days from crossing 60, so the detail says so.
    expect(companyAttention(company({ id: 'b', status: 'overdue', due_date: '2026-07-22' }), TODAY)).toEqual({
      reason: 'overdue',
      detail: '46 days overdue · critical in 15 days',
      urgency: 15,
    })
    // 60 days overdue: critical tomorrow.
    expect(companyAttention(company({ id: 'c', status: 'overdue', due_date: '2026-07-08' }), TODAY)?.detail).toBe('60 days overdue · critical in 1 day')
    // The stored status is not trusted: an "upcoming" account past its date is overdue.
    expect(companyAttention(company({ id: 'd', status: 'upcoming', due_date: '2026-09-01' }), TODAY)?.reason).toBe('overdue')
  })

  it('flags accounts due within the week, including today', () => {
    expect(companyAttention(company({ id: 'a', due_date: '2026-09-06' }), TODAY)).toMatchObject({ reason: 'due_soon', detail: 'due today', urgency: 0 })
    expect(companyAttention(company({ id: 'b', due_date: '2026-09-13' }), TODAY)).toMatchObject({ reason: 'due_soon', detail: 'due in 7 days' })
    expect(companyAttention(company({ id: 'c', due_date: '2026-09-14' }), TODAY)).toBeNull()
  })

  it('leaves paid accounts and far-off dues alone', () => {
    expect(companyAttention(company({ id: 'a', status: 'paid', due_date: '2026-06-01' }), TODAY)).toBeNull()
    expect(companyAttention(company({ id: 'c', due_date: '2026-10-30' }), TODAY)).toBeNull()
    expect(companyAttention(company({ id: 'd', due_date: null }), TODAY)).toBeNull()
  })
})

describe('overdueAttention', () => {
  it('reads critical and approaching-critical off the buckets', () => {
    expect(overdueAttention(payment({ id: 'a', due_91_120: 285000, due_121_plus: 500000 }))).toMatchObject({
      reason: 'critical',
      detail: '₹7,85,000 of it past 90 days',
    })
    expect(overdueAttention(payment({ id: 'b', due_61_90: 150000 }))).toMatchObject({
      reason: 'overdue',
      detail: '₹1,50,000 of it in the 61–90 day bucket · crosses 90 next',
    })
    // Money past 90 outranks money in 61–90 on the same row.
    expect(overdueAttention(payment({ id: 'c', due_61_90: 150000, due_91_120: 1000 }))?.reason).toBe('critical')
  })

  it('leaves young balances and settled rows alone', () => {
    expect(overdueAttention(payment({ id: 'a', due_0_30: 50000, due_31_60: 20000 }))).toBeNull()
    expect(overdueAttention(payment({ id: 'b', status: 'settled', due_121_plus: 500000 }))).toBeNull()
  })
})

describe('ordering and grouping', () => {
  const rows = [
    company({ id: 'soon', due_date: '2026-09-09' }),
    company({ id: 'young', status: 'overdue', due_date: '2026-08-30' }),
    company({ id: 'near', status: 'overdue', due_date: '2026-07-15' }),
    company({ id: 'later', due_date: '2026-12-01' }),
    company({ id: 'crit-old', status: 'critical', due_date: '2026-05-01' }),
    company({ id: 'crit-new', status: 'critical', due_date: '2026-07-01' }),
    company({ id: 'today', due_date: '2026-09-06' }),
  ]
  const of = (c: Company) => companyAttention(c, TODAY)

  it('puts the most urgent first and drops what needs nothing', () => {
    expect(sortByAttention(rows, of).map((c) => c.id)).toEqual(['crit-old', 'crit-new', 'near', 'young', 'today', 'soon'])
  })

  it('marks where each group starts', () => {
    const sorted = sortByAttention(rows, of)
    expect(sorted.map((_, i) => groupStartingAt(sorted, i, of))).toEqual(['critical', null, 'overdue', null, 'due_soon', null])
  })

  it('counts each reason', () => {
    expect(countByReason(rows, of)).toEqual({ critical: 2, overdue: 2, due_soon: 2 })
  })
})
