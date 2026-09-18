/**
 * The daily plan: the three or four follow-ups the robot hands each
 * coordinator every morning.
 *
 * The nudge queue (rules.ts) can hold twenty items on a bad day, and a list
 * that long is a list nobody starts. The plan is the short version: the
 * highest-value work, one slot per customer, no more than two of a kind, with
 * yesterday's unfinished accounts back at the top. It is fixed for the day so
 * the goalposts do not move, and an item completes itself the moment the
 * follow-up it asked for is logged - from the widget, the account panel, or
 * anywhere else.
 */

import type { Followup } from '../../lib/types'
import { toLocalISODate } from '../../lib/utils'
import type { AssistantTask, AssistantTaskKind } from './types'

export const PLAN_SIZE = 4
const MAX_PER_KIND = 2
/** Nudges that are information rather than work; they never fill a slot. */
const NOT_PLANNABLE: AssistantTaskKind[] = ['yesterday_recap']

export interface PlanItem {
  taskId: string
  /**
   * The day this work was first planned, when it is not today's. Unfinished
   * work moves forward rather than evaporating, and the person picking it up
   * deserves to know it has been waiting.
   */
  carriedFrom?: string
  kind: AssistantTaskKind
  message: string
  detail?: string
  entityType?: 'company' | 'overdue_payment'
  entityId?: string
  entityName?: string
  amount?: number | null
}

export interface DailyPlan {
  userId: string
  /** Local calendar date the plan is for. */
  date: string
  items: PlanItem[]
  /** Task ids the coordinator set aside for today ("Later"). */
  skipped: string[]
  createdAt: string
}

/**
 * Only `done` means somebody did the work, and only a logged follow-up says so.
 *
 * The other two endings are things that happened *to* the account. `closed` is
 * an account that left the book — paid, settled, set aside, declared bankrupt,
 * retired by the nightly sync, or simply re-imported under a new id. `moved` is
 * an account still owed that now belongs to another coordinator. Both take the
 * item off the list; neither is a tick against anybody's name.
 */
export type PlanItemStatus = 'open' | 'done' | 'skipped' | 'moved' | 'closed'

export interface ResolvedPlanItem extends PlanItem {
  status: PlanItemStatus
}

export interface ResolvedPlan {
  userId: string
  date: string
  items: ResolvedPlanItem[]
  /** Items brought forward from an earlier day, still not done. */
  carriedOver: number
  /** The day the oldest of those was first planned; null when none were. */
  oldestCarried: string | null
  /** Follow-ups actually logged against this plan. Nothing else counts. */
  done: number
  skipped: number
  open: number
  /** Handed to another coordinator since the plan was made. Never counted done. */
  moved: number
  /** Left the book of what is owed by itself. Never counted done. */
  closed: number
  total: number
  /** Nothing left open: everything is done or set aside. */
  complete: boolean
}

export function entityKeyOf(task: { entityType?: string; entityId?: string }): string | null {
  return task.entityType && task.entityId ? `${task.entityType}:${task.entityId}` : null
}

/**
 * The accounts still owed and still being chased, by entity key.
 *
 * This is what a plan item is measured against. An account that has left this
 * set has been dealt with one way or another — collected, settled, set aside,
 * declared bankrupt, or removed — and the item asking somebody to ring it is
 * finished. An account still in it is not, whatever the nudge queue says
 * today.
 */
export function openAccountKeys(
  companies: { id: string; status: string; total_amount?: number | null; no_followup_at?: string | null }[],
  overduePayments: { id: string; status: string; balance_due?: number | null; no_followup_at?: string | null }[]
): Set<string> {
  const keys = new Set<string>()
  for (const company of companies) {
    if (company.status === 'paid' || company.no_followup_at) continue
    keys.add(`company:${company.id}`)
  }
  for (const payment of overduePayments) {
    if (payment.status === 'settled' || payment.status === 'bankrupt' || payment.no_followup_at) continue
    keys.add(`overdue_payment:${payment.id}`)
  }
  return keys
}

/**
 * Chooses the tasks for a plan.
 *
 * Priority order, one slot per customer, at most two of a kind so a morning of
 * five stale accounts does not crowd out a broken promise. Accounts carried
 * over from yesterday go first regardless of kind: unfinished work is the
 * work most likely to be forgotten.
 */
