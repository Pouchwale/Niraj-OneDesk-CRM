/**
 * Where each coordinator's daily plan lives.
 *
 * In the shared working dataset, one plan per coordinator per day, kept for
 * good. It used to sit in each browser's localStorage and only for the current
 * day: the leader's screen and the coordinator's own could hold different
 * plans, and yesterday's was overwritten the moment today's was made, so
 * nobody could look back at who did what they were asked.
 *
 * Only the choice of items, the "later" marks and - once the day is over -
 * how each item ended are stored. Whether an item is done is read from the
 * follow-ups every time (see resolvePlan).
 */

import type { Company, Followup, OverduePayment } from '@/lib/types'
import { demoCompanyStore } from '@/lib/demo-companies'
import { isSetAside } from '@/lib/no-followup'
import { addDaysISO, formatCurrency, formatDate, formatRelativeDate } from '@/lib/utils'
import { nextToFollowUp, type NextUp } from './next-up'
import { pickProofTasks } from './proof'
import { planForAttendance } from './attendance'
import { isOnTop, notePendingItems } from './note-pending'
import { buildAssistantTasks } from './rules'
import {
  balanceLookup,
  customerLookup,
  endOfDay,
  entityKeyOf,
  isExtraItem,
  makePlan,
  PLAN_MIN_AMOUNT,
  waitingCustomers,
  type BalanceOf,
  type CustomerOf,
  type DueDateOf,
  dueDateLookup,
  openAccountKeys,
  PLAN_SIZE,
  resolvePlan,
  unfinishedItems,
  type DailyPlan,
  type PlanItem,
  type PlanItemStatus,
  type ResolvedPlan,
} from './daily-plan'
import type { AssistantTask } from './types'

/** Where plans were kept before they were shared; read once to carry today's across. */
const LEGACY_STORAGE_KEY = 'crm.assistant.plans'

function legacyPlan(userId: string): DailyPlan | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    const book = raw ? (JSON.parse(raw) as Record<string, DailyPlan>) : null
    const plan = book?.[userId]
    return plan && typeof plan.date === 'string' && Array.isArray(plan.items) ? plan : null
  } catch {
    return null
  }
}

/** Today's plan for this person, if one has been made. */
export function getPlan(userId: string, date?: string): DailyPlan | null {
  if (date) return demoCompanyStore.getDailyPlan(userId, date)
  const all = demoCompanyStore.getDailyPlans().filter((p) => p.userId === userId)
  return all.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
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
  /** Which customer each record belongs to, so work is matched per customer. */
  customerOf?: CustomerOf
  /** What each record owes, so nothing under PLAN_MIN_AMOUNT is planned. */
  balanceOf?: BalanceOf
  /** When each invoice fell due: the plan is the oldest and biggest money first. */
  dueDateOf?: DueDateOf
  /** The ageing report, for the plan's four overdue tasks. */
  overduePayments?: OverduePayment[]
  /** This coordinator's invoices, to fill Active Payments slots the nudges leave empty. */
  companies?: Company[]
  /** Fresh tasks per half: four, or two on a half day. */
  perHalf?: number
}

/**
 * Today's plan for one person, made now if the day has turned.
 *
 * Callers pass the unsuppressed task list so a snoozed nudge can still be
 * planned: the coordinator said "later", and this is later.
 *
 * When the day turns, how the last plan ended is written down on it, and
 * whatever was still open comes forward as itself. Without the evidence to say
 * what was open, nothing is carried — inventing a backlog would be worse than
 * missing one.
 */
