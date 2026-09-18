import { beforeEach, describe, expect, it } from 'vitest'

import type { Followup } from '@/lib/types'
import {
  makePlan,
  openAccountKeys,
  pickPlanTasks,
  planProgressLine,
  resolvePlan,
  unfinishedItems,
  PLAN_SIZE,
} from './daily-plan'
import { ensurePlan, getPlan, resetPlansForTests, skipPlanItem } from './plan-store'
import { TASK_PRIORITY, type AssistantTask, type AssistantTaskKind } from './types'

function task(
  id: string,
  kind: AssistantTaskKind,
  entity?: { type?: 'company' | 'overdue_payment'; id: string; name?: string }
): AssistantTask {
  return {
    id,
    kind,
    priority: TASK_PRIORITY[kind],
    message: `${kind} on ${entity?.name ?? entity?.id ?? 'nobody'}`,
    entityType: entity ? entity.type ?? 'company' : undefined,
    entityId: entity?.id,
    entityName: entity?.name,
    amount: null,
    actions: [{ intent: 'open', label: 'Open record', tone: 'primary' }],
  }
}

function followup(entityId: string, date: string, coordinatorId = 'coord-1'): Followup {
  return {
    id: `fu-${entityId}-${date}`,
    entity_type: 'company',
    entity_id: entityId,
    coordinator_id: coordinatorId,
    followup_date: `${date}T10:00:00`,
    mode: 'call',
    notes: null,
    customer_response: null,
    committed_date: null,
    committed_amount: null,
    status: 'pending',
    proof_attachment_url: null,
    next_reminder_date: null,
    created_at: `${date}T10:00:00`,
    edited_at: null,
  }
}

describe('only work that can be measured gets planned', () => {
  /*
   * The completion rule reads an account's state. A nudge with no account to
   * point at can only be judged by whether it is still in today's list, and
   * that reading is exactly what once ticked a day's work off by itself. So
   * such a nudge never becomes a plan item in the first place — the hole is
   * closed by construction rather than by a comment asking nobody to widen it.
   */
  it('refuses a task with no account attached', () => {
    const picked = pickPlanTasks([
      task('recap-1', 'stale_contact'),
      task('stale-1', 'stale_contact', { id: 'c1' }),
    ])
    expect(picked.map((t) => t.id)).toEqual(['stale-1'])
  })

  it('so a plan can never contain an item that completes itself', () => {
    const plan = makePlan('coord-1', '2026-09-06', [
      task('recap-1', 'stale_contact'),
      task('broken-1', 'commitment_broken', { id: 'c1' }),
    ])
    expect(plan.items.every((item) => item.entityId)).toBe(true)
  })

  it('and an entity-less item that somehow exists stays open rather than ticking itself', () => {
    const plan = {
      userId: 'coord-1',
      date: '2026-09-06',
      items: [{ taskId: 'ghost-1', kind: 'stale_contact' as const, message: 'no account' }],
      skipped: [],
      createdAt: '2026-09-06T08:00:00.000Z',
    }
    // Its nudge is nowhere in the live list, which used to be enough.
    const resolved = resolvePlan(plan, [], [], 'coord-1', new Set(), new Set())
    expect(resolved.items[0].status).toBe('open')
    expect(resolved.done).toBe(0)
  })
})

