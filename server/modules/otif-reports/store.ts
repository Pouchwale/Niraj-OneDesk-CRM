/**
 * Saved OTIF reports (14 Nov 2026). The user asked for a Save button on the
 * live OTIF page: the orders of the chosen From–To dates are kept as they
 * were, so a report reopens the same after the OTIF-SCORE file moves on.
 *
 * They live in one file beside the score history (otif-reports.json), not in
 * the shared store: a report holds every order of its dates, and the store is
 * sent to every screen.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cleanOtifRow,
  isIsoDay,
  OTIF_REPORT_MAX_ROWS,
  WEEK_BASIS_IDS,
  type OtifLiveFilters,
  type OtifLiveRow,
  type OtifSavedReport,
  type OtifSavedReportSummary,
  type WeekBasis,
} from '../../../shared/otif-reports'

export const OTIF_REPORTS_FILE = 'otif-reports.json'

interface ReportsFile {
  version: 1
  reports: OtifSavedReport[]
}

export interface OtifReportsStore {
  /** Every saved report without its orders, newest first. */
  list(): OtifSavedReportSummary[]
  get(id: string): OtifSavedReport | null
  /** Checks what the browser sent and keeps it. Throws a message for the screen. */
  save(input: unknown, by: { id: string; name: string }): OtifSavedReport
  remove(id: string): boolean
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** What a browser sent, checked and kept to the known fields. Throws a message for the screen. */
export function checkReport(input: unknown): Omit<OtifSavedReport, 'id' | 'savedAt' | 'savedBy' | 'savedByName'> {
  if (!input || typeof input !== 'object') throw new Error('Nothing to save.')
  const v = input as Record<string, unknown>
  if (!isIsoDay(v.from) || !isIsoDay(v.to)) throw new Error('Give a From and a To date.')
  if (v.from > v.to) throw new Error('The From date is after the To date.')
  if (!WEEK_BASIS_IDS.includes(v.basis as WeekBasis)) throw new Error('Choose which date places an order.')
  if (!Array.isArray(v.rows)) throw new Error('No orders were sent.')
  if (v.rows.length > OTIF_REPORT_MAX_ROWS) throw new Error(`A report can hold up to ${OTIF_REPORT_MAX_ROWS.toLocaleString('en-IN')} orders; choose fewer dates.`)
  const rows = v.rows.map(cleanOtifRow).filter((r): r is OtifLiveRow => r !== null)
  if (!rows.length) throw new Error('There are no orders in these dates to save.')
  const f = (v.filters ?? {}) as Record<string, unknown>
  const filters: OtifLiveFilters = { department: text(f.department, 150), relationManager: text(f.relationManager, 150), bucket: text(f.bucket, 60) }
  const file = (v.file ?? {}) as Record<string, unknown>
  const name = text(v.name, 120) ?? `OTIF ${v.from} to ${v.to}`
  return {
    name,
    from: v.from,
    to: v.to,
    basis: v.basis as WeekBasis,
    filters,
    file: { name: text(file.name, 260) ?? 'OTIF-SCORE', sheet: text(file.sheet, 120) ?? '', savedAt: typeof file.savedAt === 'string' ? file.savedAt.slice(0, 40) : null },
    rows,
  }
}

export function createOtifReportsStore(dir: string, now: () => Date = () => new Date()): OtifReportsStore {
  const path = join(dir, OTIF_REPORTS_FILE)
  const read = (): ReportsFile => {
    if (!existsSync(path)) return { version: 1, reports: [] }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as ReportsFile
      return parsed && Array.isArray(parsed.reports) ? parsed : { version: 1, reports: [] }
    } catch {
      return { version: 1, reports: [] }
    }
  }
  const write = (file: ReportsFile) => {
    mkdirSync(dir, { recursive: true })
    const temp = `${path}.tmp`
    writeFileSync(temp, JSON.stringify(file))
    renameSync(temp, path)
  }

  return {
    list: () =>
      read()
        .reports.map(({ rows, ...rest }) => ({ ...rest, orders: rows.length }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    get: (id) => read().reports.find((r) => r.id === id) ?? null,
    save: (input, by) => {
      const report: OtifSavedReport = { id: randomUUID(), ...checkReport(input), savedAt: now().toISOString(), savedBy: by.id, savedByName: by.name }
      const file = read()
      file.reports.push(report)
      write(file)
      return report
    },
    remove: (id) => {
      const file = read()
      const kept = file.reports.filter((r) => r.id !== id)
      if (kept.length === file.reports.length) return false
      write({ ...file, reports: kept })
      return true
    },
  }
}