export function ensurePlan(
  userId: string,
  date: string,
  tasks: AssistantTask[],
  evidence?: PlanEvidence
): DailyPlan {
  const existing = demoCompanyStore.getDailyPlan(userId, date)
  if (existing && existing.items.length > 0) return existing

  // On leave: no plan. Nothing is recorded, so the next working day's plan
  // brings forward whatever was still open before the leave.
  const attendance = demoCompanyStore.getAttendance(userId, date)?.status ?? null
  if (attendance === 'leave') return existing ?? { userId, date, items: [], skipped: [], createdAt: new Date().toISOString() }
  if (attendance === 'half_day' && evidence) evidence = { ...evidence, perHalf: PLAN_SIZE / 2 }

  // A plan made in this browser before plans were shared, for today.
  const legacy = legacyPlan(userId)
  if (!existing && legacy && legacy.date === date && legacy.items.length > 0) {
    return demoCompanyStore.recordDailyPlan(legacy)
  }

  const previous = demoCompanyStore.getPreviousDailyPlan(userId, date) ?? (legacy && legacy.date < date ? legacy : null)
  let carried: ReturnType<typeof unfinishedItems> = []
  if (previous && evidence) {
    // Judged as the day stood when it ended: a call made this morning is
    // today's work, not yesterday's.
    const ended = resolvePlan(
      previous,
      tasks,
      evidence.followups,
      userId,
      evidence.open,
      evidence.mine,
      endOfDay(previous.date),
      evidence.customerOf
    )
    if (!previous.outcome && demoCompanyStore.getDailyPlan(userId, previous.date)) {
      const outcome: Record<string, PlanItemStatus> = {}
      for (const item of ended.items) outcome[item.taskId] = item.status
      demoCompanyStore.closeDailyPlan(userId, previous.date, outcome, new Date().toISOString())
    }
    // What comes forward is what is still undone now: a call made this morning
    // was late, and the record says so, but it needs no reminder.
    carried = unfinishedItems(
      resolvePlan(previous, tasks, evidence.followups, userId, evidence.open, evidence.mine, undefined, evidence.customerOf)
    )
  }

  // A customer given a next follow-up date later than today waits for it, carried or not.
  if (evidence) {
    const waiting = waitingCustomers(evidence.followups, date, evidence.customerOf, true)
    carried = carried.filter((item) => {
      const key = entityKeyOf(item)
      return !key || !waiting.has(evidence.customerOf?.(key) ?? key)
    })
  }

  // Nobody waiting for a later date, or resting after a recent call, is planned.
  // Active Payments only once the invoice is past due or due within two days.
  if (evidence) {
    const resting = waitingCustomers(evidence.followups, date, evidence.customerOf, true)
    const dueEnough = activeAllowed(date, evidence)
    tasks = tasks.filter((task) => {
      const key = entityKeyOf(task)
      return !key || (!resting.has(evidence!.customerOf?.(key) ?? key) && dueEnough(key))
    })
    carried = carried.filter((item) => dueEnough(entityKeyOf(item)))
  }
  // Money past 120 days held up by a credit or debit note: a task every day,
  // first and on top of the eight, whatever the rest or follow-up dates say.
  const notes = evidence?.overduePayments
    ? notePendingItems(date, evidence.overduePayments, evidence.followups, evidence.customerOf)
    : []
  if (notes.length && evidence) {
    const noted = new Set(notes.map((n) => evidence!.customerOf?.(entityKeyOf(n)!) ?? entityKeyOf(n)))
    const other = (key: string | null) => !key || !noted.has(evidence!.customerOf?.(key) ?? key)
    tasks = tasks.filter((task) => other(entityKeyOf(task)))
    carried = carried.filter((item) => item.special !== 'note_pending' && other(entityKeyOf(item)))
  }
  const active = makePlan(userId, date, tasks, carried, undefined, evidence?.customerOf, evidence?.balanceOf, evidence?.dueDateOf, evidence?.perHalf ?? PLAN_SIZE)
  active.items = [...notes, ...active.items]
  // Four Active Payments tasks, then four Overdue Payments tasks: eight a day.
  if (evidence?.companies) active.items = [...active.items, ...activeFill(date, active.items, evidence)]
  const plan = evidence?.overduePayments
    ? { ...active, items: [...active.items, ...overduePart(userId, date, active.items, carried, evidence)] }
    : active
  if (evidence) plan.items = [...plan.items, ...topUp(userId, date, plan.items, evidence)]
  // Nothing to plan, and nothing was planned: already on record, say nothing
  // more. Writing it again would announce a change on every redraw.
  if (existing && plan.items.length === 0) return existing
  // One proof check on a half day, two on a full one.
  return demoCompanyStore.recordDailyPlan({ ...plan, proofTaskIds: pickProofTasks(plan.items, attendance === 'half_day' ? 1 : undefined) })
}

