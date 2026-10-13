import { beforeEach, describe, expect, it } from 'vitest'

import type { Company, Followup, OverduePayment } from '@/lib/types'
import { balanceLookup, customerLookup, openAccountKeys, waitingCustomers } from './daily-plan'
import { ensurePlan, resetPlansForTests } from './plan-store'
import { buildAssistantTasks } from './rules'

const TODAY = '2026-10-07'
const ME = 'coord-1'

function invoice(id: string, amount = 50000): Company {
  return {
    id, sap_bp_code: `INV-${id}`, name: `Active ${id}`, invoice_no: id, contact_person: null, contact_number: '',
    email: null, payment_terms: '30 days', total_amount: amount, invoice_date: '2026-06-01', due_date: '2026-07-01',
    status: 'critical', assigned_coordinator_id: ME, module: null, remarks: null, extra_fields: {},
    created_at: '2026-06-01', updated_at: '2026-06-01',
  } as Company
}

function ageing(id: string, balance = 80000): OverduePayment {
  return {
    id, bp_code: `OVD-${id}`, customer_name: `Overdue ${id}`, balance_due: balance, due_0_30: 0, due_31_60: 0,
    due_61_90: 0, due_91_120: 0, due_121_plus: balance, payment_terms: null, contact_person: null, contact_number: null,
    email: null, coordinator_name: null, sales_person_name: null, department: null, account_type: null,
    followup_details: null, followup_timeline: null, assigned_coordinator_id: ME, status: 'critical',
    extra_fields: {}, imported_at: '', created_at: '', updated_at: '',
  }
}

function followup(entityType: 'company' | 'overdue_payment', entityId: string, extra: Partial<Followup> = {}): Followup {
  return {
    id: `fu-${entityId}-${Math.random().toString(36).slice(2, 7)}`, entity_type: entityType, entity_id: entityId,
    coordinator_id: ME, followup_date: '2026-10-01T10:00:00', mode: 'call', notes: null, customer_response: null,
    committed_date: null, committed_amount: null, status: 'pending', proof_attachment_url: null,
    next_reminder_date: null, created_at: '2026-10-01T10:00:00.000Z', edited_at: null, ...extra,
  }
}

function planFor(date: string, companies: Company[], overdue: OverduePayment[], followups: Followup[] = [], withInvoices = false) {
  const tasks = buildAssistantTasks({ companies, overduePayments: overdue, followups, today: date })
  const open = openAccountKeys(companies, overdue)
  return ensurePlan(ME, date, tasks, {
    followups, open, mine: open,
    customerOf: customerLookup(companies, overdue),
    balanceOf: balanceLookup(companies, overdue),
    overduePayments: overdue,
    ...(withInvoices ? { companies } : {}),
  })
}

beforeEach(() => resetPlansForTests())

describe('eight a day: four Active Payments, four Overdue Payments', () => {
  const companies = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => invoice(id))
  const overdue = ['p', 'q', 'r', 's', 't', 'u'].map((id) => ageing(id))

  it('hands out four of each together', () => {
    const plan = planFor(TODAY, companies, overdue)
    expect(plan.items).toHaveLength(8)
    expect(plan.items.filter((i) => i.entityType === 'company')).toHaveLength(4)
    expect(plan.items.filter((i) => i.entityType === 'overdue_payment')).toHaveLength(4)
    // The overdue four are part of the day, not an extra round.
    expect(plan.items.every((i) => !i.round)).toBe(true)
  })

  it('carries unfinished overdue tasks to the next day, as well as Active Payments ones', () => {
    const first = planFor(TODAY, companies, overdue)
    const next = planFor('2026-10-08', companies, overdue)
    const yesterdayOverdue = first.items.filter((i) => i.entityType === 'overdue_payment').map((i) => i.entityId)
    const carried = next.items.filter((i) => i.carriedFrom === TODAY)
    expect(carried.filter((i) => i.entityType === 'overdue_payment').map((i) => i.entityId).sort()).toEqual(
      [...yesterdayOverdue].sort()
    )
    expect(carried.filter((i) => i.entityType === 'company')).toHaveLength(4)
    // On top of the 8 leftovers, fresh work from the customers still free (2 + 2 here).
    expect(next.items).toHaveLength(12)
    expect(next.items.slice(0, 4).every((i) => i.carriedFrom === TODAY)).toBe(true)
  })
})

