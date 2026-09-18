import { describe, it, expect } from 'vitest'

import { buildAssistantTasks, PROOF_THRESHOLD, type AssistantContext } from './rules'
import type { Company, Followup, OverduePayment } from '@/lib/types'
import { addDaysISO } from '@/lib/utils'

const TODAY = '2026-06-15'
const COORD = 'coord-1'

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 'comp-1',
    sap_bp_code: 'BP-1',
    name: 'Balaji Print Pack',
    contact_person: null,
    contact_number: '9000000000',
    email: null,
    payment_terms: '30 days',
    total_amount: 250000,
    invoice_date: addDaysISO(TODAY, -40),
    due_date: addDaysISO(TODAY, -10),
    status: 'overdue',
    assigned_coordinator_id: COORD,
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: `${TODAY}T00:00:00.000Z`,
    updated_at: `${TODAY}T00:00:00.000Z`,
    ...overrides,
  }
}

function overduePayment(overrides: Partial<OverduePayment> = {}): OverduePayment {
  return {
    id: 'ovd-1',
    bp_code: 'BP-3001',
    customer_name: 'Gokul Beverages',
    balance_due: 500000,
    due_0_30: 0,
    due_31_60: 0,
    due_61_90: 200000,
    due_91_120: 300000,
    due_121_plus: 0,
    payment_terms: '30 days',
    contact_person: null,
    contact_number: null,
    email: null,
    coordinator_name: 'Priya Sharma',
    sales_person_name: null,
    department: null,
    account_type: null,
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: COORD,
    status: 'critical',
    extra_fields: {},
    imported_at: `${TODAY}T00:00:00.000Z`,
    created_at: `${TODAY}T00:00:00.000Z`,
    updated_at: `${TODAY}T00:00:00.000Z`,
    ...overrides,
  }
}

function followup(overrides: Partial<Followup> = {}): Followup {
  return {
    id: 'fu-1',
    entity_type: 'company',
    entity_id: 'comp-1',
    coordinator_id: COORD,
    followup_date: `${TODAY}T09:00:00.000Z`,
    mode: 'call',
    notes: 'Spoke to accounts.',
    customer_response: null,
    committed_date: null,
    committed_amount: null,
    status: 'pending',
    proof_attachment_url: null,
    next_reminder_date: null,
    created_at: `${TODAY}T09:00:00.000Z`,
    edited_at: null,
    ...overrides,
  }
}

function build(context: Partial<AssistantContext>) {
  return buildAssistantTasks({
    companies: [],
    overduePayments: [],
    followups: [],
    today: TODAY,
    ...context,
  })
}

/** Local-midnight timestamp, so followup_date lands on the intended day. */
function at(dateISO: string, hour = 10): string {
  return new Date(`${dateISO}T${String(hour).padStart(2, '0')}:00:00`).toISOString()
}

describe('yesterday recap', () => {
  it('summarises what the coordinator logged yesterday', () => {
    const tasks = build({
      companies: [company()],
      followups: [followup({ followup_date: at(addDaysISO(TODAY, -1)) })],
    })

    const recap = tasks.find((t) => t.kind === 'yesterday_recap')
    expect(recap?.message).toContain('Yesterday you logged 1 follow-up')
    expect(recap?.message).toContain('Balaji Print Pack')
  })

  it('calls out commitments landing today', () => {
    const tasks = build({
      companies: [company()],
      followups: [
        followup({
          followup_date: at(addDaysISO(TODAY, -1)),
          committed_date: TODAY,
          committed_amount: 50000,
          status: 'committed',
        }),
      ],
    })

    expect(tasks.find((t) => t.kind === 'yesterday_recap')?.detail).toContain(
      '1 of them promised payment today'
    )
  })

  it('stays quiet when nothing was logged yesterday', () => {
    const tasks = build({ companies: [company()], followups: [followup()] })
    expect(tasks.some((t) => t.kind === 'yesterday_recap')).toBe(false)
  })
})