describe('pickPlanTasks', () => {
  it('takes the highest-value work, up to the plan size', () => {
    const tasks = [
      task('stale-1', 'stale_contact', { id: 'c1' }),
      task('broken-1', 'commitment_broken', { id: 'c2' }),
      task('due-1', 'commitment_due_today', { id: 'c3' }),
      task('untouched-1', 'overdue_untouched', { id: 'c4' }),
      task('reminder-1', 'reminder_due', { id: 'c5' }),
      task('soon-1', 'payment_due_soon', { id: 'c6' }),
    ]
    const picked = pickPlanTasks(tasks).map((t) => t.id)
    expect(picked).toHaveLength(PLAN_SIZE)
    expect(picked).toEqual(['due-1', 'broken-1', 'reminder-1', 'untouched-1'])
  })

  it('never spends two slots on the same customer', () => {
    const tasks = [
      task('broken-1', 'commitment_broken', { id: 'c1' }),
      task('reminder-1', 'reminder_due', { id: 'c1' }),
      task('stale-1', 'stale_contact', { id: 'c2' }),
    ]
    expect(pickPlanTasks(tasks).map((t) => t.id)).toEqual(['broken-1', 'stale-1'])
  })

  it('keeps some variety, then fills the rest in priority order', () => {
    const tasks = [
      task('stale-1', 'stale_contact', { id: 'c1' }),
      task('stale-2', 'stale_contact', { id: 'c2' }),
      task('stale-3', 'stale_contact', { id: 'c3' }),
      task('stale-4', 'stale_contact', { id: 'c4' }),
      task('soon-1', 'payment_due_soon', { id: 'c5' }),
    ]
    const picked = pickPlanTasks(tasks).map((t) => t.id)
    // The due-soon account outranks stale ones; two stale accounts follow, and
    // a third fills the last slot because there was still room.
    expect(picked).toEqual(['soon-1', 'stale-1', 'stale-2', 'stale-3'])
  })

  it('leaves the morning recap out: it is news, not work', () => {
    const tasks = [task('recap', 'yesterday_recap'), task('stale-1', 'stale_contact', { id: 'c1' })]
    expect(pickPlanTasks(tasks).map((t) => t.id)).toEqual(['stale-1'])
  })

  it('puts accounts carried over from yesterday first', () => {
    const tasks = [
      task('broken-1', 'commitment_broken', { id: 'c1' }),
      task('stale-9', 'stale_contact', { id: 'c9' }),
    ]
    expect(pickPlanTasks(tasks, ['company:c9']).map((t) => t.id)).toEqual(['stale-9', 'broken-1'])
  })
})

describe('makePlan', () => {
  it("puts yesterday's unfinished work at the top of today", () => {
    const yesterday = makePlan('coord-1', '2026-09-05', [task('stale-9', 'stale_contact', { id: 'c9' })])
    const left = unfinishedItems(resolvePlan(yesterday, [], [], 'coord-1', new Set(['company:c9'])))

    const today = makePlan(
      'coord-1',
      '2026-09-06',
      [task('broken-1', 'commitment_broken', { id: 'c1' })],
      left
    )
    expect(today.items.map((i) => i.taskId)).toEqual(['stale-9', 'broken-1'])
    expect(today.items[0].carriedFrom).toBe('2026-09-05')
    expect(today.skipped).toEqual([])
  })

  it('carries the work even when its nudge has stopped firing', () => {
    /*
     * The failure this replaces. "Due today" stops being due today at
     * midnight, so an item whose nudge is gone this morning used to vanish
     * from the plan entirely — on the one morning it most needed to be seen.
     * The customer has not been rung either way.
     */
    const yesterday = makePlan('coord-1', '2026-09-05', [task('due-9', 'reminder_due', { id: 'c9' })])
    const left = unfinishedItems(resolvePlan(yesterday, [], [], 'coord-1', new Set(['company:c9'])))

    const today = makePlan('coord-1', '2026-09-06', [], left)
    expect(today.items.map((i) => i.taskId)).toEqual(['due-9'])
  })

  it('does not plan the same account twice when it also raises a nudge today', () => {
    const carried = [{ taskId: 'stale-9', kind: 'stale_contact' as const, message: 'x', entityType: 'company' as const, entityId: 'c9', carriedFrom: '2026-09-05' }]
    const today = makePlan('coord-1', '2026-09-06', [task('reminder-9', 'reminder_due', { id: 'c9' })], carried)
    expect(today.items.map((i) => i.entityId)).toEqual(['c9'])
  })

  it('keeps the plan short even when the backlog is long', () => {
    // A list nobody starts is the failure this module exists to avoid.
    const carried = Array.from({ length: 9 }, (_, i) => ({
      taskId: `old-${i}`,
      kind: 'stale_contact' as const,
      message: 'x',
      entityType: 'company' as const,
      entityId: `c${i}`,
      carriedFrom: '2026-09-01',
    }))
    const today = makePlan('coord-1', '2026-09-06', [task('new-1', 'commitment_broken', { id: 'z1' })], carried)
    expect(today.items).toHaveLength(PLAN_SIZE)
    expect(today.items.every((i) => i.carriedFrom === '2026-09-01')).toBe(true)
  })
})

