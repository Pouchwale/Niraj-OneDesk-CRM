/**
 * The three ways Robi's record of the day was wrong on the live data
 * (29 Sep - 1 Oct 2026), each pinned down.
 */
import { describe, expect, it } from 'vitest'

import type { Company, Followup, OverduePayment } from '@/lib/types'
import { balanceLookup, customerLookup, dueDateLookup, makePlan, resolvePlan, type DailyPlan, type PlanItem } from './daily-plan'
import { TASK_PRIORITY, type AssistantTask } from './types'
import { planHistory } from './plan-history'
import { buildAssistantTasks } from './rules'

const invoice = (id: string, name: string, bp: string, extra: Partial<Company> = {}): Company => ({
  id,
  sap_bp_code: bp,
  name,
  contact_person: null,
  contact_number: '',
  email: null,
  payment_terms: '30 days',
  total_amount: 151_124,
  invoice_date: '2026-06-01',
  due_date: '2026-07-01',
  status: 'critical',
  assigned_coordinator_id: 'coord-7',
  module: null,
  remarks: null,
  extra_fields: {},
  created_at: '2026-06-01',
  updated_at: '2026-06-01',
  ...extra,
})

const ageingRow = (id: string, name: string, bp: string): OverduePayment => ({
  id,
  bp_code: bp,
  customer_name: name,
  balance_due: 151_124,
  due_0_30: 0,
  due_31_60: 0,
  due_61_90: 0,
  due_91_120: 0,
  due_121_plus: 151_124,
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
  assigned_coordinator_id: 'coord-7',
  status: 'critical',
  extra_fields: {},
  imported_at: '',
  created_at: '',
  updated_at: '',
})

const call = (id: string, entityType: 'company' | 'overdue_payment', entityId: string, at: string, extra: Partial<Followup> = {}): Followup => ({
  id,
  entity_type: entityType,
  entity_id: entityId,
  coordinator_id: 'coord-7',
  followup_date: at,
  mode: 'call',
  notes: null,
  customer_response: null,
  committed_date: null,
  committed_amount: null,
  status: 'pending',
  proof_attachment_url: null,
  next_reminder_date: null,
  created_at: at,
  edited_at: null,
  ...extra,
})

describe('Robi reads a customer, not one of their records', () => {
  // SWANI SPICE MILLS: an invoice in Active Payments and a row in the ageing
  // report. Krina rang them on 30 Sep and logged it on the ageing row.
  const swaniInvoice = invoice('inv-5028', 'SWANI SPICE MILLS PVT LTD', 'C0901')
  const swaniAgeing = ageingRow('ovd-swani', 'SWANI SPICE MILLS PVT LTD', 'C0901')
  const rang = call('fu-swani', 'overdue_payment', 'ovd-swani', '2026-09-30T10:24:55.000Z')

  it('does not call a customer "never followed up" the day after they were rung', () => {
    const tasks = buildAssistantTasks({
      companies: [swaniInvoice],
      overduePayments: [swaniAgeing],
      followups: [rang],
      today: '2026-10-01',
    })
    expect(tasks.filter((t) => t.kind === 'overdue_untouched')).toEqual([])
  })

  it('still flags a customer nobody has rung, once per record as before', () => {
    const tasks = buildAssistantTasks({
      companies: [swaniInvoice],
      overduePayments: [swaniAgeing],
      followups: [],
      today: '2026-10-01',
    })
    expect(tasks.filter((t) => t.kind === 'overdue_untouched').map((t) => t.entityId).sort()).toEqual(['inv-5028', 'ovd-swani'])
  })

  it('raises one "gone quiet" card per customer, not one per record', () => {
    const old = '2026-09-01T10:00:00.000Z'
    const tasks = buildAssistantTasks({
      companies: [{ ...swaniInvoice, status: 'overdue' }],
      overduePayments: [],
      followups: [call('a', 'company', 'inv-5028', old), call('b', 'company', 'inv-5028', '2026-09-02T10:00:00.000Z')],
      today: '2026-10-01',
    })
    expect(tasks.filter((t) => t.kind === 'stale_contact')).toHaveLength(1)
  })
})

describe('a call any time that day completes the task', () => {
  const plan: DailyPlan = {
    userId: 'coord-7',
    date: '2026-10-01',
    // Made when the first screen of the day opened it, late in the morning.
    createdAt: '2026-10-01T05:45:00.000Z',
    skipped: [],
    items: [
      { taskId: 'untouched:company:inv-5028', kind: 'overdue_untouched', message: '', entityType: 'company', entityId: 'inv-5028' },
      // Raised by a promise logged this morning.
      { taskId: 'commit-today:fu-promise', kind: 'commitment_due_today', message: '', entityType: 'company', entityId: 'inv-9' },
    ],
  }

  it('counts a call made before the plan existed', () => {
    const early = call('fu-early', 'company', 'inv-5028', '2026-10-01T04:00:00.000Z') // 9:30 IST
    const resolved = resolvePlan(plan, [], [early], 'coord-7')
    expect(resolved.items[0].status).toBe('done')
    expect(planHistory([plan], [early], '2026-10-02')[0]).toMatchObject({ result: 'done' })
  })

  it('never counts the follow-up that raised the task as the work that finished it', () => {
    const promise = call('fu-promise', 'company', 'inv-9', '2026-10-01T04:00:00.000Z', { committed_date: '2026-10-01' })
    expect(resolvePlan(plan, [], [promise], 'coord-7').items[1].status).toBe('open')
    const chased = call('fu-chase', 'company', 'inv-9', '2026-10-01T09:00:00.000Z')
    expect(resolvePlan(plan, [], [promise, chased], 'coord-7').items[1].status).toBe('done')
  })

  it('does not count yesterday\'s call for today', () => {
    const yesterday = call('fu-y', 'company', 'inv-5028', '2026-09-30T12:00:00.000Z')
    expect(resolvePlan(plan, [], [yesterday], 'coord-7').items[0].status).toBe('open')
  })
})

