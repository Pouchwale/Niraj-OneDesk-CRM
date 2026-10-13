/**
 * What the robot says, unprompted, on the screen the person is looking at.
 *
 * Every line comes from the same records the rest of the app reads; the robot
 * never invents an observation. It speaks only when there is something to act
 * on, and each remark carries a key so it is said once - once per session for
 * a record, once per day for the morning plan - rather than every time the
 * page re-renders.
 */

import type { Company, Followup, OverduePayment, UserRole } from '@/lib/types'
import { carriedOverLine } from './daily-plan'
import { formatCurrency } from '@/lib/utils'
import type { OverdueCommitment } from '@/lib/followups-api'
import type { ResolvedPlan } from './daily-plan'
import type { TeamPlan } from './plan-store'
import type { FocusedRecord, Screen } from './screen-context'
import type { AssistantTask } from './types'

export type NudgeAction =
  /** Set a nudge aside until tomorrow. Nothing is ever logged from a bubble. */
  | { kind: 'snooze_task'; taskId: string; label: string }
  | { kind: 'open_plan'; label: string }
  | { kind: 'open'; label: string }
  | { kind: 'navigate'; to: string; label: string }
  | { kind: 'remind'; toCoordinatorId: string; toName: string; subject: string | null; label: string }

export interface Nudge {
  /** Stable per remark, so it is said once. */
  key: string
  text: string
  detail?: string
  tone: 'info' | 'warn' | 'success'
  actions: NudgeAction[]
  /** Said once per calendar day rather than once per session. */
  daily?: boolean
}

export interface NudgeInput {
  role: UserRole
  userId: string
  firstName: string
  today: string
  /** Local clock, minutes since midnight. */
  minutesNow: number
  screen: Screen
  focused: FocusedRecord | null
  /** The coordinator's live nudges with snoozes applied. */
  tasks: AssistantTask[]
  plan: ResolvedPlan | null
  /** Coordinator: their own follow-ups. Leader: the whole team's. */
  followups: Followup[]
  companies: Company[]
  overduePayments: OverduePayment[]
  /** Leader only. */
  team?: TeamPlan[]
  brokenPromises?: OverdueCommitment[]
  coordinatorName?: (id: string | null) => string
}

