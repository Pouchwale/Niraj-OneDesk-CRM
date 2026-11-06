/**
 * Weekly KPI: saves the Overdue day by itself, the same day the "Save today's
 * data" button saves. Saturday's (since 6 Nov 2026) is the one the weekly score
 * uses: it compares Saturday with Saturday (the user's rule; auto-score.ts makes
 * it on Monday). Monday's (since 13 Oct 2026) stays: Overdue Trends is built
 * from each week's Monday-morning book.
 *
 * The workbook is refreshed from SAP at 09:30 and reaches the CRM when the team
 * leader's screen syncs it. So from 10:00 the server waits for an Overdue import
 * made that morning; if none has come by 13:00 it saves what it has and says so
 * in the log. One save per day: nothing happens if a day was already saved that
 * day, by hand or by this. Right after, the same check makes Monday's score.
 */

import type { NewOverdueSnapshot } from '../../../shared/snapshots'
import type { Logger } from '../../logger'
import { transformOverdueDay } from '../../../src/features/snapshots/transform'
import type { OverduePayment } from '../../../src/lib/types'
import { runAutoScore } from './auto-score'
import type { SnapshotStore } from './store'

/** Monday (1) for Overdue Trends, Saturday (6) for the weekly score. */
export const AUTO_SAVE = { weekdays: [1, 6], from: 10, latest: 13, everyMs: 5 * 60_000 } as const

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Whether to save now. `savedDates` are local dates of days already saved;
 * `lastImport` is when the Overdue book was last imported.
 */
export function autoSaveDue(now: Date, savedDates: string[], lastImport: string | null): 'save' | 'save-stale' | 'wait' | 'no' {
  if (!(AUTO_SAVE.weekdays as readonly number[]).includes(now.getDay())) return 'no'
  if (savedDates.includes(localDate(now))) return 'no'
  if (now.getHours() < AUTO_SAVE.from) return 'wait'
  const importedToday = lastImport !== null && localDate(new Date(lastImport)) === localDate(now)
  if (importedToday) return 'save'
  return now.getHours() >= AUTO_SAVE.latest ? 'save-stale' : 'wait'
}

export interface AutoSaveDeps {
  snapshots: SnapshotStore
  /** The shared CRM records, as they stand. */
  overduePayments: () => OverduePayment[]
  /** Coordinator id → name, from the accounts. */
  nameOf: (coordinatorId: string) => string
  /** When the Overdue workbook file last changed, if known. */
  fileModifiedAt?: () => string | null
  logger: Logger
  now?: () => Date
}

/** One check: saves Monday's day when it is due. Returns what it did. */
export function runAutoSave(deps: AutoSaveDeps): string {
  const now = deps.now?.() ?? new Date()
  const rows = deps.overduePayments()
  const lastImport = rows.reduce<string | null>((latest, r) => {
    const at = (r as { imported_at?: string | null }).imported_at ?? null
    return at && (!latest || at > latest) ? at : latest
  }, null)
  const saved = deps.snapshots.listDays().map((d) => localDate(new Date(d.savedAt)))
  const decision = autoSaveDue(now, saved, lastImport)
  if (decision === 'no' || decision === 'wait') return decision

  const dayName = DAY_NAMES[now.getDay()]
  const { percentage, disputePercentage } = deps.snapshots.getSettings()
  if (percentage === null) {
    deps.logger.warn(`weekly kpi: ${dayName} save skipped, no target percentage is set`)
    return 'no-percentage'
  }
  const input: NewOverdueSnapshot = {
    savedBy: 'system',
    savedByName: decision === 'save' ? `Automatic (${dayName})` : `Automatic (${dayName}, before the morning sync)`,
    fileModifiedAt: deps.fileModifiedAt?.() ?? null,
    percentage,
    disputePercentage: disputePercentage ?? null,
    rows: rows as unknown as Record<string, unknown>[],
    table: transformOverdueDay(rows, percentage, deps.nameOf),
  }
  const day = deps.snapshots.saveDay(input)
  const log = decision === 'save' ? deps.logger.info : deps.logger.warn
  log.call(deps.logger, `weekly kpi: ${dayName} day saved automatically`, {
    id: day.id,
    rows: day.rowCount,
    coordinators: day.coordinatorCount,
    ...(decision === 'save-stale' ? { note: 'no Overdue import yet this morning; saved the data as it stood' } : {}),
  })
  return decision
}

/** Checks every few minutes for as long as the server runs: Monday's day, then Monday's score. */
export function startAutoSave(deps: AutoSaveDeps): () => void {
  const told = new Set<string>()
  const tick = () => {
    try {
      runAutoSave(deps)
    } catch (err) {
      deps.logger.error('weekly kpi: Monday save failed', { error: err instanceof Error ? err.message : String(err) })
    }
    try {
      runAutoScore(deps, told)
    } catch (err) {
      deps.logger.error('weekly kpi: Monday score failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  tick()
  const timer = setInterval(tick, AUTO_SAVE.everyMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