describe('commitment nudges', () => {
  it('asks whether a payment promised today arrived', () => {
    const tasks = build({
      companies: [company()],
      followups: [
        followup({ committed_date: TODAY, committed_amount: 50000, status: 'committed' }),
      ],
    })

    const task = tasks.find((t) => t.kind === 'commitment_due_today')
    expect(task?.message).toContain('promised')
    expect(task?.message).toContain('today')
    // The robot only ever points at the record; it never logs the outcome.
    expect(task?.actions.map((a) => a.intent)).toEqual(['open', 'snooze'])
  })

  it('reports how late a broken commitment is', () => {
    const tasks = build({
      companies: [company()],
      followups: [
        followup({
          committed_date: addDaysISO(TODAY, -3),
          committed_amount: 50000,
          status: 'committed',
        }),
      ],
    })

    const task = tasks.find((t) => t.kind === 'commitment_broken')
    expect(task?.message).toContain('3 days ago')
    expect(task?.actions.map((a) => a.intent)).toEqual(['open', 'snooze'])
  })

  it('drops commitments once the follow-up is paid', () => {
    const tasks = build({
      companies: [company()],
      followups: [
        followup({ committed_date: addDaysISO(TODAY, -3), committed_amount: 50000, status: 'paid' }),
      ],
    })

    expect(tasks.some((t) => t.kind === 'commitment_broken')).toBe(false)
  })

  it('only chases proof above the threshold', () => {
    const big = build({
      companies: [company()],
      followups: [followup({ committed_amount: PROOF_THRESHOLD, status: 'paid' })],
    })
    const small = build({
      companies: [company()],
      followups: [followup({ committed_amount: 500, status: 'paid' })],
    })

    expect(big.some((t) => t.kind === 'proof_required')).toBe(true)
    expect(small.some((t) => t.kind === 'proof_required')).toBe(false)
  })
})

describe('proof chasing', () => {
  it('chases evidence for a large settled payment', () => {
    const tasks = build({
      companies: [company()],
      followups: [followup({ status: 'paid', committed_amount: 250000 })],
    })

    const task = tasks.find((t) => t.kind === 'proof_required')
    expect(task?.followupId).toBe('fu-1')
    // Proof is attached on the record itself, never through the robot.
    expect(task?.actions.map((a) => a.intent)).toEqual(['open', 'snooze'])
  })

  it('stops once proof is attached', () => {
    const tasks = build({
      companies: [company()],
      followups: [
        followup({
          status: 'paid',
          committed_amount: 250000,
          proof_attachment_url: 'https://example.test/receipt.png',
        }),
      ],
    })

    expect(tasks.some((t) => t.kind === 'proof_required')).toBe(false)
  })

  it('does not chase small payments', () => {
    const tasks = build({
      companies: [company()],
      followups: [followup({ status: 'paid', committed_amount: 1000 })],
    })

    expect(tasks.some((t) => t.kind === 'proof_required')).toBe(false)
  })
})

describe('coverage nudges', () => {
  it('flags overdue accounts that have never been contacted', () => {
    const tasks = build({ companies: [company({ status: 'critical' })] })

    const task = tasks.find((t) => t.kind === 'overdue_untouched')
    expect(task?.message).toContain('never been followed up')
    expect(task?.entityType).toBe('company')
  })

  it('flags untouched overdue balances too', () => {
    const tasks = build({ overduePayments: [overduePayment()] })

    const task = tasks.find((t) => t.kind === 'overdue_untouched')
    expect(task?.entityType).toBe('overdue_payment')
    expect(task?.detail).toContain('past 90 days')
  })

  it('goes quiet once the account has been contacted', () => {
    const tasks = build({
      companies: [company({ status: 'critical' })],
      followups: [followup()],
    })

    expect(tasks.some((t) => t.kind === 'overdue_untouched')).toBe(false)
  })

  it('warns before a payment falls due, not after', () => {
    const soon = build({ companies: [company({ status: 'upcoming', due_date: addDaysISO(TODAY, 2) })] })
    const far = build({ companies: [company({ status: 'current', due_date: addDaysISO(TODAY, 20) })] })

    expect(soon.some((t) => t.kind === 'payment_due_soon')).toBe(true)
    expect(far.some((t) => t.kind === 'payment_due_soon')).toBe(false)
  })

  it('chases accounts that have gone quiet for two weeks', () => {
    const stale = build({
      companies: [company()],
      followups: [followup({ followup_date: at(addDaysISO(TODAY, -20)) })],
    })
    const recent = build({
      companies: [company()],
      followups: [followup({ followup_date: at(addDaysISO(TODAY, -3)) })],
    })

    expect(stale.find((t) => t.kind === 'stale_contact')?.message).toContain('20 days')
    expect(recent.some((t) => t.kind === 'stale_contact')).toBe(false)
  })
})

