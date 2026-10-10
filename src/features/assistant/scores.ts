/**
 * Daily scores: how much of Robi's plan each coordinator finished.
 *
 * A day's score is tasks done ÷ tasks on that day's list - the 8 fresh ones
 * plus any leftovers, so work left undone counts against every day it stays
 * open - written as the gap from 100%: 6 of 8 is -25%, everything done is 0%.
 * Extra overdue rounds, and accounts paid or handed over before anyone acted,
 * are left out (the same rule as Robi task history). The week is Monday to
 * Saturday; a day with no plan is left out of the average.
 */

import { addDaysISO } from '@/lib/utils'
import { summariseHistory, type HistoryRow } from './plan-history'

export interface DayScore {
  done: number
  given: number
  /** completion - 100: 0 is a perfect day, -100 is nothing done. */
  score: number
}

/** The Monday on or before the date (local calendar). */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00`).getDay() // 0 Sunday … 6 Saturday
  return addDaysISO(date, day === 0 ? -6 : 1 - day)
}

/** Monday to Saturday of the week starting on `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 6 }, (_, i) => addDaysISO(monday, i))
}

/** Each coordinator's score for each day they had a plan, by `${coordinatorId}|${date}`. */
export function dailyScores(rows: HistoryRow[]): Map<string, DayScore> {
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
    scores.set(key, { done: s.done, given, score: s.completion - 100 })
  }
  return scores
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
