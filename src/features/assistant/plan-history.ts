/**
 * The record of Robi's daily plans: what each coordinator was asked to do,
 * what they did, and what slipped.
 *
 * Read by the team leader and the administrator. Every line is worked out
 * from two things that do not change after the fact - the plan as it was
 * handed out, and the follow-ups as they were logged - plus, for a finished
 * day, how the plan was judged the moment the next day began.
 */

import type { Followup } from '@/lib/types'
import {
  completingFollowup,
  endOfDay,
  entityKeyOf,
  isExtraItem,
  raisedByFollowup,
  workCountsFrom,
  workLog,
  type CustomerOf,
  type DailyPlan,
  type PlanItem,
  type PlanItemStatus,
  type WorkLog,
} from './daily-plan'

/**
 *   done        a follow-up was logged on the account that day
 *   not_done    the day ended with nothing logged (it came back the next day)
 *   later       set aside with "Later" and not done that day
 *   closed      the account left the book by itself: paid, settled, set aside
 *   moved       handed to another coordinator before it was done
 *   open        today, and not done yet
 *   not_reached an overdue round (extra work) the day ended before - not a miss
 */
export type HistoryResult = 'done' | 'not_done' | 'later' | 'closed' | 'moved' | 'open' | 'not_reached'

export interface HistoryRow {
  date: string
  coordinatorId: string
  item: PlanItem
  result: HistoryResult
  /** The follow-up that did it, when it was done. */
  followup: Followup | null
  /** For work not done that day: the next day it was on this person's plan. */
  carriedTo: string | null
  /** For work not done that day: when it was finally done, if it has been. */
  doneLater: Followup | null
}

export interface CoordinatorSummary {
  coordinatorId: string
  /** Days a plan was handed out with work in it. */
  days: number
  tasks: number
  done: number
  notDone: number
  later: number
  /** Closed or moved: ended without anybody needing to act. */
  noLongerNeeded: number
  open: number
  /** Done out of the work that was theirs to do and whose day is over. */
  completion: number | null
  /** Overdue accounts handed out after the morning's tasks, and how many were done. */
  extraGiven: number
  extraDone: number
}

function resultFor(status: PlanItemStatus, isToday: boolean): HistoryResult {
  switch (status) {
    case 'done':
      return 'done'
    case 'closed':
      return 'closed'
    case 'moved':
      return 'moved'
    case 'skipped':
      return isToday ? 'open' : 'later'
    default:
      return isToday ? 'open' : 'not_done'
  }
}

/**
 * One row per planned item, newest day first.
 *
 * `owed` and `mine` are the book as it stands now. They settle "closed" and
 * "moved" for today, and for an older day that was never closed - a day
 * nobody opened the CRM after. A closed day uses what was written down then.
 */
