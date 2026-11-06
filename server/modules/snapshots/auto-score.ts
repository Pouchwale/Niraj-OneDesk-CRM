/**
 * Weekly KPI: the weekly score by itself (since 6 Nov 2026, the user's request).
 *
 * The score compares Saturday with Saturday (the user's rule): every Monday
 * from 10:00 the server scores last Saturday's saved day against the day saved
 * the Saturday before, exactly as the "Generate score" button does, for
 * regular accounts and for the accounts in dispute, and keeps both in Past
 * results "by Automatic (Monday)". Saturday's day is saved by auto-save.ts.
 * Done on Monday so the score is in before the Final score page locks the week.
 *
 * Nothing is made for a book that already has a score for last Saturday's day
 * (made by hand or by this), when either Saturday has no saved day, or, for
 * disputes, while no dispute percentage is set. Mondays only: a Monday the
 * server missed is left to the button.
 */

import type { KpiBook, OverdueSnapshot, OverdueSnapshotMeta, SnapshotTableRow } from '../../../shared/snapshots'
import { scoreTwoDays, transformOverdueDay } from '../../../src/features/snapshots/transform'
import type { OverduePayment } from '../../../src/lib/types'
import type { Logger } from '../../logger'
import type { SnapshotStore } from './store'

export const AUTO_SCORE = { weekday: 1, from: 10, by: 'system', byName: 'Automatic (Monday)' } as const

const BOOKS: KpiBook[] = ['regular', 'dispute']

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const timeOf = (d: OverdueSnapshotMeta) => new Date(d.savedAt).getTime()

/** The last Saturday on or before `now`, and the Saturday a week before it (local dates). */
export function lastTwoSaturdays(now: Date): { saturday: string; before: string } {
  const back = (now.getDay() + 1) % 7 // Saturday 0, Sunday 1, Monday 2 ...
  const day = (n: number) => localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
  return { saturday: day(back), before: day(back + 7) }
}

/**
 * The two days a Monday scores: the newest day saved last Saturday, and the day
 * saved the Saturday before (the one nearest a week earlier, if there are
 * several). Null while either Saturday has no saved day.
 */
export function saturdayPair(now: Date, days: OverdueSnapshotMeta[]): { oldDay: OverdueSnapshotMeta; newDay: OverdueSnapshotMeta } | null {
  const { saturday, before } = lastTwoSaturdays(now)
  const savedOn = (date: string) => days.filter((d) => localDate(new Date(d.savedAt)) === date)
  const newDay = savedOn(saturday).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0]
  if (!newDay) return null
  const aim = new Date(newDay.savedAt)
  aim.setDate(aim.getDate() - 7)
  const oldDay = savedOn(before).sort((a, b) => Math.abs(timeOf(a) - aim.getTime()) - Math.abs(timeOf(b) - aim.getTime()) || b.savedAt.localeCompare(a.savedAt))[0]
  return oldDay ? { oldDay, newDay } : null
}

export type AutoScoreOutcome = 'generated' | 'already' | 'no-new-day' | 'no-old-day' | 'no-dispute-percentage'

export interface AutoScoreDeps {
  snapshots: SnapshotStore
  /** Coordinator id → name, from the accounts (for the dispute tables, worked out from the rows). */
  nameOf: (coordinatorId: string) => string
  logger: Logger
  now?: () => Date
}

/**
 * One check: on Monday from 10:00, scores last Saturday's day against the
 * Saturday before for each book that has no score for it yet. `told` keeps a
 * skip from being logged at every check.
 */
export function runAutoScore(deps: AutoScoreDeps, told: Set<string> = new Set()): 'no' | 'wait' | Record<KpiBook, AutoScoreOutcome> {
  const now = deps.now?.() ?? new Date()
  if (now.getDay() !== AUTO_SCORE.weekday) return 'no'
  if (now.getHours() < AUTO_SCORE.from) return 'wait'

  const days = deps.snapshots.listDays()
  const { saturday, before } = lastTwoSaturdays(now)
  const saturdays = new Set(days.filter((d) => localDate(new Date(d.savedAt)) === saturday).map((d) => d.id))
  const results = deps.snapshots.listResults()
  const pair = saturdayPair(now, days)
  const settings = deps.snapshots.getSettings()
  const tellOnce = (key: string, message: string, detail: Record<string, unknown>) => {
    if (told.has(key)) return
    told.add(key)
    deps.logger.warn(message, detail)
  }

  let loaded: { older: OverdueSnapshot; newer: OverdueSnapshot } | null | undefined
  const load = () => {
    if (loaded === undefined) {
      const older = pair ? deps.snapshots.getDay(pair.oldDay.id) : null
      const newer = pair ? deps.snapshots.getDay(pair.newDay.id) : null
      loaded = older && newer ? { older, newer } : null
    }
    return loaded
  }

  const outcome = {} as Record<KpiBook, AutoScoreOutcome>
  for (const book of BOOKS) {
    // Already scored last Saturday's day, by hand or by this: leave it.
    if (results.some((r) => (r.book ?? 'regular') === book && saturdays.has(r.newId))) {
      outcome[book] = 'already'
      continue
    }
    if (!saturdays.size) {
      outcome[book] = 'no-new-day'
      tellOnce(`${saturday}:${book}:no-new-day`, 'weekly kpi: Monday score not generated, no day was saved last Saturday', { book, saturday })
      continue
    }
    const both = load()
    if (!both) {
      outcome[book] = 'no-old-day'
      tellOnce(`${saturday}:${book}:no-old-day`, 'weekly kpi: Monday score not generated, no day was saved the Saturday before', { book, saturday: before })
      continue
    }
    const { older, newer } = both
    let oldTable: SnapshotTableRow[]
    let newTable: SnapshotTableRow[]
    if (book === 'regular') {
      // As the button does: the tables frozen in the two days.
      oldTable = older.table
      newTable = newer.table
    } else {
      // The day's own dispute percentage, or for days saved before there was one, the one set now.
      const percentOf = (d: OverdueSnapshot) => d.disputePercentage ?? settings.disputePercentage ?? null
      const oldPercent = percentOf(older)
      if (oldPercent === null) {
        outcome[book] = 'no-dispute-percentage'
        tellOnce(`${saturday}:${book}:no-percentage`, 'weekly kpi: Monday dispute score not generated, no dispute target percentage is set', { book })
        continue
      }
      oldTable = transformOverdueDay(older.rows as unknown as OverduePayment[], oldPercent, deps.nameOf, 'dispute')
      newTable = transformOverdueDay(newer.rows as unknown as OverduePayment[], percentOf(newer) ?? 0, deps.nameOf, 'dispute')
    }
    const scored = scoreTwoDays(oldTable, newTable)
    const meta = deps.snapshots.saveResult({
      book,
      generatedBy: AUTO_SCORE.by,
      generatedByName: AUTO_SCORE.byName,
      oldId: older.id,
      newId: newer.id,
      oldSavedAt: older.savedAt,
      newSavedAt: newer.savedAt,
      rows: scored.rows,
      flags: scored.flags,
      oldTable,
      newTable,
    })
    deps.logger.info('weekly kpi: weekly score generated automatically', { id: meta.id, book, coordinators: scored.rows.length })
    outcome[book] = 'generated'
  }
  return outcome
}
