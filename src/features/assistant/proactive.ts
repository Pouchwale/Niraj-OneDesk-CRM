/**
 * What the robot says, unprompted, on the screen the person is looking at.
 *
 * Every line comes from the same records the rest of the app reads; the robot
 * never invents an observation. It speaks only when there is something to act
 * on, and each remark carries a key so it is said once - once per session for
 * a record, once per day for the morning plan - rather than every time the
 * page re-renders.
 */

import type {
  AttendanceEntry,
  Company,
  DecisionRequest,
  Followup,
  OverduePayment,
  ProofRequest,
  RfdRow,
  UserRole,
} from '@/lib/types'
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
  /** Leader only: what is waiting on the leader's desk. */
  desk?: LeaderDesk
  coordinatorName?: (id: string | null) => string
}

/** The team records a leader acts on, straight from the store. */
export interface LeaderDesk {
  decisionRequests: DecisionRequest[]
  proofRequests: ProofRequest[]
  attendance: AttendanceEntry[]
  rfdRows: RfdRow[]
}

/** RFD lines ready this long and still unpaid are money held up. */
const RFD_STUCK_DAYS = 7

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

function leaderNudges(input: NudgeInput): Nudge[] {
  const { team = [], today } = input
  const said: Nudge[] = []

  // Nothing is said over an open account's panel (see composeNudge).
  // Desk items come first: they wait on the leader, not on the team.
  said.push(...deskNudges(input))

  // 1. The Overview: how the team's day is going.
  if (input.screen === 'overview' && team.length > 0) {
    const withPlans = team.filter((t) => t.plan.total > 0)
    if (withPlans.length === 0) return [...said, ...dayNudges(input)]
    const done = withPlans.reduce((sum, t) => sum + t.plan.done, 0)
    const total = withPlans.reduce((sum, t) => sum + t.plan.total, 0)
    const idle = withPlans.filter((t) => t.plan.done === 0 && t.plan.skipped === 0).map((t) => t.name.split(' ')[0])
    said.push({
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
    })
  }

  // 2. The dashboard: promises the customers broke, oldest first.
  if (input.screen === 'dashboard' && input.brokenPromises && input.brokenPromises.length > 0) {
    const oldest = input.brokenPromises[0]
    said.push({
      key: `lead-broken:${today}:${input.brokenPromises.length}`,
      text: `${input.brokenPromises.length} promise${input.brokenPromises.length === 1 ? ' is' : 's are'} broken across the team.`,
      detail: `${oldest.entity_name} is the oldest — ${oldest.days_overdue} day${
        oldest.days_overdue === 1 ? '' : 's'
      } past ${oldest.committed_amount ? formatCurrency(oldest.committed_amount) : 'the promised date'}, with ${
        oldest.coordinator_name
      }.`,
      tone: 'warn',
      actions: [{ kind: 'navigate', to: '/admin/overview', label: 'Open Overview' }],
    })
  }

  // Once a day, on any screen: who is out, and money stuck at the gate.
  said.push(...dayNudges(input))
  return said
}

function names(list: string[], max = 3): string {
  const unique = [...new Set(list)]
  return `${unique.slice(0, max).join(', ')}${unique.length > max ? ` and ${unique.length - max} more` : ''}`
}

