import { describe, expect, it } from 'vitest'

import type { Company, Followup, OverduePayment, UserRole } from '@/lib/types'
import { buildAiContext, type SystemSnapshot } from './knowledge'

const TODAY = '2026-09-06'

function company(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: 'BP-1001',
    name: 'Balaji Print Pack',
    contact_person: 'Rajiv Mehra',
    contact_number: '',
    email: null,
    payment_terms: '60 days',
    total_amount: 550000,
    invoice_date: '2026-04-29',
    due_date: '2026-06-28',
    status: 'critical',
    assigned_coordinator_id: 'coord-1',
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: '2026-04-29',
    updated_at: '2026-04-29',
    ...overrides,
  }
}

function ageing(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'BP-3002',
    customer_name: 'Gokul Beverages',
    balance_due: 985000,
    due_0_30: 0,
    due_31_60: 0,
    due_61_90: 200000,
    due_91_120: 285000,
    due_121_plus: 500000,
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
    imported_at: '2026-09-01',
    created_at: '2026-09-01',
    updated_at: '2026-09-01',
    ...overrides,
  }
}

function followup(overrides: Partial<Followup> & { id: string }): Followup {
  return {
    entity_type: 'company',
    entity_id: 'c1',
    coordinator_id: 'coord-1',
    followup_date: '2026-09-01T10:00:00',
    mode: 'call',
    notes: 'Accounts desk will confirm the UTR.',
    customer_response: null,
    committed_date: '2026-09-04',
    committed_amount: 250000,
    status: 'committed',
    proof_attachment_url: null,
    next_reminder_date: '2026-09-05',
    created_at: '2026-09-01T10:00:00',
    edited_at: null,
    ...overrides,
  }
}

function snapshot(role: UserRole, overrides: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    role,
    userId: role === 'coordinator' ? 'coord-1' : 'admin-1',
    userName: role === 'coordinator' ? 'Pragati Patel' : 'Niki Patel',
    today: TODAY,
    companies: [
      company({ id: 'c1' }),
      company({ id: 'c2', sap_bp_code: 'BP-2001', name: 'Someone Elses Co', assigned_coordinator_id: 'coord-2', total_amount: 90000, status: 'overdue' }),
    ],
    overduePayments: [ageing({ id: 'o1' })],
    followups: [followup({ id: 'f1' }), followup({ id: 'f0', followup_date: '2026-08-20T10:00:00', status: 'no_response', notes: 'Left a message.', committed_date: null, committed_amount: null })],
    commitments: [{ bp_code: 'BP-1001', amount: 250000, committed_date: '2026-09-04', coordinator_id: 'coord-1' }],
    coordinators: [
      { id: 'coord-1', full_name: 'Pragati Patel', email: 'p@x', username: 'pragati' },
      { id: 'coord-2', full_name: 'Diya Prajapati', email: 'd@x', username: 'diya' },
    ],
    tasks: [],
    ...overrides,
  }
}