/** Sets an item aside for today; it comes back tomorrow if still open. */
export function skipPlanItem(userId: string, taskId: string, date?: string): DailyPlan | null {
  const plan = getPlan(userId, date)
  if (!plan || !plan.items.some((item) => item.taskId === taskId)) return plan
  if (plan.skipped.includes(taskId)) return plan
  demoCompanyStore.setDailyPlanItemSkipped(userId, plan.date, taskId, true)
  return demoCompanyStore.getDailyPlan(userId, plan.date)
}

/** Puts a skipped item back into today's work. */
export function unskipPlanItem(userId: string, taskId: string, date?: string): DailyPlan | null {
  const plan = getPlan(userId, date)
  if (!plan) return null
  if (!plan.skipped.includes(taskId)) return plan
  demoCompanyStore.setDailyPlanItemSkipped(userId, plan.date, taskId, false)
  return demoCompanyStore.getDailyPlan(userId, plan.date)
}

/** One overdue account as a plan task. */
function overdueItem(pick: NextUp, taskId: string, plannedAt: string): PlanItem {
  return {
    taskId,
    kind: 'overdue_followup',
    message: `Follow up ${pick.name}: ${formatCurrency(pick.balance)} overdue${
      pick.critical > 0 ? `, ${formatCurrency(pick.critical)} of it past 90 days` : ''
    } — ${pick.lastContact ? `last contact ${formatRelativeDate(pick.lastContact)}` : 'never followed up'}.`,
    entityType: 'overdue_payment',
    entityId: pick.id,
    entityName: pick.name,
    amount: pick.balance,
    plannedAt,
  }
}

/**
 * Tops the Active Payments half up to four when the nudges leave it short.
 *
 * Nudges only raise an invoice whose customer has gone quiet for a fortnight,
 * or is due soon, so a coordinator who rings often had nothing to plan - and
 * an empty half of the day. The rest come from their past-due invoices: the
 * oldest due date first, then the biggest, one per customer, ₹1,000 or more,
 * nobody rung today or waiting for a later follow-up date.
 */
function activeFill(
  date: string,
  planItems: PlanItem[],
  evidence: PlanEvidence,
  now: Date = new Date(),
  // Fresh tasks only: leftovers from earlier days sit on top of the day's four.
  room: number = (evidence.perHalf ?? PLAN_SIZE) - planItems.filter((item) => item.entityType === 'company' && !isOnTop(item)).length,
  statuses: string[] = ['overdue', 'critical'],
  /** Given, only invoices due on or before this date. */
  dueBy?: string
): PlanItem[] {
  if (room <= 0) return []
  const customer = (entityKey: string) => evidence.customerOf?.(entityKey) ?? entityKey
  const waiting = waitingCustomers(evidence.followups, date, evidence.customerOf, true)
  const taken = new Set(planItems.map(entityKeyOf).filter((k): k is string => k !== null).map(customer))
  const startOfToday = new Date(`${date}T00:00:00`).toISOString()
  const lastContact = new Map<string, string>()
  for (const f of evidence.followups) {
    const key = customer(`${f.entity_type}:${f.entity_id}`)
    const at = f.created_at ?? f.followup_date
    if (!lastContact.has(key) || at > lastContact.get(key)!) lastContact.set(key, at)
  }

  const candidates = (evidence.companies ?? [])
    .filter((c) => statuses.includes(c.status) && !isSetAside(c))
    .filter((c) => !dueBy || (c.due_date !== null && c.due_date !== undefined && c.due_date.slice(0, 10) <= dueBy))
    .filter((c) => (c.total_amount ?? 0) >= PLAN_MIN_AMOUNT)
    .sort(
      (a, b) =>
        // Highest amount first, then the oldest due date (since 10 Oct 2026).
        (b.total_amount ?? 0) - (a.total_amount ?? 0) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    )

  const picked: PlanItem[] = []
  for (const c of candidates) {
    if (picked.length >= room) break
    const key = customer(`company:${c.id}`)
    if (taken.has(key) || waiting.has(key)) continue
    const last = lastContact.get(key) ?? null
    if (last && last >= startOfToday) continue
    taken.add(key)
    picked.push({
      taskId: `active:${date}:${c.id}`,
      kind: 'stale_contact',
      message: `Follow up ${c.name}: ${formatCurrency(c.total_amount)}${c.invoice_no ? ` on invoice ${c.invoice_no}` : ''}, due ${
        c.due_date ? formatDate(c.due_date) : 'date unknown'
      } — ${last ? `last contact ${formatRelativeDate(last)}` : 'never followed up'}.`,
      entityType: 'company',
      entityId: c.id,
      entityName: c.name,
      amount: c.total_amount,
      plannedAt: now.toISOString(),
    })
  }
  return picked
}