describe('nothing before the next follow-up date', () => {
  it('leaves out a customer whose latest follow-up sets a later next date', () => {
    const companies = [invoice('a'), invoice('b')]
    const overdue = [ageing('p'), ageing('q')]
    const followups = [
      followup('company', 'a', { next_reminder_date: '2026-10-10' }),
      followup('overdue_payment', 'p', { committed_date: '2026-10-09', committed_amount: 20000 }),
    ]
    const plan = planFor(TODAY, companies, overdue, followups)
    const planned = plan.items.map((i) => i.entityId)
    expect(planned).not.toContain('a')
    expect(planned).not.toContain('p')
    expect(planned).toEqual(expect.arrayContaining(['b', 'q']))
  })

  it('brings them back on that day', () => {
    const followups = [followup('company', 'a', { next_reminder_date: '2026-10-10' })]
    expect(waitingCustomers(followups, '2026-10-09').has('company:a')).toBe(true)
    expect(waitingCustomers(followups, '2026-10-10').has('company:a')).toBe(false)
  })

  it('reads only the latest follow-up: a newer one with no date releases the customer', () => {
    const followups = [
      followup('company', 'a', { next_reminder_date: '2026-10-20' }),
      followup('company', 'a', { followup_date: '2026-10-05T10:00:00', created_at: '2026-10-05T10:00:00.000Z' }),
    ]
    expect(waitingCustomers(followups, TODAY).size).toBe(0)
  })

  it('keeps an unfinished task waiting too, instead of carrying it before its date', () => {
    const companies = [invoice('a'), invoice('b')]
    planFor(TODAY, companies, [])
    // Logged before the next plan, setting a later date: the task waits.
    const followups = [
      followup('company', 'a', { followup_date: '2026-10-06T10:00:00', created_at: '2026-10-06T10:00:00.000Z', next_reminder_date: '2026-10-15' }),
    ]
    const next = planFor('2026-10-08', companies, [], followups)
    expect(next.items.map((i) => i.entityId)).not.toContain('a')
  })
})

describe('the Active Payments half is filled even when nobody has gone quiet', () => {
  it('fills from past-due invoices, oldest first, one per customer, skipping recent calls', () => {
    const old = { ...invoice('old', 90000), due_date: '2026-03-01' }
    const older = { ...invoice('older', 20000), due_date: '2026-02-01' }
    const notDue = { ...invoice('later', 99000), due_date: '2026-12-01', status: 'current' as const }
    const small = { ...invoice('small', 500), due_date: '2026-01-01' }
    const rungToday = { ...invoice('rung', 70000), due_date: '2026-01-15' }
    const companies = [old, older, notDue, small, rungToday]
    // Called today and not long ago: no nudge is raised for any of these.
    const followups = ['old', 'older', 'rung'].map((id) =>
      followup('company', id, { followup_date: `${TODAY}T09:00:00`, created_at: id === 'rung' ? `${TODAY}T09:00:00.000Z` : '2026-10-05T09:00:00.000Z' })
    )
    const plan = planFor(TODAY, companies, [], followups, true)
    // Called two days ago with no next date, or today: resting. The invoice due in December is not work yet.
    expect(plan.items.map((i) => i.entityId)).toEqual([])
  })
})

describe('no repeats: a customer rests after a call', () => {
  const companies = ['a', 'b', 'c'].map((id) => invoice(id))
  const calledOn = (id: string, date: string, extra: Partial<Followup> = {}) =>
    followup('company', id, { followup_date: `${date}T10:00:00`, created_at: `${date}T10:00:00.000Z`, ...extra })

  it('leaves out for five days a customer followed up with no next date', () => {
    const followups = [calledOn('a', '2026-10-03'), calledOn('b', '2026-10-02')]
    const planned = planFor(TODAY, companies, [], followups, true).items.map((i) => i.entityId)
    // a: 4 days ago, still resting. b: 5 days ago, back. c: never called.
    expect(planned).not.toContain('a')
    expect(planned).toEqual(expect.arrayContaining(['b', 'c']))
  })

  it('brings a customer back on their next follow-up date, even inside the five days', () => {
    const followups = [calledOn('a', '2026-10-05', { next_reminder_date: TODAY })]
    expect(planFor(TODAY, companies, [], followups, true).items.map((i) => i.entityId)).toContain('a')
  })

  it('hands out the highest amount first', () => {
    const sized = [invoice('small', 5_000), invoice('huge', 9_00_000), invoice('mid', 60_000)]
    expect(planFor(TODAY, sized, [], [], true).items.map((i) => i.entityId)).toEqual(['huge', 'mid', 'small'])
  })
})

