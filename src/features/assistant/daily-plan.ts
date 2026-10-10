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
import { formatCurrency, formatDate, toLocalISODate } from '../../lib/utils'
import { accountKeyOf } from '../../lib/account-key'
import { TASK_PRIORITY, type AssistantTask, type AssistantTaskKind } from './types'

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
  /**
   * When this work was first handed out. A carried item keeps the moment it
   * was first planned, so a call made first thing the next morning - before
   * that day's plan exists - still completes it.
   */
  plannedAt?: string
  /**
   * 0 (or absent): the morning's Active Payments tasks. 1, 2, ...: rounds of
   * overdue accounts handed out as each batch is finished. A round is extra
   * work - never carried to tomorrow, never counted as a miss.
   */
  round?: number
  /** The follow-up the task was raised from (a promise, a reminder), if any. */
  followupId?: string
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
  /**
   * How each item ended, fixed when the next day's plan was made. Kept because
   * "closed" and "moved" are read off the book as it stands, and a week later
   * the book no longer says what it said that evening.
   */
  outcome?: Record<string, PlanItemStatus>
  closedAt?: string
  /** The two tasks Robi will ask a proof screenshot for, picked when the plan is made. */
  proofTaskIds?: string[]
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
  /** The latest overdue round handed out today; 0 while on the morning's tasks. */
  round: number
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

/** An overdue round handed out after the morning's tasks, not the morning plan itself. */
export function isExtraItem(item: { round?: number }): boolean {
  return (item.round ?? 0) > 0
}

export function entityKeyOf(task: { entityType?: string; entityId?: string }): string | null {
  return task.entityType && task.entityId ? `${task.entityType}:${task.entityId}` : null
}

/** Which customer a record belongs to, by entity key; null when the record is gone. */
export type CustomerOf = (entityKey: string) => string | null

/**
 * The customer behind every record, by BP code.
 *
 * A customer is several records: one per open invoice in Active Payments, and
 * a row in the ageing report. Robi's task names one of them; the coordinator
 * rings the customer and logs the call on whichever record they had open.
 * Matching the record exactly meant a call logged on the overdue balance left
 * the task on the invoice open all day, so work is matched by customer.
 */
export function customerLookup(
  companies: { id: string; sap_bp_code: string | null; name: string }[],
  overduePayments: { id: string; bp_code: string; customer_name: string | null }[]
): CustomerOf {
  const keys = new Map<string, string>()
  for (const c of companies) keys.set(`company:${c.id}`, accountKeyOf(c.sap_bp_code, c.name))
  for (const p of overduePayments) keys.set(`overdue_payment:${p.id}`, accountKeyOf(p.bp_code, p.customer_name))
  return (key) => keys.get(key) ?? null
}

/**
 * Customers Robi leaves alone until a date the coordinator set.
 *
 * When the latest follow-up on a customer says when to follow up next (a
 * reminder date) or when they will pay (a promise date), and that day has not
 * come, they are not Robi's to raise yet: they come back on that day.
 */
export function waitingCustomers(
  followups: Pick<Followup, 'entity_type' | 'entity_id' | 'followup_date' | 'created_at' | 'next_reminder_date' | 'committed_date'>[],
  today: string,
  customerOf?: CustomerOf
): Set<string> {
  const latest = new Map<string, (typeof followups)[number]>()
  for (const f of followups) {
    const entityKey = `${f.entity_type}:${f.entity_id}`
    const key = customerOf?.(entityKey) ?? entityKey
    const held = latest.get(key)
    if (!held || f.followup_date > held.followup_date || (f.followup_date === held.followup_date && f.created_at > held.created_at)) {
      latest.set(key, f)
    }
  }
  const waiting = new Set<string>()
  for (const [key, f] of latest) {
    const next = [f.next_reminder_date, f.committed_date].filter(Boolean).map((d) => String(d).slice(0, 10))
    if (next.some((d) => d > today)) waiting.add(key)
  }
  return waiting
}

/**
 * The smallest amount worth a slot in the day's plan. A plan is four calls;
 * spending one on ₹20 of a customer's ledger is a call not made on a lakh.
 */
export const PLAN_MIN_AMOUNT = 1000

/** What a record is owed, by entity key; null when the record is gone. */
export type BalanceOf = (entityKey: string) => number | null

export function balanceLookup(
  companies: { id: string; total_amount: number | null }[],
  overduePayments: { id: string; balance_due: number | null }[]
): BalanceOf {
  const amounts = new Map<string, number>()
  for (const c of companies) amounts.set(`company:${c.id}`, c.total_amount ?? 0)
  for (const p of overduePayments) amounts.set(`overdue_payment:${p.id}`, p.balance_due ?? 0)
  return (key) => amounts.get(key) ?? null
}