/** Days ahead of its due date an Active Payments invoice becomes work (since 13 Oct 2026). */
export const ACTIVE_DUE_WINDOW_DAYS = 2

/**
 * Whether an Active Payments task may be planned: the invoice is past due, or
 * due within two days. Nothing earlier, whatever raised it - a quiet spell, a
 * date the coordinator set, a promise. Overdue Payments rows always pass.
 */
export function activeAllowed(date: string, evidence: Pick<PlanEvidence, 'companies' | 'dueDateOf'>) {
  const dueBy = addDaysISO(date, ACTIVE_DUE_WINDOW_DAYS)
  const byId = new Map((evidence.companies ?? []).map((c) => [c.id, c]))
  return (key: string | null): boolean => {
    if (!key || !key.startsWith('company:')) return true
    const invoice = byId.get(key.slice('company:'.length))
    if (invoice?.status === 'paid') return false
    const due = invoice?.due_date ?? evidence.dueDateOf?.(key) ?? null
    if (due) return due.slice(0, 10) <= dueBy
    return invoice ? invoice.status === 'overdue' || invoice.status === 'critical' : true
  }
}

/**
 * Eight fresh tasks a day for everyone who has eight customers to ring. When
 * one half comes up short - every overdue customer waiting for a later date,
 * say - the other half makes up the difference: more past-due invoices, more
 * overdue accounts, then invoices not yet due, oldest due date first. A
 * customer waiting for a later follow-up date stays out (since 8 Oct 2026).
 */
export function topUp(userId: string, date: string, planItems: PlanItem[], evidence: PlanEvidence): PlanItem[] {
  const now = new Date()
  const added: PlanItem[] = []
  const short = () => (evidence.perHalf ?? PLAN_SIZE) * 2 - [...planItems, ...added].filter((item) => !isOnTop(item)).length
  if (short() <= 0) return []
  if (evidence.companies) added.push(...activeFill(date, [...planItems, ...added], evidence, now, short()))
  if (short() > 0 && evidence.overduePayments) {
    const picks = nextToFollowUp({
      userId,
      overduePayments: evidence.overduePayments,
      followups: evidence.followups,
      planItems: [...planItems, ...added],
      startOfToday: new Date(`${date}T00:00:00`).toISOString(),
      customerOf: evidence.customerOf,
      limit: short(),
      today: date,
    })
    added.push(...picks.map((pick) => overdueItem(pick, `overdue:${date}:${pick.id}`, now.toISOString())))
  }
  if (short() > 0 && evidence.companies) {
    // Not yet due: only what falls due within two days.
    added.push(...activeFill(date, [...planItems, ...added], evidence, now, short(), ['current', 'upcoming'], addDaysISO(date, ACTIVE_DUE_WINDOW_DAYS)))
  }
  return added
}

/**
 * The day's four Overdue Payments tasks: yesterday's unfinished ones first,
 * then the oldest money and biggest balances - never a customer already on the
 * plan, one under PLAN_MIN_AMOUNT, or one whose next follow-up date is later.
 */
function overduePart(
  userId: string,
  date: string,
  planItems: PlanItem[],
  carried: PlanItem[],
  evidence: PlanEvidence,
  now: Date = new Date()
): PlanItem[] {
  const customer = (entityKey: string) => evidence.customerOf?.(entityKey) ?? entityKey
  const waiting = waitingCustomers(evidence.followups, date, evidence.customerOf, true)
  const taken = new Set(planItems.map(entityKeyOf).filter((k): k is string => k !== null).map(customer))

  const brought: PlanItem[] = []
  for (const item of carried) {
    const entityKey = entityKeyOf(item)
    if (!entityKey || item.entityType !== 'overdue_payment' || isExtraItem(item)) continue
    const key = customer(entityKey)
    const owed = evidence.balanceOf?.(entityKey) ?? item.amount ?? 0
    if (taken.has(key) || waiting.has(key) || owed < PLAN_MIN_AMOUNT) continue
    taken.add(key)
    brought.push({
      ...item,
      message: `Carried from ${formatDate(item.carriedFrom ?? date)}: follow up ${item.entityName ?? 'this account'} — ${formatCurrency(owed)} overdue.`,
      detail: undefined,
      amount: owed,
    })
  }

  const picks = nextToFollowUp({
    userId,
    overduePayments: evidence.overduePayments ?? [],
    followups: evidence.followups,
    planItems: [...planItems, ...brought],
    startOfToday: new Date(`${date}T00:00:00`).toISOString(),
    customerOf: evidence.customerOf,
    // Four fresh ones (two on a half day); leftovers come on top of them.
    limit: evidence.perHalf ?? PLAN_SIZE,
    today: date,
  })
  const plannedAt = now.toISOString()
  return [...brought, ...picks.map((pick) => overdueItem(pick, `overdue:${date}:${pick.id}`, plannedAt))]
}

