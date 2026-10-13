import { describe, expect, it } from 'vitest'

import type { Company, Followup, OverduePayment } from '@/lib/types'
import { composeNudge, type NudgeInput } from './proactive'
import { makePlan, resolvePlan } from './daily-plan'
import { TASK_PRIORITY, type AssistantTask } from './types'

const TODAY = '2026-09-06'

/**
 * A call logged on an account, which is what "done" is read from.
 *
 * Stamped after the plan was made, because that is the test: work counts when
 * it was logged since the plan asked for it, not merely because a follow-up
 * exists on the account.
 */
function logged(entityId: string, coordinatorId = 'coord-1'): any {
  return {
    // Not the promise that raised the task (fu-<id>): that never counts as the work.
    id: `call-${entityId}`,
    entity_type: 'company',
    entity_id: entityId,
    coordinator_id: coordinatorId,
    followup_date: `${TODAY}T10:00:00`,
    created_at: new Date(Date.now() + 1000).toISOString(),
    mode: 'call',
    status: 'pending',
  }
}

/** Everything these fixtures name, still owed unless a test says otherwise. */
const OWED = new Set(['company:c1', 'company:c2'])

function company(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: null,
    name: 'Balaji Print Pack',
    contact_person: null,
    contact_number: '',
    email: null,
    payment_terms: '30 days',
    total_amount: 550000,
    invoice_date: '2026-06-01',
    due_date: '2026-07-01',
    status: 'critical',
    assigned_coordinator_id: 'coord-1',
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: '2026-06-01',
    updated_at: '2026-06-01',
    ...overrides,
  }
}

function followup(overrides: Partial<Followup> & { id: string }): Followup {
  return {
    entity_type: 'company',
    entity_id: 'c1',
    coordinator_id: 'coord-1',
    followup_date: '2026-08-20T10:00:00',
    mode: 'call',
    notes: 'Left a message.',
    customer_response: null,
    committed_date: null,
    committed_amount: null,
    status: 'no_response',
    proof_attachment_url: null,
    next_reminder_date: null,
    created_at: '2026-08-20T10:00:00',
    edited_at: null,
    ...overrides,
  }
}

function brokenTask(entityId = 'c1', name = 'Balaji Print Pack'): AssistantTask {
  return {
    id: `commit-broken:fu-${entityId}`,
    kind: 'commitment_broken',
    priority: TASK_PRIORITY.commitment_broken,
    message: `${name} promised ₹2,50,000 by 4 Sep — that was 2 days ago and it is still open.`,
    entityType: 'company',
    entityId,
    entityName: name,
    amount: 250000,
    actions: [
      { intent: 'open', label: 'Open record', tone: 'primary' },
      { intent: 'snooze', label: 'Later' },
    ],
  }
}

function input(overrides: Partial<NudgeInput> = {}): NudgeInput {
  return {
    role: 'coordinator',
    userId: 'coord-1',
    firstName: 'Pragati',
    today: TODAY,
    minutesNow: 10 * 60,
    screen: 'dashboard',
    focused: null,
    tasks: [],
    plan: null,
    followups: [],
    companies: [],
    overduePayments: [] as OverduePayment[],
    ...overrides,
  }
}