export function planHistory(
  plans: DailyPlan[],
  followups: Followup[],
  today: string,
  owed?: Set<string>,
  mine?: Map<string, Set<string>>,
  /** Matches work by customer: a call on any of their records counts. */
  customerOf?: CustomerOf
): HistoryRow[] {
  const logs = new Map<string, WorkLog>()
  const logFor = (userId: string) => {
    let log = logs.get(userId)
    if (!log) {
      log = workLog(followups, userId, customerOf)
      logs.set(userId, log)
    }
    return log
  }

  /** Each person's plans, oldest first, to find where unfinished work went next. */
  const byPerson = new Map<string, DailyPlan[]>()
  for (const plan of plans) {
    const list = byPerson.get(plan.userId)
    if (list) list.push(plan)
    else byPerson.set(plan.userId, [plan])
  }
  for (const list of byPerson.values()) list.sort((a, b) => a.date.localeCompare(b.date))

  const sameCustomer = (a: string | null, b: string) =>
    a !== null && (a === b || (customerOf !== undefined && customerOf(a) !== null && customerOf(a) === customerOf(b)))

  const rows: HistoryRow[] = []
  for (const plan of plans) {
    const log = logFor(plan.userId)
    const isToday = plan.date >= today
    const until = isToday ? undefined : endOfDay(plan.date)
    const skipped = new Set(plan.skipped)
    const later = (byPerson.get(plan.userId) ?? []).filter((p) => p.date > plan.date)

    for (const item of plan.items) {
      const key = entityKeyOf(item)
      // The same rule Robi uses: any call that day, bar the one that raised the task.
      const from = isExtraItem(item) && item.plannedAt ? item.plannedAt : workCountsFrom(plan)
      const followup = key ? completingFollowup(log, key, from, until, customerOf, raisedByFollowup(item)) : null

      let status: PlanItemStatus
      if (followup) status = 'done'
      // How the day was judged when it ended.
      else if (!isToday && plan.outcome?.[item.taskId]) status = plan.outcome[item.taskId]
      else if (key && owed && !owed.has(key)) status = 'closed'
      else if (key && mine && !mine.get(plan.userId)?.has(key)) status = 'moved'
      else status = skipped.has(item.taskId) ? 'skipped' : 'open'

      let result = resultFor(status, isToday)
      // Extra work the day ran out on is not something anybody failed to do.
      if (isExtraItem(item) && (result === 'not_done' || result === 'later')) result = 'not_reached'
      const unfinished = result === 'not_done' || result === 'later'
      rows.push({
        date: plan.date,
        coordinatorId: plan.userId,
        item,
        result,
        followup,
        carriedTo: unfinished && key ? later.find((p) => p.items.some((i) => sameCustomer(entityKeyOf(i), key)))?.date ?? null : null,
        doneLater: unfinished && key && until ? completingFollowup(log, key, until, undefined, customerOf, raisedByFollowup(item)) : null,
      })
    }
  }

  return rows.sort(
    (a, b) => b.date.localeCompare(a.date) || a.coordinatorId.localeCompare(b.coordinatorId)
  )
}

/** Totals per coordinator over the rows given. */
export function summariseHistory(rows: HistoryRow[]): CoordinatorSummary[] {
  const byPerson = new Map<string, CoordinatorSummary & { dates: Set<string> }>()
  for (const row of rows) {
    let s = byPerson.get(row.coordinatorId)
    if (!s) {
      s = {
        coordinatorId: row.coordinatorId,
        days: 0,
        tasks: 0,
        done: 0,
        notDone: 0,
        later: 0,
        noLongerNeeded: 0,
        open: 0,
        completion: null,
        extraGiven: 0,
        extraDone: 0,
        dates: new Set(),
      }
      byPerson.set(row.coordinatorId, s)
    }
    s.dates.add(row.date)
    // The overdue rounds are counted apart: extra work, not the day's plan.
    if (isExtraItem(row.item)) {
      s.extraGiven++
      if (row.result === 'done') s.extraDone++
      continue
    }
    s.tasks++
    if (row.result === 'done') s.done++
    else if (row.result === 'not_done') s.notDone++
    else if (row.result === 'later') s.later++
    else if (row.result === 'open') s.open++
    else s.noLongerNeeded++
  }
  return [...byPerson.values()].map(({ dates, ...s }) => {
    /*
     * Done out of everything they were given - today's open tasks included, so
     * 1 done of 4 reads 25%, not the 100% it showed when only finished work was
     * counted. The one thing left out is an account that closed or changed
     * hands before anyone acted: it was never theirs to finish.
     */
    const given = s.done + s.notDone + s.later + s.open
    return { ...s, days: dates.size, completion: given > 0 ? Math.round((s.done / given) * 100) : null }
  })
}

export const RESULT_LABEL: Record<HistoryResult, string> = {
  done: 'Done',
  not_done: 'Not done',
  later: 'Set aside (Later)',
  closed: 'Closed (paid / settled)',
  moved: 'Moved to another coordinator',
  open: 'Open today',
  not_reached: 'Extra — not reached',
}