describe('buildAiContext', () => {
  it('gives a coordinator only their own accounts, with formatted totals', () => {
    const context = buildAiContext('how am I doing?', snapshot('coordinator'))
    expect(context.scope).toBe('own accounts only')
    expect(context.user).toEqual({ name: 'Pragati Patel', role: 'coordinator' })
    expect(context.customers.map((c) => c.name)).toEqual(['Gokul Beverages', 'Balaji Print Pack'])
    expect(context.totals).toEqual({ accounts: 2, outstanding: '₹15,35,000', pastDue: '₹15,35,000', pastNinetyDays: '₹13,35,000' })
    expect(context.team).toBeUndefined()
    expect(JSON.stringify(context)).not.toContain('Someone Elses Co')
  })

  it('adds the customer the question names, with its follow-ups and promise', () => {
    const context = buildAiContext('why is Balaji late?', snapshot('coordinator'))
    expect(context.customer).toMatchObject({
      name: 'Balaji Print Pack',
      bpCode: 'BP-1001',
      owner: 'Pragati Patel',
      status: 'critical',
      outstanding: '₹5,50,000',
      daysPastDue: 70,
      openPromise: '₹2,50,000 by 04 Sept 2026 (already past)',
    })
    expect(context.customer?.recentFollowups).toHaveLength(2)
    // Newest first, with the words the coordinator wrote.
    expect(context.customer?.recentFollowups[0]).toMatchObject({
      by: 'Pragati Patel',
      outcome: 'committed',
      notes: 'Accounts desk will confirm the UTR.',
      promise: '₹2,50,000 by 04 Sept 2026',
    })
  })

  it('gives the leader the whole book, the team and the broken promises', () => {
    const context = buildAiContext('who is behind?', snapshot('team_leader', { teamPlans: { 'coord-1': { done: 1, total: 2, open: 1, carriedOver: 0, oldestCarried: null, date: '2026-09-06' } } }))
    expect(context.scope).toBe('the whole business')
    expect(context.customers.map((c) => c.name)).toContain('Someone Elses Co')
    expect(context.team).toEqual([
      { coordinator: 'Pragati Patel', outstanding: '₹15,35,000', planDone: 1, planTotal: 2 },
      { coordinator: 'Diya Prajapati', outstanding: '₹90,000', planDone: 0, planTotal: 0 },
    ])
    expect(context.brokenPromises).toEqual([
      { customer: 'Balaji Print Pack', amount: '₹2,50,000', promisedFor: '04 Sept 2026', daysLate: 2, coordinator: 'Pragati Patel' },
    ])
  })

  it('carries the coordinator\'s plan and nudges through untouched', () => {
    const context = buildAiContext(
      'what first?',
      snapshot('coordinator', {
        myPlan: {
          done: 0,
          total: 1,
          carriedOver: 0,
          oldestCarried: null,
          date: '2026-09-06',
          items: [{ account: 'Balaji Print Pack', status: 'open', nudge: 'Promise broken.', waiting: null }],
        },
        tasks: [{ id: 't', kind: 'commitment_broken', priority: 2, message: 'Balaji promised and did not pay.', actions: [] }],
      })
    )
    expect(context.plan?.items[0].account).toBe('Balaji Print Pack')
    expect(context.nudges).toEqual(['Balaji promised and did not pay.'])
  })
})

describe('what the robot raises unprompted', () => {
  /*
   * The difference between a lookup and something worth calling intelligent is
   * noticing what is wrong before anybody goes looking for it. Every one of
   * these is computed from the records — nothing here is a guess, and each one
   * names a number somebody can check.
   */
  it('notices a due date that does not follow from its own terms', () => {
    const context = buildAiContext(
      'anything I should know?',
      snapshot('coordinator', {
        companies: [
          {
            id: 'c1',
            sap_bp_code: 'C0004',
            invoice_no: '5193',
            name: 'Aculife',
            contact_person: null,
            contact_number: '',
            email: null,
            payment_terms: 'Net-90',
            total_amount: 100000,
            invoice_date: '2026-01-16',
            // The file says March; Net-90 from January says April.
            due_date: '2026-03-02',
            status: 'critical',
            assigned_coordinator_id: 'coord-1',
            module: null,
            remarks: null,
            extra_fields: {},
            created_at: '2026-01-16',
            updated_at: '2026-01-16',
          },
        ],
      })
    )
    const raised = context.worthRaising ?? []
    expect(raised.some((r) => /does not follow from its terms/.test(r.what))).toBe(true)
    expect(raised.find((r) => /terms/.test(r.what))?.detail).toContain('Aculife')
  })

  it('says nothing when the records are in order', () => {
    // An assistant that always has something to raise is one nobody believes.
    const context = buildAiContext(
      'anything I should know?',
      snapshot('coordinator', { companies: [], overduePayments: [], commitments: [] })
    )
    expect(context.worthRaising).toBeUndefined()
  })
})
