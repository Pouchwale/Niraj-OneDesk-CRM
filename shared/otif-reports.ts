/**
 * Saved OTIF reports (14 Nov 2026), shared by the browser and the server: the
 * shape of a live OTIF order, a saved report, and the check the server makes
 * on what a browser sends. No imports, so the server can use it as it is.
 */

/** One order of the OTIF-SCORE file, with the fields the team asked for. */
export interface OtifLiveRow {
  poNo: string
  soNo: string | null
  /** yyyy-mm-dd */
  soDate: string | null
  poDueDate: string | null
  /** Empty while the production order is still open. */
  poClosedDate: string | null
  /** As the sheet works it out: negative is early; empty while the order is open. */
  delayDays: number | null
  dayCommitted: number | null
  customerName: string | null
  openOrderQty: number | null
  /** The sheet's own verdict, on time and in full. */
  otifScore: 'YES' | 'NO' | null
  relationManager: string | null
  department: string | null
}

/** Which date places an order in the chosen dates. */
export type WeekBasis = 'closed' | 'due' | 'so'
export const WEEK_BASIS_IDS: readonly WeekBasis[] = ['closed', 'due', 'so']

export interface OtifLiveFilters {
  department: string | null
  relationManager: string | null
  bucket: string | null
}

/**
 * A saved OTIF report: the orders of a From–To range as the file had them when
 * it was saved, so the analysis reopens exactly as it was even after the file
 * moves on. Team leader and administrator save and open them; only the
 * administrator deletes one.
 */
export interface OtifSavedReport {
  id: string
  name: string
  from: string
  to: string
  basis: WeekBasis
  /** The filters on screen when it was saved; reopening starts with them. */
  filters: OtifLiveFilters
  file: { name: string; sheet: string; savedAt: string | null }
  savedAt: string
  savedBy: string
  savedByName: string
  /** Every order in the range (the filters are not applied, so they can be changed on reopening). */
  rows: OtifLiveRow[]
}

/** A saved report without its orders: what the list shows. */
export type OtifSavedReportSummary = Omit<OtifSavedReport, 'rows'> & { orders: number }

export const OTIF_REPORT_MAX_ROWS = 100_000
export const OTIF_REPORTS_ROUTE = '/api/otif-reports'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
export const isIsoDay = (value: unknown): value is string => typeof value === 'string' && ISO_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

const textOrNull = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const numberOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const dayOrNull = (v: unknown): string | null => (isIsoDay(v) ? v : null)

/** One order as sent by a browser, kept to the known fields; null when it has no PO No. */
export function cleanOtifRow(value: unknown): OtifLiveRow | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  const poNo = textOrNull(r.poNo, 100)
  if (!poNo) return null
  return {
    poNo,
    soNo: textOrNull(r.soNo, 100),
    soDate: dayOrNull(r.soDate),
    poDueDate: dayOrNull(r.poDueDate),
    poClosedDate: dayOrNull(r.poClosedDate),
    delayDays: numberOrNull(r.delayDays),
    dayCommitted: numberOrNull(r.dayCommitted),
    customerName: textOrNull(r.customerName),
    openOrderQty: numberOrNull(r.openOrderQty),
    otifScore: r.otifScore === 'YES' || r.otifScore === 'NO' ? r.otifScore : null,
    relationManager: textOrNull(r.relationManager, 150),
    department: textOrNull(r.department, 150),
  }
}
