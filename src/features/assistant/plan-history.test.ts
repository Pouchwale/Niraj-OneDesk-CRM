import { beforeEach, describe, expect, it } from 'vitest'

import type { Followup } from '@/lib/types'
import { demoCompanyStore } from '@/lib/demo-companies'
import { customerLookup, makePlan, resolvePlan, type DailyPlan, type PlanItem } from './daily-plan'
import { planHistory, summariseHistory } from './plan-history'
import { ensurePlan, resetPlansForTests } from './plan-store'
import { TASK_PRIORITY, type AssistantTask } from './types'
import { planRefusal } from '../../../server/modules/data/operations'

const TODAY = '2026-09-10'

function item(id: string, account: string, extra: Partial<PlanItem> = {}): PlanItem {
  return {
    taskId: id,
    kind: 'stale_contact',
    message: `Ring ${account}`,
    entityType: 'company',
    entityId: account,
    entityName: account,
    ...extra,
  }
}

function plan(userId: string, date: string, items: PlanItem[], extra: Partial<DailyPlan> = {}): DailyPlan {
  return { userId, date, items, skipped: [], createdAt: `${date}T03:30:00.000Z`, ...extra }
}

function call(account: string, at: string, coordinatorId = 'coord-1'): Followup {
  return {
    id: `fu-${account}-${at}`,
    entity_type: 'company',
    entity_id: account,
    coordinator_id: coordinatorId,
    followup_date: at,
    mode: 'call',
    notes: 'Spoke to accounts',
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

function task(id: string, account: string): AssistantTask {
  return {
    id,
    kind: 'stale_contact',
    priority: TASK_PRIORITY.stale_contact,
    message: `Ring ${account}`,
    entityType: 'company',
    entityId: account,
    entityName: account,
    amount: null,
    actions: [],
  }
}

describe('Robi task history', () => {
  it('says which tasks were done, by whom and with what, and which were not', () => {
    const plans = [plan('coord-1', '2026-09-08', [item('t1', 'c1'), item('t2', 'c2'), item('t3', 'c3')], { skipped: ['t3'] })]
    const rows = planHistory(plans, [call('c1', '2026-09-08T06:00:00.000Z')], TODAY)

    const byTask = Object.fromEntries(rows.map((r) => [r.item.taskId, r]))
    expect(byTask.t1.result).toBe('done')
    expect(byTask.t1.followup?.notes).toBe('Spoke to accounts')
    expect(byTask.t2.result).toBe('not_done')
    expect(byTask.t3.result).toBe('later')
  })

  it('does not credit a day with a call made after it ended, but shows it was done late', () => {
    const plans = [
      plan('coord-1', '2026-09-08', [item('t1', 'c1')]),
      plan('coord-1', '2026-09-09', [item('t1', 'c1', { carriedFrom: '2026-09-08', plannedAt: '2026-09-08T03:30:00.000Z' })]),
    ]
    const late = call('c1', '2026-09-09T05:00:00.000Z')
    const rows = planHistory(plans, [late], TODAY)

    const first = rows.find((r) => r.date === '2026-09-08')!
    expect(first.result).toBe('not_done')
    expect(first.carriedTo).toBe('2026-09-09')
    expect(first.doneLater?.id).toBe(late.id)
    expect(rows.find((r) => r.date === '2026-09-09')!.result).toBe('done')
  })

  it('keeps work still open today apart from the misses, but counts it in the completion rate', () => {
    const plans = [
      plan('coord-1', '2026-09-09', [item('t1', 'c1'), item('t2', 'c2')]),
      plan('coord-1', TODAY, [item('t3', 'c3')]),
    ]
    const rows = planHistory(plans, [call('c1', '2026-09-09T06:00:00.000Z')], TODAY)
    expect(rows.find((r) => r.date === TODAY)!.result).toBe('open')

    const [summary] = summariseHistory(rows)
    // 1 done of the 3 given: 33%, not the 50% it read while today's open task was left out.
    expect(summary).toMatchObject({ days: 2, tasks: 3, done: 1, notDone: 1, open: 1, completion: 33 })
  })

  it('reads 1 done of 4 given today as 25%, never 100%', () => {
    const plans = [plan('coord-3', TODAY, [item('t1', 'c1'), item('t2', 'c2'), item('t3', 'c3'), item('t4', 'c4')])]
    const rows = planHistory(plans, [call('c1', '2026-09-10T06:00:00.000Z', 'coord-3')], TODAY)
    expect(summariseHistory(rows)[0]).toMatchObject({ tasks: 4, done: 1, open: 3, completion: 25 })
  })

  it('reads a finished day as it was judged that evening, not as the book stands now', () => {
    const plans = [plan('coord-1', '2026-09-08', [item('t1', 'c1')], { outcome: { t1: 'closed' } })]
    // c1 is owed again today; that day it had been paid.
    const rows = planHistory(plans, [], TODAY, new Set(['company:c1']), new Map([['coord-1', new Set(['company:c1'])]]))
    expect(rows[0].result).toBe('closed')
    expect(summariseHistory(rows)[0]).toMatchObject({ noLongerNeeded: 1, completion: null })
  })

  it('never counts a paid or handed-over account against anybody', () => {
    const plans = [plan('coord-1', TODAY, [item('t1', 'c1'), item('t2', 'c2')])]
    const owed = new Set(['company:c2'])
    const mine = new Map([['coord-1', new Set<string>()]])
    const rows = planHistory(plans, [], TODAY, owed, mine)
    expect(rows.map((r) => r.result).sort()).toEqual(['closed', 'moved'])
  })
})

describe('a call on any of the customer\'s records completes the task', () => {
  // Willowood: two invoices in Active Payments and a row in the ageing report.
  const customerOf = customerLookup(
    [
      { id: 'inv-1', sap_bp_code: 'C1124', name: 'Willowood Chemicals Ltd' },
      { id: 'inv-2', sap_bp_code: 'C1124', name: 'Willowood Chemicals Ltd' },
      { id: 'other', sap_bp_code: 'C9999', name: 'Someone Else' },
    ],
    [{ id: 'ovd-1', bp_code: 'C1124', customer_name: 'Willowood Chemicals Ltd' }]
  )
  const onAgeingRow: Followup = { ...call('x', '2026-09-10T09:15:00.000Z'), entity_type: 'overdue_payment', entity_id: 'ovd-1' }

  it('counts a follow-up logged on the overdue balance against the invoice task', () => {
    const plans = [plan('coord-1', TODAY, [item('t1', 'inv-1'), item('t2', 'other')])]
    const rows = planHistory(plans, [onAgeingRow], TODAY, undefined, undefined, customerOf)
    expect(rows.find((r) => r.item.taskId === 't1')?.result).toBe('done')
    expect(rows.find((r) => r.item.taskId === 't1')?.followup?.entity_id).toBe('ovd-1')
    // A different customer is not touched by it.
    expect(rows.find((r) => r.item.taskId === 't2')?.result).toBe('open')
  })

  it('reads the same in the live plan as in the history', () => {
    const resolved = resolvePlan(plan('coord-1', TODAY, [item('t1', 'inv-2')]), [], [onAgeingRow], 'coord-1', undefined, undefined, undefined, customerOf)
    expect(resolved.done).toBe(1)
  })

  it('gives a customer one slot in the plan, however many invoices they have', () => {
    const made = makePlan('coord-1', TODAY, [task('a', 'inv-1'), task('b', 'inv-2'), task('c', 'other')], [], undefined, customerOf)
    expect(made.items.map((i) => i.entityId)).toEqual(['inv-1', 'other'])
  })
})

describe('plans are kept, day after day', () => {
  beforeEach(() => resetPlansForTests())

  it('keeps yesterday\'s plan, writes down how it ended, and brings the rest forward', () => {
    const first = ensurePlan('coord-1', '2026-09-08', [task('t1', 'c1'), task('t2', 'c2')])
    const madeAt = first.createdAt
    const done = call('c1', new Date(Date.parse(madeAt) + 1000).toISOString())

    // Judged against the day as it stood: the call counts only inside that day.
    ensurePlan('coord-1', '2026-09-09', [task('t3', 'c3')], {
      followups: [done],
      open: new Set(['company:c1', 'company:c2', 'company:c3']),
    })

    const kept = demoCompanyStore.getDailyPlans().filter((p) => p.userId === 'coord-1')
    expect(kept.map((p) => p.date).sort()).toEqual(['2026-09-08', '2026-09-09'])
    const yesterday = kept.find((p) => p.date === '2026-09-08')!
    expect(yesterday.outcome).toBeDefined()
    // c2 was not rung, so it leads today's plan, remembering when it was first given.
    const today = kept.find((p) => p.date === '2026-09-09')!
    expect(today.items[0]).toMatchObject({ entityId: 'c2', carriedFrom: '2026-09-08', plannedAt: madeAt })
  })

  it('lets the first plan made for a day stand, whoever makes it', () => {
    const leaderMade = ensurePlan('coord-1', '2026-09-08', [task('t1', 'c1')])
    const again = ensurePlan('coord-1', '2026-09-08', [task('t9', 'c9')])
    expect(again.items.map((i) => i.taskId)).toEqual(leaderMade.items.map((i) => i.taskId))
  })
})

describe('who may change a plan', () => {
  const mine = plan('coord-1', TODAY, [])

  it('lets a coordinator keep their own plan and nobody else\'s', () => {
    expect(planRefusal('coordinator', 'coord-1', 'recordDailyPlan', [mine])).toBeNull()
    expect(planRefusal('coordinator', 'coord-2', 'recordDailyPlan', [mine])).toMatch(/own plan/)
    expect(planRefusal('coordinator', 'coord-2', 'setDailyPlanItemSkipped', ['coord-1', TODAY, 't1', true])).toMatch(/own plan/)
    expect(planRefusal('coordinator', 'coord-2', 'closeDailyPlan', ['coord-1', TODAY, {}, ''])).toMatch(/own plan/)
  })

  it('lets the team leader and the administrator plan for the whole team', () => {
    expect(planRefusal('team_leader', 'admin-1', 'recordDailyPlan', [mine])).toBeNull()
    expect(planRefusal('admin', 'admin-0', 'closeDailyPlan', ['coord-1', TODAY, {}, ''])).toBeNull()
  })
})