/**
 * Once nothing on today's plan is left open, hands out the next round: four
 * of the coordinator's overdue accounts - the oldest money first, then the
 * biggest balance - by the same rules as everything else Robi plans (₹1,000
 * or more, one per customer, nobody already rung today or already on the plan). The morning's tasks come from
 * Active Payments; every round after them comes from Overdue Payments, until
 * there is nobody left to ring.
 *
 * Returns the plan as it now stands - with the new round, or unchanged.
 */
export function extendPlanIfFinished(
  stored: DailyPlan,
  resolved: ResolvedPlan,
  book: { overduePayments: OverduePayment[]; followups: Followup[]; customerOf?: CustomerOf },
  now: Date = new Date()
): DailyPlan {
  if (resolved.open > 0) return stored
  const round = resolved.round + 1
  // Already added - by this screen a moment ago, or by another one.
  if (stored.items.some((item) => (item.round ?? 0) >= round)) return stored

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const picks = nextToFollowUp({
    userId: stored.userId,
    overduePayments: book.overduePayments,
    followups: book.followups,
    planItems: stored.items,
    startOfToday: startOfToday.toISOString(),
    customerOf: book.customerOf,
    // Oldest money first, then the biggest balance - the same pick whichever screen makes it.
    limit: PLAN_SIZE,
    today: stored.date,
  })
  if (picks.length === 0) return stored

  const plannedAt = now.toISOString()
  const items: PlanItem[] = picks.map((pick) => ({
    ...overdueItem(pick, `overdue-round:${stored.date}:${round}:${pick.id}`, plannedAt),
    round,
  }))
  demoCompanyStore.addDailyPlanRound(stored.userId, stored.date, round, items)
  return demoCompanyStore.getDailyPlan(stored.userId, stored.date) ?? stored
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
  // A call logged on any of the customer's records completes their task.
  const customerOf = customerLookup(companies, overduePayments)
  const balanceOf = balanceLookup(companies, overduePayments)
  const dueDateOf = dueDateLookup(companies)
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
    const made = ensurePlan(coordinator.id, today, tasks, { followups: mineFollowups, open: owed, mine, customerOf, balanceOf, dueDateOf, overduePayments: overduePayments.filter((p) => p.assigned_coordinator_id === coordinator.id), companies: companies.filter((c) => c.assigned_coordinator_id === coordinator.id) })
    // No extra overdue rounds since 7 Oct 2026: the plan itself holds the overdue work.
    const plan = judgedOnAttendance(made, (p) => resolvePlan(p, tasks, followups, coordinator.id, owed, mine, undefined, customerOf))
    return { coordinatorId: coordinator.id, name: coordinator.full_name, plan, tasks }
  })
}

/**
 * The day's plan as the coordinator's attendance allows (see attendance.ts):
 * resolved once to see what is done, then cut for a half day or a leave.
 */
export function judgedOnAttendance(stored: DailyPlan, resolve: (plan: DailyPlan) => ResolvedPlan): ResolvedPlan {
  const first = resolve(stored)
  const status = demoCompanyStore.getAttendance(stored.userId, stored.date)?.status ?? null
  if (!status) return first
  const done = new Set(first.items.filter((i) => i.status === 'done').map((i) => i.taskId))
  return resolve(planForAttendance(stored, status, (id) => done.has(id)))
}

/** Test hook: forget every plan. */
export function resetPlansForTests(): void {
  demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), dailyPlans: [] })
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // No storage to clear.
  }
}