describe('which accounts are still open', () => {
  it('counts what is still owed and still chased', () => {
    const open = openAccountKeys(
      [
        { id: 'c1', status: 'overdue', total_amount: 100 },
        { id: 'c2', status: 'paid', total_amount: 0 },
        { id: 'c3', status: 'overdue', total_amount: 100, no_followup_at: '2026-09-01T00:00:00Z' },
      ],
      [
        { id: 'o1', status: 'critical', balance_due: 100 },
        { id: 'o2', status: 'settled', balance_due: 0 },
        { id: 'o3', status: 'bankrupt', balance_due: 100 },
      ]
    )
    expect([...open].sort()).toEqual(['company:c1', 'overdue_payment:o1'])
  })
})

describe('resolvePlan', () => {
  /** Every account in these tests still owes money unless a test says otherwise. */
  const OWED = new Set(['company:c1', 'company:c2', 'company:c3'])

  // Made at eight; the calls that complete it are logged after that. Work is
  // evidence only when it was logged since the plan asked for it.
  const plan = makePlan('coord-1', '2026-09-06', [
    task('broken-1', 'commitment_broken', { id: 'c1', name: 'Balaji' }),
    task('stale-2', 'stale_contact', { id: 'c2', name: 'Gokul' }),
    task('untouched-3', 'overdue_untouched', { id: 'c3', name: 'Meridian' }),
  ], [], '2026-09-06T08:00:00.000Z')

  it('does NOT mark an item done just because its nudge has gone away', () => {
    /*
     * The bug this replaces, and the reason the whole rule changed. A nudge
     * leaves the queue on its own — "due today" stops being due today at
     * midnight — so reading absence as completion made every such item tick
     * itself off at the end of the day, and the plan reported a clean sweep
     * over work nobody had touched.
     */
    const stillOwed = new Set(['company:c1', 'company:c2', 'company:c3'])
    const resolved = resolvePlan(
      plan,
      [task('stale-2', 'stale_contact', { id: 'c2' }), task('untouched-3', 'overdue_untouched', { id: 'c3' })],
      [],
      'coord-1',
      stillOwed
    )
    expect(resolved.items.map((i) => i.status)).toEqual(['open', 'open', 'open'])
    expect(resolved.done).toBe(0)
    expect(resolved.complete).toBe(false)
  })

  /*
   * Reported 2026-09-13: "yesterday no task is logged but today it shows some
   * task is completed which never been filled". A desk had been handed to two
   * other coordinators overnight, and every plan item pointing at one of those
   * accounts marked itself done — because "gone from my accounts" was being
   * read as "dealt with". It is not: somebody else owns it now, and nobody
   * did the work.
   */
  describe('an account handed to another coordinator', () => {
    // Still owed, all three — but c1 and c3 are no longer this person's.
    const owed = new Set(['company:c1', 'company:c2', 'company:c3'])
    const mine = new Set(['company:c2'])

    it('is not done — it is moved', () => {
      const resolved = resolvePlan(plan, [], [], 'coord-1', owed, mine)
      expect(resolved.items.find((i) => i.entityId === 'c1')?.status).toBe('moved')
      expect(resolved.items.find((i) => i.entityId === 'c3')?.status).toBe('moved')
      expect(resolved.items.find((i) => i.entityId === 'c2')?.status).toBe('open')
    })

    it('is never counted as work that was done', () => {
      const resolved = resolvePlan(plan, [], [], 'coord-1', owed, mine)
      expect(resolved.done).toBe(0)
      expect(resolved.moved).toBe(2)
      expect(resolved.open).toBe(1)
      expect(resolved.total).toBe(3)
    })

    it('does not report a clean sweep when a whole desk changes hands', () => {
      // What the leader actually saw: every item ticked, nobody having rung a
      // soul. The plan must say nothing was done, not "3 of 3".
      const resolved = resolvePlan(plan, [], [], 'coord-1', owed, new Set())
      expect(resolved.done).toBe(0)
      expect(resolved.moved).toBe(3)
      expect(planProgressLine(resolved)).toBe('0 of 3 done')
    })

    it('never credits the new owner with the old owner’s day either', () => {
      // The accounts are Disha's now; her plan gets them as fresh work, not as
      // three items already ticked off.
      const resolved = resolvePlan(plan, [], [], 'coord-1', owed, owed)
      expect(resolved.done).toBe(0)
      expect(resolved.items.every((i) => i.status === 'open')).toBe(true)
    })

    it('does not follow the old owner into tomorrow', () => {
      // It is not their work any more; carrying it would put somebody else's
      // customer at the top of their morning.
      const resolved = resolvePlan(plan, [], [], 'coord-1', owed, mine)
      expect(unfinishedItems(resolved).map((i) => i.entityId)).toEqual(['c2'])
    })

    it('still counts as done if they rang them before it moved', () => {
      const resolved = resolvePlan(plan, [], [followup('c1', '2026-09-06')], 'coord-1', owed, mine)
      expect(resolved.items.find((i) => i.entityId === 'c1')?.status).toBe('done')
      expect(resolved.done).toBe(1)
    })

    it('is closed, not done, when the account left the book altogether', () => {
      const resolved = resolvePlan(plan, [], [], 'coord-1', new Set(['company:c2']), new Set())
      expect(resolved.items.find((i) => i.entityId === 'c1')?.status).toBe('closed')
      expect(resolved.items.find((i) => i.entityId === 'c3')?.status).toBe('closed')
      expect(resolved.done).toBe(0)
    })

    it('behaves as before when nobody says what is still theirs', () => {
      const resolved = resolvePlan(plan, [], [], 'coord-1', owed)
      expect(resolved.items.map((i) => i.status)).toEqual(['open', 'open', 'open'])
      expect(resolved.moved).toBe(0)
    })
  })

  it('closes an item when the account has left the book — without calling it done', () => {
    /*
     * Paid, settled, set aside, retired by the sync, or re-imported under a new
     * id: the account stops being chaseable, so the item ends. But nobody
     * necessarily did anything, and crediting it as done is what put ticks
     * against work that was never filled in.
     */
    const resolved = resolvePlan(plan, [], [], 'coord-1', new Set(['company:c2', 'company:c3']))
    expect(resolved.items.find((i) => i.entityId === 'c1')?.status).toBe('closed')
    expect(resolved.items.find((i) => i.entityId === 'c2')?.status).toBe('open')
    expect(resolved.done).toBe(0)
    expect(resolved.closed).toBe(1)
  })

  it('reports nothing done when a whole day of accounts went quiet on their own', () => {
    // The report: "yesterday no task is logged but today it shows some task is
    // completed which never been filled". Every account gone, not one call.
    const resolved = resolvePlan(plan, [], [], 'coord-1', new Set())
    expect(resolved.done).toBe(0)
    expect(resolved.closed).toBe(3)
    expect(planProgressLine(resolved)).toBe('0 of 3 done')
  })

  it('counts a call logged the next morning against work carried into today', () => {
    const resolved = resolvePlan(
      plan,
      [],
      [followup('c2', '2026-09-07')],
      'coord-1',
      new Set(['company:c1', 'company:c2', 'company:c3'])
    )
    expect(resolved.items.find((i) => i.entityId === 'c2')?.status).toBe('done')
  })

  it('marks an item done when a call was logged on the account today, wherever it was logged', () => {
    const live = plan.items.map((i) => task(i.taskId, i.kind, { id: i.entityId! }))
    const resolved = resolvePlan(plan, live, [followup('c2', '2026-09-06')], 'coord-1', OWED)
    expect(resolved.items.find((i) => i.taskId === 'stale-2')?.status).toBe('done')
    expect(resolved.done).toBe(1)
  })

  it('ignores calls from another day or another person', () => {
    const live = plan.items.map((i) => task(i.taskId, i.kind, { id: i.entityId! }))
    const resolved = resolvePlan(
      plan,
      live,
      [followup('c2', '2026-09-05'), followup('c3', '2026-09-06', 'coord-2')],
      'coord-1',
      OWED
    )
    expect(resolved.items.map((i) => i.status)).toEqual(['open', 'open', 'open'])
  })

  it('treats a snoozed nudge as still open, and a skipped one as set aside', () => {
    const live = plan.items.map((i) => task(i.taskId, i.kind, { id: i.entityId! }))
    const resolved = resolvePlan({ ...plan, skipped: ['stale-2'] }, live, [], 'coord-1', OWED)
    expect(resolved.items.find((i) => i.taskId === 'stale-2')?.status).toBe('skipped')
    expect(resolved.open).toBe(2)
    expect(resolved.complete).toBe(false)
  })

  it('is complete once nothing is left open', () => {
    const resolved = resolvePlan(
      { ...plan, skipped: ['untouched-3'] },
      [],
      [followup('c1', '2026-09-06'), followup('c2', '2026-09-06')],
      'coord-1',
      OWED
    )
    expect(resolved.complete).toBe(true)
    expect(planProgressLine(resolved)).toBe('2 of 3 done')
  })
})

