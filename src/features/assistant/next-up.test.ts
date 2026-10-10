import { beforeEach, describe, expect, it } from 'vitest'

import type { Followup, OverduePayment } from '@/lib/types'
import {
  balanceLookup,
  bigEnoughToPlan,
  customerLookup,
  makePlan,
  PLAN_MIN_AMOUNT,
  resolvePlan,
  unfinishedItems,
  type PlanItem,
} from './daily-plan'
import { nextToFollowUp } from './next-up'
import { ensurePlan, extendPlanIfFinished, resetPlansForTests } from './plan-store'
import { planHistory, summariseHistory } from './plan-history'
import { composeNudge } from './proactive'
import { TASK_PRIORITY, type AssistantTask } from './types'

function task(id: string, account: string, amount: number | null): AssistantTask {
  return {
    id,
    kind: 'overdue_untouched',
    priority: TASK_PRIORITY.overdue_untouched,
    message: `Ring ${account}`,
    entityType: 'company',
    entityId: account,
    entityName: account,
    amount,
    actions: [],
  }
}

function ageing(id: string, name: string, balance: number, extra: Partial<OverduePayment> = {}): OverduePayment {
  return {
    id,
    bp_code: `BP-${id}`,
    customer_name: name,
    balance_due: balance,
    due_0_30: balance,
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
    imported_at: '',
    created_at: '',
    updated_at: '',
    ...extra,
  }
}

function call(entityId: string, at: string): Followup {
  return {
    id: `fu-${entityId}-${at}`,
    entity_type: 'overdue_payment',
    entity_id: entityId,
    coordinator_id: 'coord-1',
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
  }
}

describe('only work of ₹1,000 or more goes on the plan', () => {
  it('leaves small amounts out and fills the plan with bigger ones', () => {
    const made = makePlan('coord-1', '2026-09-30', [
      task('tiny', 'c1', 20),
      task('edge', 'c2', PLAN_MIN_AMOUNT),
      task('big', 'c3', 1_44_967),
      task('under', 'c4', 999),
    ])
    expect(made.items.map((i) => i.taskId).sort()).toEqual(['big', 'edge'])
  })

  it('reads the account balance when a task names no amount', () => {
    const balanceOf = balanceLookup(
      [
        { id: 'rich', total_amount: 50_000 },
        { id: 'poor', total_amount: 300 },
      ],
      []
    )
    expect(bigEnoughToPlan(task('a', 'rich', null), balanceOf)).toBe(true)
    expect(bigEnoughToPlan(task('b', 'poor', null), balanceOf)).toBe(false)
    // An account that no longer exists is not planned.
    expect(bigEnoughToPlan(task('c', 'gone', null), balanceOf)).toBe(false)
  })

  it('does not carry small change forward from yesterday either', () => {
    const carried: PlanItem[] = [
      { taskId: 'old-small', kind: 'overdue_ageing', message: '₹463 past 90 days', entityType: 'company', entityId: 'c1', amount: 463, carriedFrom: '2026-09-29' },
      { taskId: 'old-big', kind: 'overdue_ageing', message: '₹30,903 past 90 days', entityType: 'company', entityId: 'c2', amount: 30_903, carriedFrom: '2026-09-29' },
    ]
    const made = makePlan('coord-1', '2026-09-30', [], carried)
    expect(made.items.map((i) => i.taskId)).toEqual(['old-big'])
  })
})

describe('once the plan is done, Robi hands over the overdue list', () => {
  const START = '2026-09-30T00:00:00.000Z'
  const book = [
    ageing('a', 'Aged Co', 20_000, { due_121_plus: 15_000, status: 'critical' }),
    ageing('b', 'Big Co', 90_000),
    ageing('c', 'Called Today', 50_000),
    ageing('d', 'Small Co', 500),
    ageing('e', 'Planned Co', 70_000),
    ageing('f', 'Set Aside', 80_000, { no_followup_at: '2026-09-01' }),
    ageing('g', 'Someone Else', 60_000, { assigned_coordinator_id: 'coord-2' }),
  ]

  it('lists overdue companies of ₹1,000+, the biggest balance first, skipping what is done or not theirs', () => {
    const next = nextToFollowUp({
      userId: 'coord-1',
      overduePayments: book,
      followups: [call('c', '2026-09-30T05:00:00.000Z'), call('b', '2026-09-20T05:00:00.000Z')],
      planItems: [{ taskId: 't', kind: 'overdue_untouched', message: '', entityType: 'overdue_payment', entityId: 'e' }],
      startOfToday: START,
      customerOf: customerLookup([], book),
    })
    expect(next.map((n) => n.name)).toEqual(['Big Co', 'Aged Co'])
    expect(next[1]).toMatchObject({ critical: 15_000, lastContact: null })
    expect(next[0].lastContact).toBe('2026-09-20T05:00:00.000Z')
  })

  it('hands out the biggest balance first, then the oldest money (since 10 Oct 2026)', () => {
    const rows = [
      ageing('young-big', 'Young Big', 9_00_000), // all in 0-30 days
      ageing('old-small', 'Old Small', 5_000, { due_0_30: 0, due_121_plus: 5_000 }),
      ageing('old-big', 'Old Big', 2_00_000, { due_0_30: 0, due_121_plus: 2_00_000 }),
      ageing('mid', 'Mid', 50_000, { due_0_30: 0, due_61_90: 50_000 }),
    ]
    const next = nextToFollowUp({
      userId: 'coord-1',
      overduePayments: rows,
      followups: [],
      planItems: [],
      startOfToday: START,
      customerOf: customerLookup([], rows),
    })
    expect(next.map((n) => n.name)).toEqual(['Young Big', 'Old Big', 'Mid', 'Old Small'])
  })

})