describe('eight for everyone who has eight customers to ring', () => {
  const companies = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id, n) => ({
    ...invoice(id),
    due_date: `2026-0${(n % 9) + 1}-01`,
    // Half past due, half not due yet.
    ...(n >= 5 ? { status: 'current' as const, due_date: '2026-12-01' } : {}),
  }))
  const overdue = ['p', 'q', 'r', 's'].map((id) => ageing(id))

  it('makes up a short Overdue half from Active Payments, past due or due within two days only', () => {
    // Every overdue customer has a later follow-up date: none of them today.
    const followups = overdue.map((o) => followup('overdue_payment', o.id, { next_reminder_date: '2026-10-20' }))
    const soon = companies.map((c, n) => (n >= 5 && n < 8 ? { ...c, due_date: '2026-10-09', status: 'upcoming' as const } : c))
    const plan = planFor(TODAY, soon, overdue, followups, true)
    // 5 past due + 3 due on 9 Oct (two days away); the two due in December wait.
    expect(plan.items).toHaveLength(8)
    expect(plan.items.every((i) => i.entityType === 'company')).toBe(true)
    expect(plan.items.map((i) => i.entityId)).not.toContain('i')
    expect(plan.items.map((i) => i.entityId)).not.toContain('j')
  })

  it('makes up a short Active half from Overdue Payments', () => {
    const more = ['t', 'u', 'v', 'w', 'x'].map((id) => ageing(id))
    const plan = planFor(TODAY, [companies[0]], [...overdue, ...more], [], true)
    expect(plan.items).toHaveLength(8)
    expect(plan.items.filter((i) => i.entityType === 'overdue_payment')).toHaveLength(7)
  })

  it('still never brings in a customer waiting for a later date', () => {
    const followups = companies.map((c) => followup('company', c.id, { next_reminder_date: '2026-10-20' }))
    const plan = planFor(TODAY, companies, overdue, followups, true)
    expect(plan.items.map((i) => i.entityId).sort()).toEqual(['p', 'q', 'r', 's'])
  })
})

describe('Active Payments: only past due, or due within two days', () => {
  const due = (id: string, date: string) => ({ ...invoice(id), due_date: date, status: 'upcoming' as const })

  it('plans an invoice due in two days, not one due in three', () => {
    const plan = planFor(TODAY, [due('in2', '2026-10-09'), due('in3', '2026-10-10'), invoice('past')], [], [], true)
    expect(plan.items.map((i) => i.entityId).sort()).toEqual(['in2', 'past'])
  })

  it('ignores a date the coordinator set on an invoice not yet due', () => {
    const notDue = due('later', '2026-11-30')
    const followups = [followup('company', 'later', { followup_date: '2026-09-20T10:00:00', created_at: '2026-09-20T10:00:00.000Z', next_reminder_date: TODAY })]
    expect(planFor(TODAY, [notDue], [], followups, true).items).toHaveLength(0)
  })
})

describe('credit/debit notes on money past 120 days', () => {
  const noted = (id: string, b121: number) => ({ ...ageing(id, b121), due_121_plus: b121 })
  const note = (id: string, notes: string, at = '2026-10-06T10:00:00') =>
    followup('overdue_payment', id, { notes, followup_date: at, created_at: `${at}.000Z`, next_reminder_date: '2026-10-30' })

  it('gives a task every day, first and on top of the eight, even with a later follow-up date', () => {
    const overdue = [noted('cn', 50000), ...['p', 'q', 'r', 's', 't'].map((id) => ageing(id))]
    const companies = ['a', 'b', 'c', 'd'].map((id) => invoice(id))
    const followups = [note('cn', 'Material rejected, need to issue C.N')]
    const plan = planFor(TODAY, companies, overdue, followups, true)
    expect(plan.items[0]).toMatchObject({ entityId: 'cn', kind: 'note_pending', special: 'note_pending' })
    // Eight regular tasks besides it.
    expect(plan.items.filter((i) => !i.special)).toHaveLength(8)
    expect(plan.items.filter((i) => i.entityId === 'cn')).toHaveLength(1)
  })

  it('stops once a newer follow-up no longer mentions a note, and ignores money under 121 days', () => {
    const young = { ...ageing('young'), due_121_plus: 0, due_91_120: 80000 }
    const overdue = [noted('cn', 50000), young]
    const followups = [
      note('cn', 'Debit note received from customer'),
      note('cn', 'Customer will pay on Friday', '2026-10-06T15:00:00'),
      note('young', 'need CN'),
    ]
    const plan = planFor(TODAY, [], overdue, followups, true)
    expect(plan.items.some((i) => i.kind === 'note_pending')).toBe(false)
  })
})
