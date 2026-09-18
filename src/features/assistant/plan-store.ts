/**
 * Where each coordinator's daily plan lives.
 *
 * Only the choice of items and the "later" marks are stored; whether an item
 * is done is read from the live records every time (see resolvePlan). One key
 * holds every coordinator's plan so a team leader can read the team's day from
 * the same browser in demo mode, and so a plan made from the leader's screen
 * is the very plan the coordinator sees when they sign in.
 */

import type { Company, Followup, OverduePayment } from '@/lib/types'
import { buildAssistantTasks } from './rules'
import {
  makePlan,
  openAccountKeys,
  resolvePlan,
  unfinishedItems,
  type DailyPlan,
  type ResolvedPlan,
} from './daily-plan'
import type { AssistantTask } from './types'

const STORAGE_KEY = 'crm.assistant.plans'

type PlanBook = Record<string, DailyPlan>

/** Stands in for localStorage where there is none (tests, private mode). */
let memory: PlanBook | null = null

function readAll(): PlanBook {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as PlanBook) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    memory = memory ?? {}
    return memory
  }
}

function writeAll(book: PlanBook): void {
  if (memory) {
    memory = book
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(book))
  } catch {
    // Keep going in memory; the plan is still right for this session.
    memory = book
  }
}

export function getPlan(userId: string): DailyPlan | null {
  return readAll()[userId] ?? null
}

/** What yesterday's plan has to be read against to know what was left. */
export interface PlanEvidence {
  followups: Followup[]
  /**
   * Accounts still owed and still chased, by entity key — the whole book, not
   * one coordinator's share of it. Scoping this to the person was what made a
   * reassigned account look collected.
   */
  open: Set<string>
  /** Of those, the ones still assigned to this coordinator. */
  mine?: Set<string>
}

/**
 * Today's plan for one person, made now if the day has turned.
 *
 * Callers pass the unsuppressed task list so a snoozed nudge can still be
 * planned: the coordinator said "later", and this is later.
 *
 * When the day turns, whatever was still open yesterday comes forward as
 * itself. Without the evidence to say what was open, nothing is carried —
 * inventing a backlog would be worse than missing one.
 */
export function ensurePlan(
  userId: string,
  date: string,
  tasks: AssistantTask[],
  evidence?: PlanEvidence
): DailyPlan {
  const book = readAll()
  const existing = book[userId]
  // An empty plan is remade whenever asked: there was nothing to plan when
  // the day started, and an upload since may have changed that.
  if (existing && existing.date === date && existing.items.length > 0) return existing

  const carried =
    existing && existing.date < date && evidence
      ? unfinishedItems(
          resolvePlan(existing, tasks, evidence.followups, userId, evidence.open, evidence.mine)
        )
      : []

  const plan = makePlan(userId, date, tasks, carried)
  writeAll({ ...book, [userId]: plan })
  return plan
}

/** Sets an item aside for today; it comes back tomorrow if still open. */
export function skipPlanItem(userId: string, taskId: string): DailyPlan | null {
  const book = readAll()
  const plan = book[userId]
  if (!plan || !plan.items.some((item) => item.taskId === taskId)) return plan ?? null
  if (plan.skipped.includes(taskId)) return plan

  const next = { ...plan, skipped: [...plan.skipped, taskId] }
  writeAll({ ...book, [userId]: next })
  return next
}

/** Puts a skipped item back into today's work. */
export function unskipPlanItem(userId: string, taskId: string): DailyPlan | null {
  const book = readAll()
  const plan = book[userId]
  if (!plan) return null
  const next = { ...plan, skipped: plan.skipped.filter((id) => id !== taskId) }
  writeAll({ ...book, [userId]: next })
  return next
}

export interface TeamPlan {
  coordinatorId: string
  name: string
  plan: ResolvedPlan
  /** The coordinator's live nudges, unsuppressed. */
  tasks: AssistantTask[]
}

/**
 * Every coordinator's plan for today, made from the same data they would
 * see themselves. Read by the Overview, the leader's robot and the assistant.
 */
export function teamPlans(
  coordinators: { id: string; full_name: string }[],
  companies: Company[],
  overduePayments: OverduePayment[],
  followups: Followup[],
  today: string
): TeamPlan[] {
  return coordinators.map((coordinator) => {
    const tasks = buildAssistantTasks({
      companies: companies.filter((c) => c.assigned_coordinator_id === coordinator.id),
      overduePayments: overduePayments.filter((p) => p.assigned_coordinator_id === coordinator.id),
      followups: followups.filter((f) => f.coordinator_id === coordinator.id),
      today,
    })
    const mineFollowups = followups.filter((f) => f.coordinator_id === coordinator.id)
    /*
     * Two sets, deliberately. `owed` is the whole book: an account missing from
     * it has genuinely been dealt with. `mine` is this coordinator's share, and
     * an account that is owed but missing from it has simply changed hands.
     * Reading one set for both questions is what marked a handed-over desk's
     * work done overnight.
     */
    const owed = openAccountKeys(companies, overduePayments)
    const mine = openAccountKeys(
      companies.filter((c) => c.assigned_coordinator_id === coordinator.id),
      overduePayments.filter((p) => p.assigned_coordinator_id === coordinator.id)
    )
    const stored = ensurePlan(coordinator.id, today, tasks, { followups: mineFollowups, open: owed, mine })
    const plan = resolvePlan(stored, tasks, followups, coordinator.id, owed, mine)
    return { coordinatorId: coordinator.id, name: coordinator.full_name, plan, tasks }
  })
}

/** Test hook: forget every plan. */
export function resetPlansForTests(): void {
  memory = {}
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // No storage to clear.
  }
}
