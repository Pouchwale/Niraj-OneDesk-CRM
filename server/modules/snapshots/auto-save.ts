/**
 * Weekly KPI: saves Monday's Overdue day by itself (since 13 Oct 2026), the
 * same day the "Save today's data" button saves, so the weekly score always has
 * its Monday to compare against.
 *
 * The workbook is refreshed from SAP at 09:30 and reaches the CRM when the team
 * leader's screen syncs it. So from 10:00 the server waits for an Overdue import
 * made that morning; if none has come by 13:00 it saves what it has and says so
 * in the log. One save per Monday: nothing happens if a day was already saved,
 * by hand or by this.
 */

import type { NewOverdueSnapshot } from '../../../shared/snapshots'
import type { Logger } from '../../logger'
import { transformOverdueDay } from '../../../src/features/snapshots/transform'
import type { OverduePayment } from '../../../src/lib/types'
import type { SnapshotStore } from './store'

export const AUTO_SAVE = { weekday: 1, from: 10, latest: 13, everyMs: 5 * 60_000 } as const

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Whether to save now. `savedDates` are local dates of days already saved;
 * `lastImport` is when the Overdue book was last imported.
 */
export function autoSaveDue(now: Date, savedDates: string[], lastImport: string | null): 'save' | 'save-stale' | 'wait' | 'no' {
  if (now.getDay() !== AUTO_SAVE.weekday) return 'no'
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

  const { percentage } = deps.snapshots.getSettings()
  if (percentage === null) {
    deps.logger.warn('weekly kpi: Monday save skipped, no target percentage is set')
    return 'no-percentage'
  }
  const input: NewOverdueSnapshot = {
    savedBy: 'system',
    savedByName: decision === 'save' ? 'Automatic (Monday)' : 'Automatic (Monday, before the morning sync)',
    fileModifiedAt: deps.fileModifiedAt?.() ?? null,
    percentage,
    rows: rows as unknown as Record<string, unknown>[],
    table: transformOverdueDay(rows, percentage, deps.nameOf),
  }
  const day = deps.snapshots.saveDay(input)
  const log = decision === 'save' ? deps.logger.info : deps.logger.warn
  log.call(deps.logger, 'weekly kpi: Monday day saved automatically', {
    id: day.id,
    rows: day.rowCount,
    coordinators: day.coordinatorCount,
    ...(decision === 'save-stale' ? { note: 'no Overdue import yet this morning; saved the data as it stood' } : {}),
  })
  return decision
}

/** Checks every few minutes for as long as the server runs. */
export function startAutoSave(deps: AutoSaveDeps): () => void {
  const tick = () => {
    try {
      runAutoSave(deps)
    } catch (err) {
      deps.logger.error('weekly kpi: Monday save failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  tick()
  const timer = setInterval(tick, AUTO_SAVE.everyMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