/** When a record fell (or falls) due, by entity key; null when unknown. */
export type DueDateOf = (entityKey: string) => string | null

export function dueDateLookup(companies: { id: string; due_date: string | null }[]): DueDateOf {
  const dates = new Map<string, string>()
  for (const c of companies) if (c.due_date) dates.set(`company:${c.id}`, c.due_date)
  return (key) => dates.get(key) ?? null
}

/**
 * The order Robi hands work out in: the oldest money first - the earliest due
 * date - and, between invoices as old as each other, the biggest amount due.
 * The kind of nudge only breaks a tie. It used to lead: promises first, then
 * ageing, then untouched accounts, at most two of a kind, which put a ₹1,298
 * reminder ahead of a ₹3 lakh invoice months older.
 */
export function oldestBiggestFirst(dueDateOf?: DueDateOf, balanceOf?: BalanceOf) {
  const due = (t: { entityType?: string; entityId?: string }) => {
    const key = entityKeyOf(t)
    return (key && dueDateOf ? dueDateOf(key) : null) ?? '9999-12-31'
  }
  const owed = (t: { entityType?: string; entityId?: string; amount?: number | null }) => {
    const key = entityKeyOf(t)
    return (key && balanceOf ? balanceOf(key) : null) ?? t.amount ?? 0
  }
  return (
    a: { entityType?: string; entityId?: string; amount?: number | null; kind: AssistantTaskKind },
    b: { entityType?: string; entityId?: string; amount?: number | null; kind: AssistantTaskKind }
  ) => due(a).localeCompare(due(b)) || owed(b) - owed(a) || TASK_PRIORITY[a.kind] - TASK_PRIORITY[b.kind]
}

/**
 * Whether a task is big enough to plan: the amount it is about - the invoice,
 * the money past 90 days, the promised payment - or, when it names none, what
 * the account owes. With no way to tell, it is let through rather than lost.
 */
export function bigEnoughToPlan(
  task: { amount?: number | null; entityType?: string; entityId?: string },
  balanceOf?: BalanceOf
): boolean {
  const key = entityKeyOf(task)
  const amount = task.amount ?? (key && balanceOf ? balanceOf(key) : null)
  if (amount === null || amount === undefined) return !balanceOf
  return amount >= PLAN_MIN_AMOUNT
}

