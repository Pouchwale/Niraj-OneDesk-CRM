import { describe, expect, it } from 'vitest'

import type { Company, OverduePayment } from './types'
import { companyRowStats, overdueRowStats } from './row-stats'

function company(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: null,
    name: 'Co',
    contact_person: null,
    contact_number: '',
    email: null,
    payment_terms: '30 days',
    total_amount: 100000,
    invoice_date: null,
    due_date: null,
    status: 'overdue',
    assigned_coordinator_id: null,
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function payment(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'BP',
    customer_name: null,
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
    assigned_coordinator_id: null,
    status: 'overdue',
    extra_fields: {},
    imported_at: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('cards computed from the rows on screen', () => {
  it('count companies the way the unfiltered stats do: paid rows carry no balance', () => {
    const stats = companyRowStats([
      company({ id: 'a', status: 'critical', total_amount: 550000 }),
      company({ id: 'b', status: 'overdue', total_amount: 250000 }),
      company({ id: 'c', status: 'upcoming', total_amount: 100000 }),
      company({ id: 'd', status: 'paid', total_amount: 900000 }),
    ])
    expect(stats).toEqual({
      total: 4, overdue: 1, critical: 1, upcoming: 1, current: 0, paid: 1,
      noFollowup: 0, noFollowupAmount: 0, bankrupt: 0, bankruptAmount: 0, totalOutstanding: 900000,
    })
  })

  it('count ageing rows the way the unfiltered stats do: critical is money past 90 days', () => {
    const stats = overdueRowStats([
      payment({ id: 'a', status: 'in_progress', balance_due: 300000, due_0_30: 0, due_91_120: 300000 }),
      payment({ id: 'b', status: 'overdue' }),
      payment({ id: 'c', status: 'settled', balance_due: 0, due_0_30: 0 }),
    ])
    expect(stats).toEqual({
      total: 3, critical: 1, overdue: 1, inProgress: 1, settled: 1,
      bankrupt: 0, bankruptBalance: 0, noFollowup: 0, noFollowupAmount: 0,
      totalBalance: 350000,
    })
  })

  it('holds a bankrupt balance out of the total and the count, like no follow-up', () => {
    // Since 11 Sept 2026 a bankrupt customer leaves every figure and is listed
    // only in the Bankrupt register.
    const stats = overdueRowStats([
      payment({ id: 'a', status: 'overdue', balance_due: 200000, due_0_30: 200000 }),
      payment({ id: 'b', status: 'bankrupt', balance_due: 800000, due_0_30: 0, due_121_plus: 800000 }),
    ])

    expect(stats.totalBalance).toBe(200000)
    expect(stats.total).toBe(1)
    // Its 90+ money is not critical work either: nobody is chasing it.
    expect(stats.critical).toBe(0)
    // Counted on its own line, for the register.
    expect(stats.bankrupt).toBe(1)
    expect(stats.bankruptBalance).toBe(800000)
    expect(stats.inProgress).toBe(0)
    expect(stats.settled).toBe(0)
  })
})
