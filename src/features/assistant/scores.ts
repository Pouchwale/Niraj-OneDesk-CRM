/**
 * Daily scores: how much of Robi's plan each coordinator finished.
 *
 * A day's score is tasks done ÷ tasks on that day's list - the 8 fresh ones
 * plus any leftovers, so work left undone counts against every day it stays
 * open - written as the gap from 100%: 6 of 8 is -25%, everything done is 0%.
 * Extra overdue rounds, and accounts paid or handed over before anyone acted,
 * are left out (the same rule as Robi task history). The week is the
 * company's, Saturday to Friday with Sunday off (since 7 Nov 2026; Monday to
 * Saturday before); a day with no plan is left out of the average.
 *
 * Extra work (since 13 Oct 2026): a follow-up on a customer who was not on
 * that day's list, counted once per customer per day. Each extra customer
 * makes up for one missed task, so it can lift a day to 0% but never above:
 * other work can cover a shortfall, never beat doing the list.
 */

import type { Company, Followup, OverduePayment } from '../../lib/types'
import { addDaysISO } from '../../lib/utils'
import type { AttendanceStatus } from './attendance'
import { customerLookup, entityKeyOf, openAccountKeys, type CustomerOf, type DailyPlan } from './daily-plan'
import { planHistory, summariseHistory, type HistoryRow } from './plan-history'

export interface DayScore {
  done: number
  given: number
  /** completion - 100, extra work included up to the tasks missed: 0 is a full day, -100 is nothing done. */
  score: number
  /** Customers followed up that day who were not on Robi's list. */
  extra: number
  /** Of those, how many made up for missed tasks (never more than were missed). */
  credited: number
}

/**
 * Each coordinator's extra work by `${coordinatorId}|${date}`: one follow-up
 * per customer they contacted that day who was not on that day's list.
 */
export function extraWork(plans: DailyPlan[], followups: Followup[], customerOf?: CustomerOf): Map<string, Followup[]> {
  const customer = (key: string) => customerOf?.(key) ?? key
  const planned = new Map<string, Set<string>>()
  for (const plan of plans) {
    planned.set(
      `${plan.userId}|${plan.date}`,
      new Set(plan.items.map(entityKeyOf).filter((k): k is string => k !== null).map(customer))
    )
  }
  const extra = new Map<string, Followup[]>()
  const seen = new Set<string>()
  for (const f of [...followups].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const day = String(f.followup_date || f.created_at).slice(0, 10)
    const key = `${f.coordinator_id}|${day}`
    const who = customer(`${f.entity_type}:${f.entity_id}`)
    if (planned.get(key)?.has(who) || seen.has(`${key}|${who}`)) continue
    seen.add(`${key}|${who}`)
    const list = extra.get(key)
    if (list) list.push(f)
    else extra.set(key, [f])
  }
  return extra
}

/**
 * The Saturday on or before the date (local calendar): the company's week runs
 * Saturday to Friday (the user's rule, 7 Nov 2026; Monday to Saturday before).
 */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00`).getDay() // 0 Sunday … 6 Saturday
  return addDaysISO(date, -((day + 1) % 7)) // Saturday 0 days back, Sunday 1, … Friday 6
}

/** The working days of the week starting on Saturday `start`: Saturday, then Monday to Friday (Sunday is off). */
export function weekDays(start: string): string[] {
  return [0, 2, 3, 4, 5, 6].map((i) => addDaysISO(start, i))
}

/** Each coordinator's score for each day they had a plan, by `${coordinatorId}|${date}`. */
export function dailyScores(rows: HistoryRow[], extra?: Map<string, Followup[]>): Map<string, DayScore> {
  const groups = new Map<string, HistoryRow[]>()
  for (const row of rows) {
    const key = `${row.coordinatorId}|${row.date}`
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  const scores = new Map<string, DayScore>()
  for (const [key, list] of groups) {
    const [s] = summariseHistory(list)
    const given = s.done + s.notDone + s.later + s.open
    if (given === 0 || s.completion === null) continue
    const more = extra?.get(key)?.length ?? 0
    const credited = Math.min(more, given - s.done)
    const score = credited ? Math.round(((s.done + credited) / given) * 100) - 100 : s.completion - 100
    scores.set(key, { done: s.done, given, score, extra: more, credited })
  }
  return scores
}

export interface TeamScoreInput {
  companies: readonly Company[]
  overduePayments: readonly OverduePayment[]
  dailyPlans: readonly DailyPlan[]
  followups: readonly Followup[]
  coordinatorIds: readonly string[]
  today: string
  /** Leave and Robi days off are left out of the scores. */
  attendanceOf?: (userId: string, date: string) => AttendanceStatus | null
}

/**
 * Every coordinator's day scores and extra work, from the shared records: the
 * one calculation behind Overview → Scores and the saved score history.
 */
export function teamDayScores(input: TeamScoreInput): { scores: Map<string, DayScore>; extra: Map<string, Followup[]> } {
  const companies = [...input.companies]
  const overdue = [...input.overduePayments]
  const owed = openAccountKeys(companies, overdue)
  const mine = new Map(
    input.coordinatorIds.map((id) => [
      id,
      openAccountKeys(
        companies.filter((c) => c.assigned_coordinator_id === id),
        overdue.filter((p) => p.assigned_coordinator_id === id)
      ),
    ])
  )
  const plans = input.dailyPlans.filter((p) => mine.has(p.userId))
  const followups = [...input.followups]
  const customerOf = customerLookup(companies, overdue)
  const rows = planHistory(plans, followups, input.today, owed, mine, customerOf, input.attendanceOf)
  const extra = extraWork(plans, followups.filter((f) => mine.has(f.coordinator_id)), customerOf)
  return { scores: dailyScores(rows, extra), extra }
}

/** The average of the days that have a score, or null when none do. */
export function weekAverage(scores: (DayScore | undefined)[]): number | null {
  const present = scores.filter((s): s is DayScore => !!s)
  if (present.length === 0) return null
  const mean = present.reduce((sum, s) => sum + s.score, 0) / present.length
  // Halves away from zero (-12.5 → -13), the way it is rounded by hand; Math.round gives -12.
  return Math.sign(mean) * Math.round(Math.abs(mean)) || 0
}

/** "-20%", "0%". */
export function scoreLabel(score: number | null | undefined): string {
  return score === null || score === undefined ? '—' : `${score}%`
}

/** Colour by how far from a full day: 0 green, down to -20 amber, below that red. */
export function scoreTone(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-muted-foreground'
  if (score === 0) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= -20) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}