describe('the robot on a coordinator\'s screen', () => {
  it('never pops up over an open follow-up panel, even with work waiting on it', () => {
    // The person is already working on the account; a bubble over the panel
    // every time one is opened only gets in the way.
    const tasks = [brokenTask()]
    const plan = resolvePlan(makePlan('coord-1', TODAY, tasks), tasks, [])
    const open = { type: 'company' as const, id: 'c1', name: 'Balaji Print Pack' }
    expect(composeNudge(input({ screen: 'companies', focused: open, tasks, plan }))).toBeNull()
    // Nor over a long-silent one.
    expect(
      composeNudge(
        input({ screen: 'companies', focused: open, companies: [company({ id: 'c1' })], followups: [followup({ id: 'f1' })] })
      )
    ).toBeNull()
  })

  it('stays quiet on a record that was contacted recently', () => {
    const nudge = composeNudge(
      input({
        screen: 'companies',
        focused: { type: 'company', id: 'c1', name: 'Balaji Print Pack' },
        companies: [company({ id: 'c1' })],
        followups: [followup({ id: 'f1', followup_date: `${TODAY}T09:00:00` })],
      })
    )
    expect(nudge).toBeNull()
  })

  it('says nothing about a record that is already paid', () => {
    const nudge = composeNudge(
      input({
        screen: 'companies',
        focused: { type: 'company', id: 'c1', name: 'Balaji Print Pack' },
        companies: [company({ id: 'c1', status: 'paid' })],
      })
    )
    expect(nudge).toBeNull()
  })

  it('introduces the plan on the dashboard in the morning', () => {
    const plan = resolvePlan(makePlan('coord-1', TODAY, [brokenTask()]), [brokenTask()], [])
    const nudge = composeNudge(input({ plan }))
    expect(nudge?.text).toContain('Good morning, Pragati')
    expect(nudge?.text).toContain('1 follow-up for you today')
    expect(nudge?.daily).toBe(true)
    expect(nudge?.actions[0].kind).toBe('open_plan')
  })

  it('reports progress once something on the plan is done', () => {
    const tasks = [brokenTask('c1', 'Balaji'), brokenTask('c2', 'Gokul')]
    // Balaji was rung; Gokul was not. Done is what somebody did, not what the
    // nudge queue happens to be holding.
    const plan = resolvePlan(makePlan('coord-1', TODAY, tasks), tasks, [logged('c1')], 'coord-1', OWED)
    const nudge = composeNudge(input({ plan, minutesNow: 15 * 60 }))
    expect(nudge?.text).toBe('1 of 2 on today\'s plan done — 1 to go.')
  })

  it('celebrates a finished plan, once', () => {
    const plan = resolvePlan(
      makePlan('coord-1', TODAY, [brokenTask()]),
      [brokenTask()],
      [logged('c1')],
      'coord-1',
      OWED
    )
    const nudge = composeNudge(input({ plan, screen: 'overdue' }))
    expect(nudge?.tone).toBe('success')
    expect(nudge?.key).toBe(`plan-complete:${TODAY}`)
    expect(nudge?.daily).toBe(true)
  })

  it('points at the next planned item on the screen it belongs to', () => {
    const tasks = [brokenTask('c1', 'Balaji')]
    const plan = resolvePlan(makePlan('coord-1', TODAY, tasks), tasks, [])
    const onCompanies = composeNudge(input({ plan, screen: 'companies' }))
    expect(onCompanies?.text).toContain('Next on today\'s plan: Balaji promised')
    expect(onCompanies?.actions.map((a) => a.kind)).toEqual(['navigate', 'snooze_task'])

    // Nothing planned lives on the overdue screen, so it stays quiet there.
    expect(composeNudge(input({ plan, screen: 'overdue' }))).toBeNull()
  })
})

describe('the robot on a leader\'s screen', () => {
  const team = [
    {
      coordinatorId: 'coord-1',
      name: 'Pragati Patel',
      tasks: [brokenTask()],
      // Pragati has not rung anybody: hers is the plan still to be started.
      plan: resolvePlan(makePlan('coord-1', TODAY, [brokenTask()]), [brokenTask()], [], 'coord-1', OWED),
    },
    {
      coordinatorId: 'coord-2',
      name: 'Diya Prajapati',
      tasks: [],
      plan: resolvePlan(
        makePlan('coord-2', TODAY, [brokenTask('c2', 'Gokul')]),
        [brokenTask('c2', 'Gokul')],
        [logged('c2', 'coord-2')],
        'coord-2',
        OWED
      ),
    },
  ]

  it('does not pop up over an open follow-up panel', () => {
    for (const role of ['team_leader', 'admin'] as const) {
      const nudge = composeNudge(
        input({
          role,
          userId: 'admin-1',
          firstName: 'Niki',
          screen: 'companies',
          focused: { type: 'company', id: 'c1', name: 'Balaji Print Pack' },
          companies: [company({ id: 'c1' })],
          followups: [followup({ id: 'f1' })],
          team,
          coordinatorName: (id) => (id === 'coord-1' ? 'Pragati Patel' : 'Someone'),
        })
      )
      expect(nudge).toBeNull()
    }
  })

  it('sums the team\'s day on the Overview and names who has not started', () => {
    const nudge = composeNudge(
      input({ role: 'team_leader', userId: 'admin-1', firstName: 'Niki', screen: 'overview', team, minutesNow: 14 * 60 })
    )
    expect(nudge?.text).toBe('Today\'s plans: 1 of 2 follow-ups done across 2 coordinators.')
    expect(nudge?.detail).toBe('Pragati has not started yet.')
    expect(nudge?.tone).toBe('warn')
  })

  it('leads with broken promises on the dashboard', () => {
    const nudge = composeNudge(
      input({
        role: 'admin',
        userId: 'admin-0',
        firstName: 'Admin',
        screen: 'dashboard',
        brokenPromises: [
          {
            ...followup({ id: 'f9', committed_date: '2026-09-01', committed_amount: 250000, status: 'committed' }),
            entity_name: 'Balaji Print Pack',
            coordinator_name: 'Pragati Patel',
            days_overdue: 5,
          },
        ],
      })
    )
    expect(nudge?.text).toBe('1 promise is broken across the team.')
    expect(nudge?.detail).toContain('Balaji Print Pack is the oldest — 5 days past ₹2,50,000, with Pragati Patel')
  })

})