export function pickPlanTasks(
  tasks: AssistantTask[],
  carryOverEntities: string[] = [],
  size = PLAN_SIZE
): AssistantTask[] {
  const candidates = [...tasks]
    .filter((task) => !NOT_PLANNABLE.includes(task.kind))
    /*
     * A plan item has to name an account, because an account is the only thing
     * its completion can be read off. A nudge with nothing to point at can
     * only ever be judged by whether it is still in today's list, and that is
     * the reading that once ticked a whole day's work off by itself.
     */
    .filter((task) => entityKeyOf(task) !== null)
    .sort((a, b) => a.priority - b.priority)

  const carried = new Set(carryOverEntities)
  const isCarried = (task: AssistantTask) => {
    const key = entityKeyOf(task)
    return key !== null && carried.has(key)
  }
  const ordered = [...candidates.filter(isCarried), ...candidates.filter((t) => !isCarried(t))]

  const picked: AssistantTask[] = []
  const perKind = new Map<AssistantTaskKind, number>()
  const entities = new Set<string>()

  const take = (task: AssistantTask) => {
    picked.push(task)
    perKind.set(task.kind, (perKind.get(task.kind) ?? 0) + 1)
    const key = entityKeyOf(task)
    if (key) entities.add(key)
  }

  for (const task of ordered) {
    if (picked.length >= size) break
    const key = entityKeyOf(task)
    if (key && entities.has(key)) continue
    if ((perKind.get(task.kind) ?? 0) >= MAX_PER_KIND) continue
    take(task)
  }

  // Variety left slots empty: fill them in priority order after all.
  for (const task of ordered) {
    if (picked.length >= size) break
    if (picked.includes(task)) continue
    const key = entityKeyOf(task)
    if (key && entities.has(key)) continue
    take(task)
  }

  return picked
}

export function toPlanItem(task: AssistantTask): PlanItem {
  return {
    taskId: task.id,
    kind: task.kind,
    message: task.message,
    detail: task.detail,
    entityType: task.entityType,
    entityId: task.entityId,
    entityName: task.entityName,
    amount: task.amount,
  }
}

/**
 * Builds today's plan, with yesterday's unfinished work at the top of it.
 *
 * Carried items come forward as themselves, not merely as a hint about which
 * of today's nudges to prefer. That distinction is the whole point: the nudge
 * that raised an item yesterday is often gone this morning — a due date passes,
 * a bucket moves — while the work, ringing that customer, is exactly as undone
 * as it was. Carrying only the priority meant unfinished work vanished on the
 * one morning it most needed to be seen.
 *
 * They keep the day they were first planned, so the robot can say how long
 * something has been waiting rather than presenting week-old work as new.
 *
 * The plan stays PLAN_SIZE. A backlog that grows without bound is a list
 * nobody starts, which is the failure this whole module exists to avoid; the
 * oldest carried work leads, and today's nudges fill what is left.
 */
export function makePlan(
  userId: string,
  date: string,
  tasks: AssistantTask[],
  carried: PlanItem[] = [],
  now: string = new Date().toISOString()
): DailyPlan {
  const brought = carried
    .slice(0, PLAN_SIZE)
    .map((item) => ({ ...item }))

  const taken = new Set(brought.map(entityKeyOf).filter((key): key is string => key !== null))
  const room = Math.max(0, PLAN_SIZE - brought.length)

  const fresh = pickPlanTasks(
    tasks.filter((task) => {
      const key = entityKeyOf(task)
      return key === null || !taken.has(key)
    }),
    [],
    room
  ).map(toPlanItem)

  return {
    userId,
    date,
    items: [...brought, ...fresh],
    skipped: [],
    createdAt: now,
  }
}

/** Still this coordinator's work: not done, not closed, not somebody else's. */
function stillTheirs(item: { status: PlanItemStatus }): boolean {
  return item.status === 'open' || item.status === 'skipped'
}

/**
 * The items of a finished day that are still to be done.
 *
 * Skipped counts as unfinished: "later" meant later, not never. An account
 * handed to another coordinator does not come forward — it is no longer this
 * person's to chase, and carrying it would put someone else's customer at the
 * top of their morning.
 */
export function unfinishedItems(plan: ResolvedPlan): PlanItem[] {
  return plan.items
    .filter(stillTheirs)
    .map(({ status, ...item }) => ({ ...item, carriedFrom: item.carriedFrom ?? plan.date }))
}

function localDay(iso: string): string {
  const date = new Date(iso)
  return isNaN(date.getTime()) ? iso.slice(0, 10) : toLocalISODate(date)
}

/**
 * Reads each item's status off the live records rather than off a tick-box.
 *
 * Done means one thing and one thing only: the coordinator logged a follow-up
 * on that account since the plan was made. A call logged from the account panel
 * completes the item just as one logged through the robot does — and nothing
 * else completes it at all.
 *
 * That is narrower than it was, deliberately. An account can leave a
 * coordinator's book for reasons that are not work: the customer paid, the
 * nightly sync retired the row, somebody set it aside, the desk was handed to
 * another coordinator, or a re-import gave the record a new id. Reading any of
 * those as "done" put ticks against work nobody had filled in. They end the
 * item — as `closed` or `moved` — without crediting anyone.
 *
 * What it deliberately no longer means is "the nudge is not in today's list".
 * Nudges leave that list on their own — "due today" stops being due today at
 * midnight — so reading absence as completion made every such item tick itself
 * off at the end of the day over work nobody had touched, and the plan reported
 * a clean sweep that had not happened.
 *
 * `owed` is the set of accounts still owed and still chased, across the whole
 * book — everybody's, not this coordinator's. That distinction is the second
 * way this went wrong: given only their own accounts, an account handed to
 * another coordinator looked exactly like one that had been collected, so
 * reassigning a desk marked the old owner's plan items done overnight. `mine`
 * says which of those accounts are still theirs, and an account that is still
 * owed but no longer theirs is `moved` — not work anybody did.
 *
 * Without `owed` the only evidence is a logged follow-up, which is the safe
 * way to be wrong.
 */