/** The key work is matched on: the customer when known, else the record itself. */
function workKey(entityKey: string, customerOf?: CustomerOf): string {
  return customerOf?.(entityKey) ?? entityKey
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
  companies: {
    id: string
    status: string
    total_amount?: number | null
    no_followup_at?: string | null
    bankrupt_declared_at?: string | null
  }[],
  overduePayments: { id: string; status: string; balance_due?: number | null; no_followup_at?: string | null }[]
): Set<string> {
  const keys = new Set<string>()
  for (const company of companies) {
    // An invoice carries the bankruptcy stamp itself; there may be no ageing row.
    if (company.status === 'paid' || company.no_followup_at || company.bankrupt_declared_at) continue
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
  size = PLAN_SIZE,
  /**
   * One slot per customer, not per record: a customer with four open invoices
   * is one phone call, and four slots on them left no room for anyone else.
   */
  customerOf?: CustomerOf,
  /** What each record owes, for tasks that name no amount of their own. */
  balanceOf?: BalanceOf,
  /**
   * When each record fell due. Given, the oldest and biggest money goes first
   * (see oldestBiggestFirst) with no limit per kind; without it, the older
   * order by kind of nudge.
   */
  dueDateOf?: DueDateOf
): AssistantTask[] {
  const candidates = [...tasks]
    .filter((task) => !NOT_PLANNABLE.includes(task.kind))
    // Below PLAN_MIN_AMOUNT the work stays in the nudge list, not the plan.
    .filter((task) => bigEnoughToPlan(task, balanceOf))
    /*
     * A plan item has to name an account, because an account is the only thing
     * its completion can be read off. A nudge with nothing to point at can
     * only ever be judged by whether it is still in today's list, and that is
     * the reading that once ticked a whole day's work off by itself.
     */
    .filter((task) => entityKeyOf(task) !== null)
    .sort(dueDateOf ? oldestBiggestFirst(dueDateOf, balanceOf) : (a, b) => a.priority - b.priority)
  const kindLimit = dueDateOf ? Infinity : MAX_PER_KIND

  const carried = new Set(carryOverEntities)
  const isCarried = (task: AssistantTask) => {
    const key = entityKeyOf(task)
    return key !== null && carried.has(key)
  }
  const ordered = [...candidates.filter(isCarried), ...candidates.filter((t) => !isCarried(t))]

  const picked: AssistantTask[] = []
  const perKind = new Map<AssistantTaskKind, number>()
  const customers = new Set<string>()
  const customerKey = (task: AssistantTask) => {
    const key = entityKeyOf(task)
    return key ? workKey(key, customerOf) : null
  }

  const take = (task: AssistantTask) => {
    picked.push(task)
    perKind.set(task.kind, (perKind.get(task.kind) ?? 0) + 1)
    const key = customerKey(task)
    if (key) customers.add(key)
  }

  for (const task of ordered) {
    if (picked.length >= size) break
    const key = customerKey(task)
    if (key && customers.has(key)) continue
    if ((perKind.get(task.kind) ?? 0) >= kindLimit) continue
    take(task)
  }

  // Variety left slots empty: fill them in priority order after all.
  for (const task of ordered) {
    if (picked.length >= size) break
    if (picked.includes(task)) continue
    const key = customerKey(task)
    if (key && customers.has(key)) continue
    take(task)
  }

  return picked
}

export function toPlanItem(task: AssistantTask, plannedAt?: string): PlanItem {
  return {
    taskId: task.id,
    ...(plannedAt ? { plannedAt } : {}),
    ...(task.followupId ? { followupId: task.followupId } : {}),
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
  now: string = new Date().toISOString(),
  customerOf?: CustomerOf,
  balanceOf?: BalanceOf,
  /** Given, the plan is the oldest and biggest money first (oldestBiggestFirst). */
  dueDateOf?: DueDateOf
): DailyPlan {
  const rank = oldestBiggestFirst(dueDateOf, balanceOf)
  const customerKey = (item: { entityType?: string; entityId?: string }) => {
    const key = entityKeyOf(item)
    return key ? workKey(key, customerOf) : null
  }

  /*
   * A carried item says what is true today, not what was true the day it was
   * first given. Its words were written for that day - "owes ₹1,10,177 in 3
   * days", "promised payment today" - and a week later they are simply wrong.
   * So it takes today's task for the same customer where there is one, and
   * otherwise a plain line with what they owe now. It keeps the day it was
   * first given, so the waiting time still shows.
   */
  const restated = (item: PlanItem, key: string | null): PlanItem => {
    const kept = { carriedFrom: item.carriedFrom, ...(item.plannedAt ? { plannedAt: item.plannedAt } : {}) }
    const current = key
      ? tasks
          .filter(
            (task) =>
              task.entityType === 'company' &&
              customerKey(task) === key &&
              !NOT_PLANNABLE.includes(task.kind) &&
              bigEnoughToPlan(task, balanceOf)
          )
          // The customer's oldest, biggest invoice speaks for them.
          .sort(dueDateOf ? rank : (a, b) => a.priority - b.priority)[0]
      : undefined
    if (current) return { ...toPlanItem(current), ...kept }
    const entityKey = entityKeyOf(item)
    const owed = (entityKey && balanceOf ? balanceOf(entityKey) : null) ?? item.amount ?? null
    return {
      ...item,
      ...kept,
      message: `Carried from ${item.carriedFrom ? formatDate(item.carriedFrom) : 'an earlier day'}: follow up ${
        item.entityName ?? 'this account'
      }${owed ? ` — ${formatCurrency(owed)} outstanding` : ''}.`,
      detail: undefined,
      amount: owed,
    }
  }

  // One slot per customer among the carried work too.
  const taken = new Set<string>()
  const brought: PlanItem[] = []
  for (const item of carried) {
    // The morning plan is Active Payments work; overdue accounts come in the
    // rounds that follow it.
    if (item.entityType !== 'company' || isExtraItem(item)) continue
    // The same floor as new work: small change does not come forward either.
    if (!bigEnoughToPlan(item, balanceOf)) continue
    const key = customerKey(item)
    if (key && taken.has(key)) continue
    if (key) taken.add(key)
    brought.push(restated(item, key))
  }

  const freshFor = (room: number) =>
    pickPlanTasks(
      tasks.filter((task) => {
        // Active Payments first; the overdue rounds come once these are done.
        if (task.entityType !== 'company') return false
        const key = customerKey(task)
        return key === null || !taken.has(key)
      }),
      [],
      room,
      customerOf,
      balanceOf,
      dueDateOf
    ).map((task) => toPlanItem(task, now))

  /*
   * With due dates known, unfinished work and new work are ranked together,
   * oldest and biggest first. Work carried from yesterday was chosen by the
   * same rule and has only grown older, so it keeps its place - unless
   * something older or larger has turned up since.
   */
  // Leftovers from earlier days on top, then a full day of fresh work.
  const items = [...(dueDateOf ? [...brought].sort(rank) : brought), ...freshFor(PLAN_SIZE)]

  return {
    userId,
    date,
    items,
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
    // An overdue round was extra work on top of the day; it is not a debt.
    .filter((item) => !isExtraItem(item))
    .map(({ status, ...item }) => ({ ...item, carriedFrom: item.carriedFrom ?? plan.date }))
}

function localDay(iso: string): string {
  const date = new Date(iso)
  return isNaN(date.getTime()) ? iso.slice(0, 10) : toLocalISODate(date)
}

/**
 * When a follow-up was actually entered. `created_at` is the moment it was
 * typed in; `followup_date` is a day the coordinator chose and can be
 * backdated, so it is only the fallback.
 */
export function enteredAt(followup: Followup): string {
  return followup.created_at ?? `${localDay(followup.followup_date)}T23:59:59`
}

/** One coordinator's follow-ups by account, oldest first. */
export type WorkLog = Map<string, Followup[]>

export function workLog(followups: Followup[], userId: string, customerOf?: CustomerOf): WorkLog {
  const log: WorkLog = new Map()
  for (const followup of followups) {
    if (followup.coordinator_id !== userId) continue
    const key = workKey(`${followup.entity_type}:${followup.entity_id}`, customerOf)
    const list = log.get(key)
    if (list) list.push(followup)
    else log.set(key, [followup])
  }
  for (const list of log.values()) list.sort((a, b) => enteredAt(a).localeCompare(enteredAt(b)))
  return log
}

/**
 * The first follow-up on the account inside the window, if any. Pass the same
 * `customerOf` the log was built with, so a call on any of the customer's
 * records counts. `except` is the follow-up that raised the task - a promise
 * logged this morning is why the task exists, not the work that finishes it.
 */
export function completingFollowup(
  log: WorkLog,
  key: string,
  from: string,
  until?: string,
  customerOf?: CustomerOf,
  except?: string | null
): Followup | null {
  for (const followup of log.get(workKey(key, customerOf)) ?? []) {
    if (except && followup.id === except) continue
    const at = enteredAt(followup)
    if (at < from) continue
    if (until !== undefined && at >= until) return null
    return followup
  }
  return null
}

/** Midnight at the start of `date`, local time, as an ISO instant. */
export function startOfDay(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString()
}

/**
 * The follow-up a task was raised from, when there is one: the promise behind
 * "promised payment today", the reminder behind "you scheduled a follow-up".
 * Read from the task id for plans stored before the field existed.
 */
export function raisedByFollowup(item: { taskId: string; followupId?: string }): string | null {
  if (item.followupId) return item.followupId
  const match = /^(?:commit-today|commit-broken|proof|reminder):(.+)$/.exec(item.taskId)
  return match ? match[1] : null
}

/**
 * When work on a day's plan starts to count: the start of that day.
 *
 * Not the moment the plan was saved. A plan is made when the first screen of
 * the day opens it - 11:15 one morning - and a coordinator who rang the
 * customer at 9:30 had done the job; measuring from 11:15 left it open all
 * day. A carried item is the same: it is today's work from the start of today.
 */
export function workCountsFrom(plan: { date: string }): string {
  return startOfDay(plan.date)
}

/** Midnight at the start of the day after `date`, local time, as an ISO instant. */
export function endOfDay(date: string): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + 1)
  return next.toISOString()
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
  mine?: Set<string>,
  /**
   * Work logged after this moment does not count. Set when a finished day is
   * judged, so a call made on Thursday is not credited to Wednesday's plan.
   */
  until?: string,
  /** Matches work by customer, so a call on any of their records counts. */
  customerOf?: CustomerOf
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
  const worked = workLog(followups, userId, customerOf)
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
    // Overdue rounds are handed out during the day: they count from then.
    const from = isExtraItem(item) && item.plannedAt ? item.plannedAt : workCountsFrom(plan)
    if (completingFollowup(worked, key, from, until, customerOf, raisedByFollowup(item))) {
      return { ...item, status: 'done' }
    }

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
    round: items.reduce((max, i) => Math.max(max, i.round ?? 0), 0),
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