/** Requests and proofs that wait for the leader, keyed by what is waiting so a new one is news. */
function deskNudges(input: NudgeInput): Nudge[] {
  const { desk, today } = input
  if (!desk) return []
  const first = (id: string | null) => (input.coordinatorName ? input.coordinatorName(id) : id ?? 'Someone').split(' ')[0]
  const out: Nudge[] = []

  const approvals = desk.decisionRequests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
  if (approvals.length > 0) {
    const oldest = approvals[0]
    const kind = { no_followup: 'No follow-up', dispute: 'Dispute', export: 'Export client', bankrupt: 'Bankrupt' }[oldest.kind]
    out.push({
      key: `lead-approvals:${approvals.map((r) => r.id).join(',')}`,
      text: `${approvals.length} request${approvals.length === 1 ? ' is' : 's are'} waiting for your approval.`,
      detail: `Oldest: ${first(oldest.requestedBy)} asks to mark ${oldest.name} as ${kind}.`,
      tone: 'warn',
      actions: [{ kind: 'navigate', to: '/admin/overview?tab=approvals', label: 'Review' }],
    })
  }

  const toReview = desk.proofRequests.filter((r) => r.status === 'submitted')
  if (toReview.length > 0) {
    out.push({
      key: `lead-proofs:${toReview.map((r) => r.id).join(',')}`,
      text: `${toReview.length} proof screenshot${toReview.length === 1 ? ' is' : 's are'} waiting for your review.`,
      detail: `From ${names(toReview.map((r) => first(r.coordinatorId)))}.`,
      tone: 'info',
      actions: [{ kind: 'navigate', to: '/admin/overview?tab=proofs', label: 'Review' }],
    })
  }

  const missed = desk.proofRequests.filter((r) => r.status === 'missed' && r.date === today)
  if (missed.length > 0) {
    out.push({
      key: `lead-missed:${today}:${missed.length}`,
      text: `${missed.length} proof check${missed.length === 1 ? ' was' : 's were'} missed today.`,
      detail: `${names(missed.map((r) => first(r.coordinatorId)))} did not send the screenshot in time.`,
      tone: 'warn',
      actions: [{ kind: 'navigate', to: '/admin/overview?tab=proofs', label: 'See them' }],
    })
  }

  return out
}

/** Said once a day: who is out of the office, and RFD money held up. */
function dayNudges(input: NudgeInput): Nudge[] {
  const { desk, today } = input
  if (!desk) return []
  const first = (id: string) => (input.coordinatorName ? input.coordinatorName(id) : id).split(' ')[0]
  const out: Nudge[] = []

  const away = desk.attendance.filter((a) => a.date === today)
  if (away.length > 0) {
    const leave = away.filter((a) => a.status === 'leave').map((a) => first(a.userId))
    const half = away.filter((a) => a.status === 'half_day').map((a) => first(a.userId))
    out.push({
      key: `lead-attendance:${today}:${away.map((a) => `${a.userId}=${a.status}`).sort().join(',')}`,
      text: `Out of the office today: ${away.length} coordinator${away.length === 1 ? '' : 's'}.`,
      detail: [leave.length ? `On leave: ${names(leave, 4)}.` : '', half.length ? `Half day: ${names(half, 4)}.` : '']
        .filter(Boolean)
        .join(' '),
      tone: 'info',
      actions: [{ kind: 'navigate', to: '/admin/overview?tab=attendance', label: 'Attendance' }],
      daily: true,
    })
  }

  const stuck = desk.rfdRows.filter((r) => r.pending_value > 0 && (r.days ?? 0) >= RFD_STUCK_DAYS)
  if (stuck.length > 0) {
    const total = stuck.reduce((sum, r) => sum + r.pending_value, 0)
    const byCustomer = new Map<string, number>()
    for (const r of stuck) byCustomer.set(r.customer_name, (byCustomer.get(r.customer_name) ?? 0) + r.pending_value)
    const [topName, topValue] = [...byCustomer].sort((a, b) => b[1] - a[1])[0]
    out.push({
      key: `lead-rfd:${today}`,
      text: `${formatCurrency(total)} of goods is ready for dispatch but unpaid for ${RFD_STUCK_DAYS}+ days.`,
      detail: `${stuck.length} line${stuck.length === 1 ? '' : 's'} across ${byCustomer.size} customer${
        byCustomer.size === 1 ? '' : 's'
      }; the most is ${topName} at ${formatCurrency(topValue)}.`,
      tone: 'info',
      actions: [{ kind: 'navigate', to: '/rfd', label: 'Open RFD' }],
      daily: true,
    })
  }

  return out
}

/**
 * Everything worth saying right now, most pressing first. The widget says the
 * first one not said yet, so Robi moves down the list instead of repeating
 * the top line.
 */
export function composeNudges(input: NudgeInput): Nudge[] {
  // An account's follow-up panel is open: the person is already working on it,
  // and a bubble popping over the panel every time one is opened gets in the
  // way. Robi stays one click away on the button; it just does not interrupt.
  if (input.focused) return []

  switch (input.role) {
    case 'coordinator': {
      const nudge = coordinatorNudge(input)
      return nudge ? [nudge] : []
    }
    case 'team_leader':
    case 'admin':
      return leaderNudges(input)
    default:
      return []
  }
}

/** The one thing worth saying right now, or nothing. */
export function composeNudge(input: NudgeInput): Nudge | null {
  return composeNudges(input)[0] ?? null
}