describe('Active Payments first, then rounds of overdue accounts', () => {
  const DAY = '2026-09-30'
  const NOON = new Date('2026-09-30T06:30:00.000Z')
  const book = Array.from({ length: 10 }, (_, i) => ageing(`o${i}`, `Overdue ${i}`, 10_000 * (i + 1)))
  const customerOf = customerLookup([], book)

  beforeEach(() => resetPlansForTests())

  it('plans the morning from Active Payments only', () => {
    const made = makePlan('coord-1', DAY, [
      task('inv', 'c1', 50_000),
      { ...task('ageing', 'o1', 90_000), entityType: 'overdue_payment' },
    ])
    expect(made.items.map((i) => i.taskId)).toEqual(['inv'])
  })

  it('adds four random overdue accounts once the morning is done, then four more after those', () => {
    const morning = ensurePlan('coord-1', DAY, [task('inv', 'c1', 50_000)])
    const done = [{ ...call('c1', '2026-09-30T06:00:00.000Z'), entity_type: 'company' as const, created_at: new Date(Date.parse(morning.createdAt) + 1000).toISOString() }]

    // Morning still open: nothing added.
    const open = resolvePlan(morning, [], [], 'coord-1')
    expect(extendPlanIfFinished(morning, open, { overduePayments: book, followups: [], customerOf }, NOON)).toBe(morning)

    // Morning done: round 1, four overdue accounts.
    const first = extendPlanIfFinished(morning, resolvePlan(morning, [], done, 'coord-1'), { overduePayments: book, followups: done, customerOf }, NOON)
    const round1 = first.items.filter((i) => i.round === 1)
    expect(round1).toHaveLength(4)
    expect(round1.every((i) => i.entityType === 'overdue_payment' && i.kind === 'overdue_followup')).toBe(true)

    // Asking again before anything moves adds nothing: the round is already there.
    expect(extendPlanIfFinished(first, resolvePlan(first, [], done, 'coord-1'), { overduePayments: book, followups: done, customerOf }, NOON).items).toHaveLength(5)

    // Ring all four: round 2 comes, with none of round 1's customers in it.
    const later = new Date(Date.parse(round1[0].plannedAt!) + 1000).toISOString()
    const rung = [...done, ...round1.map((i) => call(i.entityId!, later))]
    const second = extendPlanIfFinished(first, resolvePlan(first, [], rung, 'coord-1', undefined, undefined, undefined, customerOf), { overduePayments: book, followups: rung, customerOf }, NOON)
    const round2 = second.items.filter((i) => i.round === 2)
    expect(round2).toHaveLength(4)
    expect(round2.some((i) => round1.some((j) => j.entityId === i.entityId))).toBe(false)
  })

  it('announces a new round, and never carries one to tomorrow or counts it as a miss', () => {
    const plan = {
      userId: 'coord-1', date: DAY, createdAt: '2026-09-30T03:30:00.000Z', skipped: [],
      items: [
        { taskId: 'inv', kind: 'overdue_untouched' as const, message: '', entityType: 'company' as const, entityId: 'c1' },
        { taskId: 'r1', kind: 'overdue_followup' as const, message: '', entityType: 'overdue_payment' as const, entityId: 'o1', entityName: 'Overdue 1', round: 1, plannedAt: '2026-09-30T07:00:00.000Z' },
      ],
    }
    const resolved = resolvePlan(plan, [], [{ ...call('c1', '2026-09-30T04:00:00.000Z'), entity_type: 'company' }], 'coord-1')
    expect(resolved.round).toBe(1)

    const nudge = composeNudge({
      role: 'coordinator', userId: 'coord-1', firstName: 'Pragati', today: DAY, minutesNow: 13 * 60,
      screen: 'dashboard', focused: null, tasks: [], plan: resolved,
      followups: [], companies: [], overduePayments: [], dailyEntryLogged: null,
    })
    expect(nudge?.text).toBe('Active Payments tasks done — here are 1 overdue accounts to follow up next.')
    expect(nudge?.key).toBe(`plan-round:${DAY}:1`)

    expect(unfinishedItems(resolved).map((i) => i.taskId)).toEqual([])

    const rows = planHistory([plan], [], '2026-10-01')
    expect(rows.find((r) => r.item.taskId === 'r1')?.result).toBe('not_reached')
    expect(summariseHistory(rows)[0]).toMatchObject({ tasks: 1, notDone: 1, extraGiven: 1, extraDone: 0 })
  })
})