export function resolvePlan(
  plan: DailyPlan,
  allTasks: AssistantTask[],
  followups: Followup[],
  userId: string = plan.userId,
  owed?: Set<string>,
  mine?: Set<string>
): ResolvedPlan {
  void allTasks
  /*
   * Work logged since the plan was made — not merely dated on or after that
   * day. The distinction matters because several nudges are raised *by* a
   * follow-up: a broken commitment exists precisely because somebody logged a
   * promise. Counting any follow-up on the account would let the record that
   * raised the item mark it done, and the plan would clear itself of the very
   * work it had just asked for.
   *
   * `created_at` is when the call was actually entered; `followup_date` is a
   * day the coordinator chose and can be backdated, so it is only the fallback.
   */
  const worked = new Set(
    followups
      .filter((f) => f.coordinator_id === userId)
      .filter((f) => (f.created_at ?? `${localDay(f.followup_date)}T23:59:59`) >= plan.createdAt)
      .map((f) => `${f.entity_type}:${f.entity_id}`)
  )
  const skipped = new Set(plan.skipped)

  const items: ResolvedPlanItem[] = plan.items.map((item) => {
    const key = entityKeyOf(item)
    const unstarted: PlanItemStatus = skipped.has(item.taskId) ? 'skipped' : 'open'

    /*
     * No account to point at, so there is no evidence either way. This used to
     * fall back to "the nudge is gone, call it done", which is precisely how
     * the plan cleared itself overnight. Only tasks carrying an account are
     * plannable now (pickPlanTasks), so this is a floor, not a path.
     */
    if (key === null) return { ...item, status: unstarted }

    // Somebody rang them. The only thing that means the work was done.
    if (worked.has(key)) return { ...item, status: 'done' }

    /*
     * Gone from the book — collected, settled, set aside, declared bankrupt,
     * retired by the sync, or re-imported under a new id. Something happened
     * to the account; nobody necessarily did anything, so this is closed
     * rather than done. Counting it as done is what put ticks against work
     * that was never filled in.
     */
    if (owed !== undefined && !owed.has(key)) return { ...item, status: 'closed' }

    // Still owed, but not this coordinator's any more.
    if (mine !== undefined && !mine.has(key)) return { ...item, status: 'moved' }

    return { ...item, status: unstarted }
  })

  const done = items.filter((i) => i.status === 'done').length
  const set = items.filter((i) => i.status === 'skipped').length
  const moved = items.filter((i) => i.status === 'moved').length
  const closed = items.filter((i) => i.status === 'closed').length
  const stillOpen = items.length - done - set - moved - closed
  return {
    userId: plan.userId,
    date: plan.date,
    items,
    // An account somebody else now owns is not waiting on this person.
    carriedOver: items.filter((i) => i.carriedFrom && stillTheirs(i)).length,
    oldestCarried:
      items
        .filter((i) => i.carriedFrom && stillTheirs(i))
        .map((i) => i.carriedFrom!)
        .sort()[0] ?? null,
    done,
    skipped: set,
    open: stillOpen,
    moved,
    closed,
    total: items.length,
    complete: items.length > 0 && stillOpen === 0,
  }
}

/**
 * How long a carried item has been waiting, in plain words.
 *
 * "Since Monday" is worth more than a date on something that should have been
 * done on Monday.
 */
export function waitingFor(item: Pick<PlanItem, 'carriedFrom'>, today: string): string | null {
  if (!item.carriedFrom || item.carriedFrom >= today) return null
  const days = Math.round(
    (new Date(`${today}T00:00:00`).getTime() - new Date(`${item.carriedFrom}T00:00:00`).getTime()) /
      86_400_000
  )
  if (days <= 0) return null
  if (days === 1) return 'carried from yesterday'
  return `waiting ${days} days`
}

/**
 * What the robot leads with when work has come forward.
 *
 * Said before the count of new work, because a backlog nobody mentions is a
 * backlog that grows.
 */
export function carriedOverLine(
  plan: Pick<ResolvedPlan, 'carriedOver' | 'oldestCarried' | 'date'>
): string | null {
  if (plan.carriedOver === 0) return null
  const since = waitingFor({ carriedFrom: plan.oldestCarried ?? undefined }, plan.date)
  return `${plan.carriedOver} still open from before${since ? ` — the oldest ${since}` : ''}`
}

/** "2 of 4 done", for headers and table cells. */
export function planProgressLine(plan: Pick<ResolvedPlan, 'done' | 'total'>): string {
  return plan.total === 0 ? 'nothing planned' : `${plan.done} of ${plan.total} done`
}