describe('a carried task says what is true today', () => {
  const customerOf = customerLookup(
    [
      { id: 'aussee-1', sap_bp_code: 'C0100', name: 'AUSSEE OATS INDIA LIMITED' },
      { id: 'sweet-1', sap_bp_code: 'C0200', name: 'SWEET KARAM COFFEE' },
    ],
    []
  )
  const carried = (id: string, entityId: string, name: string, message: string, from: string): PlanItem => ({
    taskId: id,
    kind: 'payment_due_soon',
    message,
    entityType: 'company',
    entityId,
    entityName: name,
    amount: 110_177,
    carriedFrom: from,
    plannedAt: `${from}T05:00:00.000Z`,
  })

  it('takes today\'s wording for the same customer, keeping the day it was first given', () => {
    const today = {
      id: 'commit-broken:fu-x',
      kind: 'commitment_broken' as const,
      priority: 2,
      message: 'AUSSEE OATS INDIA LIMITED promised ₹1,10,177 by 30 Sept 2026 — that was 1 day ago and it is still open.',
      entityType: 'company' as const,
      entityId: 'aussee-1',
      entityName: 'AUSSEE OATS INDIA LIMITED',
      amount: 110_177,
      actions: [],
    }
    const made = makePlan('coord-1', '2026-10-01', [today], [
      carried('due-soon:aussee-1', 'aussee-1', 'AUSSEE OATS INDIA LIMITED', 'AUSSEE OATS INDIA LIMITED owes ₹1,10,177 in 3 days.', '2026-09-30'),
    ], undefined, customerOf)
    expect(made.items).toHaveLength(1)
    expect(made.items[0]).toMatchObject({ message: today.message, carriedFrom: '2026-09-30' })
  })

  it('falls back to a plain line with what is owed now when nothing new applies', () => {
    const made = makePlan('coord-1', '2026-10-01', [], [
      carried('due-soon:sweet-1', 'sweet-1', 'SWEET KARAM COFFEE', 'SWEET KARAM COFFEE owes ₹3,71,405 in 3 days.', '2026-09-19'),
    ], undefined, customerOf, (key) => (key === 'company:sweet-1' ? 371_405 : null))
    expect(made.items[0].message).toBe('Carried from 19 Sept 2026: follow up SWEET KARAM COFFEE — ₹3,71,405 outstanding.')
    expect(made.items[0].message).not.toMatch(/in 3 days/)
  })
})

describe('the oldest and biggest money is given first', () => {
  const rank = (companies: Company[]) => ({
    customerOf: customerLookup(companies, []),
    balanceOf: balanceLookup(companies, []),
    dueDateOf: dueDateLookup(companies),
  })
  const task = (kind: AssistantTask['kind'], c: Company): AssistantTask => ({
    id: `${kind}:${c.id}`,
    kind,
    priority: TASK_PRIORITY[kind],
    message: `${c.name}`,
    entityType: 'company',
    entityId: c.id,
    entityName: c.name,
    amount: c.total_amount,
    actions: [],
  })

  it('puts the earliest due date first and, for the same date, the bigger amount', () => {
    const books = [
      invoice('recent-promise', 'Recent Promise', 'C1', { due_date: '2026-09-20', total_amount: 1_298 }),
      invoice('june-small', 'June Small', 'C2', { due_date: '2026-06-10', total_amount: 25_000 }),
      invoice('june-big', 'June Big', 'C3', { due_date: '2026-06-10', total_amount: 3_00_000 }),
      invoice('march', 'March', 'C4', { due_date: '2026-03-01', total_amount: 40_000 }),
      invoice('april', 'April', 'C5', { due_date: '2026-04-15', total_amount: 90_000 }),
    ]
    const tasks = [
      // A promise used to jump the queue, whatever its age or size.
      task('commitment_broken', books[0]),
      ...books.slice(1).map((c) => task('overdue_untouched', c)),
    ]
    const { customerOf, balanceOf, dueDateOf } = rank(books)
    const made = makePlan('coord-1', '2026-10-02', tasks, [], undefined, customerOf, balanceOf, dueDateOf)
    // Four of one kind is fine now: there is no longer a limit of two per kind.
    expect(made.items.map((i) => i.entityName)).toEqual(['March', 'April', 'June Big', 'June Small'])
  })

  it('puts carried work first, then the fresh work oldest and biggest first', () => {
    const books = [
      invoice('carried', 'Carried', 'C1', { due_date: '2026-05-01', total_amount: 60_000 }),
      invoice('older', 'Older New', 'C2', { due_date: '2026-02-01', total_amount: 10_000 }),
      invoice('newer', 'Newer New', 'C3', { due_date: '2026-08-01', total_amount: 9_00_000 }),
    ]
    const { customerOf, balanceOf, dueDateOf } = rank(books)
    const carried: PlanItem = {
      taskId: 'untouched:company:carried', kind: 'overdue_untouched', message: '', entityType: 'company',
      entityId: 'carried', entityName: 'Carried', amount: 60_000, carriedFrom: '2026-10-01',
    }
    const made = makePlan(
      'coord-1', '2026-10-02',
      [task('overdue_untouched', books[1]), task('overdue_untouched', books[2])],
      [carried], undefined, customerOf, balanceOf, dueDateOf
    )
    expect(made.items.map((i) => i.entityName)).toEqual(['Carried', 'Older New', 'Newer New'])
    expect(made.items[0].carriedFrom).toBe('2026-10-01')
  })
})