describe('plan store', () => {
  beforeEach(() => resetPlansForTests())

  it('makes one plan per day and hands the same one back all day', () => {
    const first = ensurePlan('coord-1', '2026-09-06', [task('broken-1', 'commitment_broken', { id: 'c1' })])
    const again = ensurePlan('coord-1', '2026-09-06', [task('stale-5', 'stale_contact', { id: 'c5' })])
    expect(again).toEqual(first)
    expect(again.items.map((i) => i.taskId)).toEqual(['broken-1'])
  })

  it('turns the page the next day, carrying unfinished work forward', () => {
    ensurePlan('coord-1', '2026-09-06', [task('stale-9', 'stale_contact', { id: 'c9' })])
    const tomorrow = ensurePlan(
      'coord-1',
      '2026-09-07',
      [task('broken-1', 'commitment_broken', { id: 'c1' })],
      { followups: [], open: new Set(['company:c9', 'company:c1']) }
    )
    expect(tomorrow.date).toBe('2026-09-07')
    expect(tomorrow.items.map((i) => i.taskId)).toEqual(['stale-9', 'broken-1'])
    expect(tomorrow.items[0].carriedFrom).toBe('2026-09-06')
  })

  it('leaves behind what was actually finished', () => {
    ensurePlan('coord-1', '2026-09-06', [task('stale-9', 'stale_contact', { id: 'c9' })])
    const tomorrow = ensurePlan(
      'coord-1',
      '2026-09-07',
      [task('broken-1', 'commitment_broken', { id: 'c1' })],
      // c9 was rung after the plan asked for it, so it does not come forward.
      // The store stamps its plans with the real clock, so the call has to be
      // logged against that rather than against the plan's calendar date.
      {
        followups: [{ ...followup('c9', '2026-09-06'), created_at: new Date(Date.now() + 1000).toISOString() }],
        open: new Set(['company:c9', 'company:c1']),
      }
    )
    expect(tomorrow.items.map((i) => i.taskId)).toEqual(['broken-1'])
  })

  it('remembers what was set aside', () => {
    ensurePlan('coord-1', '2026-09-06', [task('broken-1', 'commitment_broken', { id: 'c1' })])
    skipPlanItem('coord-1', 'broken-1')
    expect(getPlan('coord-1')?.skipped).toEqual(['broken-1'])
    // Unknown ids are ignored rather than stored.
    skipPlanItem('coord-1', 'nope')
    expect(getPlan('coord-1')?.skipped).toEqual(['broken-1'])
  })
})