describe('queue behaviour', () => {
  it('puts the most costly nudges first', () => {
    const tasks = build({
      companies: [company({ status: 'critical' })],
      overduePayments: [overduePayment()],
      followups: [
        followup({ id: 'fu-late', committed_date: addDaysISO(TODAY, -5), committed_amount: 50000 }),
        followup({ id: 'fu-today', committed_date: TODAY, committed_amount: 50000 }),
      ],
    })

    const kinds = tasks.map((t) => t.kind)
    expect(kinds.indexOf('commitment_due_today')).toBeLessThan(kinds.indexOf('commitment_broken'))
    expect(kinds.indexOf('commitment_broken')).toBeLessThan(kinds.indexOf('overdue_untouched'))
  })

  it('gives every task a stable id so snoozes survive a reload', () => {
    const context = {
      companies: [company()],
      followups: [followup({ committed_date: TODAY, committed_amount: 1000 })],
    }

    expect(build(context).map((t) => t.id)).toEqual(build(context).map((t) => t.id))
  })

  it('raises nothing when there is nothing to chase', () => {
    expect(build({ companies: [company({ status: 'paid' })] })).toHaveLength(0)
  })
})

describe('old money that has stopped moving', () => {
  /** A balance in the 90+ buckets, last discussed some days ago. */
  const agedContext = (silentDays: number, overrides: Partial<OverduePayment> = {}) => ({
    overduePayments: [overduePayment(overrides)],
    followups: [
      followup({
        id: 'fu-aged',
        entity_type: 'overdue_payment',
        entity_id: 'ovd-1',
        followup_date: at(addDaysISO(TODAY, -silentDays)),
      }),
    ],
  })

  it('chases a 90+ balance that has gone quiet for a week', () => {
    const task = build(agedContext(9)).find((t) => t.kind === 'overdue_ageing')

    expect(task).toBeDefined()
    expect(task!.entityId).toBe('ovd-1')
    // Only the aged portion, not the whole 5,00,000 balance.
    expect(task!.amount).toBe(300000)
    expect(task!.message).toContain('past 90 days')
    expect(task!.message).toContain('9 days')
  })

  it('stays quiet while the account is still being worked', () => {
    expect(build(agedContext(3)).some((t) => t.kind === 'overdue_ageing')).toBe(false)
  })

  it('leaves a balance alone until it actually ages past 90 days', () => {
    const tasks = build(agedContext(20, { due_91_120: 0, due_121_plus: 0, due_61_90: 500000 }))
    expect(tasks.some((t) => t.kind === 'overdue_ageing')).toBe(false)
  })

  it('does not duplicate the never-followed-up nudge', () => {
    // No follow-ups at all: that is the untouched rule's job, not this one.
    const tasks = build({ overduePayments: [overduePayment()] })
    expect(tasks.some((t) => t.kind === 'overdue_ageing')).toBe(false)
    expect(tasks.some((t) => t.kind === 'overdue_untouched')).toBe(true)
  })

  it('holds off while the customer has an unbroken promise', () => {
    const tasks = build({
      overduePayments: [overduePayment()],
      followups: [
        followup({
          id: 'fu-aged',
          entity_type: 'overdue_payment',
          entity_id: 'ovd-1',
          followup_date: at(addDaysISO(TODAY, -12)),
          status: 'committed',
          committed_date: addDaysISO(TODAY, 4),
          committed_amount: 300000,
        }),
      ],
    })
    expect(tasks.some((t) => t.kind === 'overdue_ageing')).toBe(false)
  })

  it('raises one card, not two, for the same account', () => {
    const tasks = build(agedContext(20))
    expect(tasks.filter((t) => t.entityId === 'ovd-1')).toHaveLength(1)
    expect(tasks.some((t) => t.kind === 'stale_contact')).toBe(false)
  })

  it('outranks paperwork so it is answered first', () => {
    const tasks = build(agedContext(9))
    const ageing = tasks.findIndex((t) => t.kind === 'overdue_ageing')
    const untouched = tasks.findIndex((t) => t.kind === 'overdue_untouched')
    expect(ageing).toBeGreaterThanOrEqual(0)
    if (untouched >= 0) expect(ageing).toBeLessThan(untouched)
  })

  it('calls out the 120+ portion explicitly', () => {
    const task = build(agedContext(10, { due_91_120: 100000, due_121_plus: 400000 })).find(
      (t) => t.kind === 'overdue_ageing'
    )
    expect(task!.amount).toBe(500000)
    expect(task!.detail).toContain('past 120 days')
  })

  it('says nothing once the balance is settled', () => {
    const tasks = build(agedContext(20, { status: 'settled' }))
    expect(tasks.some((t) => t.kind === 'overdue_ageing')).toBe(false)
  })
})