function partOfDay(minutesNow: number): string {
  const hour = Math.floor(minutesNow / 60)
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function deepLink(item: { entityType?: string; entityId?: string }): string | null {
  if (!item.entityType || !item.entityId) return null
  return item.entityType === 'overdue_payment'
    ? `/overdue?payment=${item.entityId}`
    : `/companies?company=${item.entityId}`
}

/* ===== Coordinator ===== */

function coordinatorNudge(input: NudgeInput): Nudge | null {
  const { plan } = input

  // Nothing is said over an open account's panel (see composeNudge).

  // 1. The plan is finished: say so once, then leave the person alone.
  // A new round of overdue accounts has just been handed out: say so, once.
  if (plan && plan.round > 0) {
    const fresh = plan.items.filter((item) => (item.round ?? 0) === plan.round)
    if (fresh.length > 0 && fresh.every((item) => item.status === 'open')) {
      const names = fresh.map((item) => item.entityName ?? 'an account')
      return {
        key: `plan-round:${plan.date}:${plan.round}`,
        text:
          plan.round === 1 && plan.items.every((item) => (item.round ?? 0) > 0)
            ? `Nothing due on Active Payments today — here are ${fresh.length} overdue accounts to follow up.`
            : `Active Payments tasks done — here are ${fresh.length} overdue accounts to follow up next.`,
        detail: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}.`,
        tone: 'info',
        actions: [{ kind: 'open_plan', label: 'Show them' }],
      }
    }
  }

  if (plan && plan.complete && plan.done > 0) {
    return {
      key: `plan-complete:${plan.date}`,
      text: `That is all ${plan.total} on today's plan — good work, ${input.firstName}.`,
      detail: 'Every overdue account worth a call has been followed up. I will have tomorrow\'s plan ready when you sign in.',
      tone: 'success',
      actions: [],
      daily: true,
    }
  }

  // 3. The dashboard: the plan for the day.
  if (input.screen === 'dashboard' && plan && plan.total > 0) {
    // Said first, and in the greeting itself: work that came forward is the
    // work most likely to be forgotten, and a list that quietly reorders
    // itself reads as new work rather than as a debt.
    const carried = carriedOverLine(plan)

    if (plan.done === 0 && plan.skipped === 0) {
      return {
        key: `plan-intro:${plan.date}`,
        text: `${partOfDay(input.minutesNow)}, ${input.firstName}. I have lined up ${plan.total} follow-up${
          plan.total === 1 ? '' : 's'
        } for you today${carried ? `, including ${carried}` : ''}.`,
        detail: plan.items[0]?.entityName ? `First up: ${plan.items[0].entityName}.` : undefined,
        tone: carried ? 'warn' : 'info',
        actions: [{ kind: 'open_plan', label: 'Show my plan' }],
        daily: true,
      }
    }
    return {
      key: `plan-progress:${plan.date}:${plan.done}:${plan.skipped}`,
      text: `${plan.done} of ${plan.total} on today's plan done — ${plan.open} to go${
        carried ? `, ${carried}` : ''
      }.`,
      tone: carried ? 'warn' : 'info',
      actions: [{ kind: 'open_plan', label: 'Show my plan' }],
    }
  }

  // 4. On a book screen: the next planned item that lives on this screen.
  if ((input.screen === 'companies' || input.screen === 'overdue') && plan) {
    const wanted = input.screen === 'companies' ? 'company' : 'overdue_payment'
    const next = plan.items.find((item) => item.status === 'open' && item.entityType === wanted)
    if (next) {
      const link = deepLink(next)
      return {
        key: `plan-next:${next.taskId}`,
        text: `Next on today's plan: ${next.message}`,
        tone: 'info',
        actions: [
          ...(link ? [{ kind: 'navigate' as const, to: link, label: 'Open it' }] : []),
          { kind: 'snooze_task', taskId: next.taskId, label: 'Later' },
        ],
      }
    }
  }

  return null
}

/* ===== Team leader / admin ===== */

function leaderNudge(input: NudgeInput): Nudge | null {
  const { team = [], today } = input

  // Nothing is said over an open account's panel (see composeNudge).

  // 1. The Overview: how the team's day is going.
  if (input.screen === 'overview' && team.length > 0) {
    const withPlans = team.filter((t) => t.plan.total > 0)
    if (withPlans.length === 0) return null
    const done = withPlans.reduce((sum, t) => sum + t.plan.done, 0)
    const total = withPlans.reduce((sum, t) => sum + t.plan.total, 0)
    const idle = withPlans.filter((t) => t.plan.done === 0 && t.plan.skipped === 0).map((t) => t.name.split(' ')[0])
    return {
      key: `team-progress:${today}:${done}`,
      text: `Today's plans: ${done} of ${total} follow-ups done across ${withPlans.length} coordinator${
        withPlans.length === 1 ? '' : 's'
      }.`,
      detail:
        idle.length > 0
          ? `${idle.slice(0, 4).join(', ')}${idle.length > 4 ? ` and ${idle.length - 4} more` : ''} ${
              idle.length === 1 ? 'has' : 'have'
            } not started yet.`
          : 'Everyone has started on theirs.',
      tone: idle.length > 0 && input.minutesNow >= 12 * 60 ? 'warn' : 'info',
      actions: [{ kind: 'open', label: 'See the team' }],
    }
  }

  // 2. The dashboard: promises the customers broke, oldest first.
  if (input.screen === 'dashboard' && input.brokenPromises && input.brokenPromises.length > 0) {
    const oldest = input.brokenPromises[0]
    return {
      key: `lead-broken:${today}:${input.brokenPromises.length}`,
      text: `${input.brokenPromises.length} promise${input.brokenPromises.length === 1 ? ' is' : 's are'} broken across the team.`,
      detail: `${oldest.entity_name} is the oldest — ${oldest.days_overdue} day${
        oldest.days_overdue === 1 ? '' : 's'
      } past ${oldest.committed_amount ? formatCurrency(oldest.committed_amount) : 'the promised date'}, with ${
        oldest.coordinator_name
      }.`,
      tone: 'warn',
      actions: [{ kind: 'navigate', to: '/admin/overview', label: 'Open Overview' }],
    }
  }

  return null
}

/** The one thing worth saying right now, or nothing. */
export function composeNudge(input: NudgeInput): Nudge | null {
  // An account's follow-up panel is open: the person is already working on it,
  // and a bubble popping over the panel every time one is opened gets in the
  // way. Robi stays one click away on the button; it just does not interrupt.
  if (input.focused) return null

  switch (input.role) {
    case 'coordinator':
      return coordinatorNudge(input)
    case 'team_leader':
    case 'admin':
      return leaderNudge(input)
    default:
      return null
  }
}
