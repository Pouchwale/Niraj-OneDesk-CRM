/**
 * OTIF Analytics, live (7 Nov 2026): the OTIF-SCORE workbook the server
 * watches (EXCEL_OTIF_PATH), read for analysis one week at a time. Nothing
 * is imported into the CRM's records or saved anywhere: the screen reads the
 * file as it was last saved.
 *
 * The fields are the ones the team asked for, found by their column names and
 * kept exactly as the sheet writes them (no value is adjusted or guessed):
 * PO No., SO No, SO Date, PO Due Date, PO Closed Date, Delay Day, Day
 * Commited, Customer Name, Open Order Qty, OTIF Score and Relation Manager,
 * plus Department, which the category breakdown reads. In this workbook "PO"
 * is the production order ("Production Order No", "Production Order Due
 * Date"); the short names work too, should the sheet be renamed.
 *
 * Pure (no React, no xlsx), so the worker that reads the file and the tests
 * share it.
 */

import { computeOtifSummary, type OtifSummary } from './demo-data'
import { addDays, periodLabel, weekOf } from './score-history'

export type OtifLiveField =
  | 'poNo'
  | 'soNo'
  | 'soDate'
  | 'poDueDate'
  | 'poClosedDate'
  | 'delayDays'
  | 'dayCommitted'
  | 'customerName'
  | 'openOrderQty'
  | 'otifScore'
  | 'relationManager'
  | 'department'

/** The columns read, in the team's order: the label they asked for, and the headers it answers to (best first). */
export const OTIF_LIVE_COLUMNS: { field: OtifLiveField; label: string; headers: string[]; required: boolean }[] = [
  { field: 'poNo', label: 'PO No.', headers: ['Production Order No', 'PO No.', 'Production Order Number', 'PO Number'], required: true },
  { field: 'soNo', label: 'SO No', headers: ['Sales Order No', 'SO No', 'Sales Order Number', 'SO Number'], required: true },
  { field: 'soDate', label: 'SO Date', headers: ['Sales Order Date', 'SO Date'], required: true },
  { field: 'poDueDate', label: 'PO Due Date', headers: ['Production Order Due Date', 'PO Due Date'], required: true },
  { field: 'poClosedDate', label: 'PO Closed Date', headers: ['PO Closed Date', 'Production Order Closed Date'], required: true },
  { field: 'delayDays', label: 'Delay Day', headers: ['DelayDays', 'Delay Day'], required: true },
  { field: 'dayCommitted', label: 'Day Commited', headers: ['Day Commited', 'Day Committed'], required: true },
  { field: 'customerName', label: 'Customer Name', headers: ['Customer Name'], required: true },
  { field: 'openOrderQty', label: 'Open Order Qty', headers: ['Open Order Qty'], required: true },
  { field: 'otifScore', label: 'OTIF Score', headers: ['OTIF Score'], required: true },
  { field: 'relationManager', label: 'Relation Manager', headers: ['Relation Manager'], required: true },
  { field: 'department', label: 'Department', headers: ['Department'], required: false },
]

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

export type OtifReadResult =
  | { ok: true; sheetName: string; rows: OtifLiveRow[]; total: number; skipped: number }
  | { ok: false; error: string }

/* ===================== Reading cells ===================== */

/** A header as compared: case, spaces and punctuation ignored ("PO No." = "po no"). */
export const headerKey = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const DAY_MS = 86_400_000
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * The calendar date of an Excel date serial, worked in UTC so no time zone
 * can move it. 1900 system: 1 is 1 Jan 1900 and, from 1 Mar 1900 on (61),
 * the date is 30 Dec 1899 plus the serial (Excel counts a 29 Feb 1900 that
 * never was). 1904 system: 0 is 1 Jan 1904. A time of day is ignored.
 */
export function serialToIso(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial)) return null
  const whole = Math.floor(serial)
  if (date1904) return whole < 0 ? null : isoOf(Date.UTC(1904, 0, 1) + whole * DAY_MS)
  if (whole < 1) return null
  return isoOf((whole >= 61 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31)) + whole * DAY_MS)
}

const validIso = (y: number, m: number, d: number) => {
  const ms = Date.UTC(y, m - 1, d)
  const back = new Date(ms)
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? isoOf(ms) : null
}

/** A date cell: a serial number, a date, or text written yyyy-mm-dd or day first (dd-mm-yyyy, as Indian sheets write it). */
export function dateCell(value: unknown, date1904 = false): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return serialToIso(value, date1904)
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // Built at midnight UTC, or at local midnight (the reader's two ways): read it back the same way.
    const utc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0
    return utc ? validIso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()) : validIso(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  const text = String(value).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (m) return validIso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text)
  if (m) return validIso(Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

/** A number cell; text such as "1,200" or "-5" counts, anything else is empty. */
export function numberCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/,/g, '')
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null
}

/** A text cell, spaces tidied; a number is written as it is (91947 → "91947"). */
export function textCell(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text === '' ? null : text
}

/** YES or NO, as the sheet writes it (any case); anything else is empty. */
export function otifCell(value: unknown): 'YES' | 'NO' | null {
  const text = String(value ?? '').trim().toUpperCase()
  return text === 'YES' || text === 'NO' ? text : null
}

/** A department as written, with the spacing of its "FG -" prefix made even ("FG- Laminates" → "FG - Laminates"). */
export function departmentCell(value: unknown): string | null {
  const text = textCell(value)
  return text ? text.replace(/^FG\s*-\s*/i, 'FG - ') : null
}

/* ===================== Reading the sheet ===================== */

/** Where each field's column is, in a header row: the first header (best first) the row has. */
export function mapOtifHeaders(headerRow: unknown[]): { columns: Partial<Record<OtifLiveField, number>>; missing: string[] } {
  const at = new Map<string, number>()
  headerRow.forEach((cell, index) => {
    const key = headerKey(cell)
    if (key && !at.has(key)) at.set(key, index)
  })
  const columns: Partial<Record<OtifLiveField, number>> = {}
  const missing: string[] = []
  for (const col of OTIF_LIVE_COLUMNS) {
    const found = col.headers.map(headerKey).find((key) => at.has(key))
    if (found !== undefined) columns[col.field] = at.get(found)!
    else if (col.required) missing.push(col.label)
  }
  return { columns, missing }
}

/** The header row of a sheet: among its first 20 rows, the one naming the most of the columns. */
function findHeaderRow(rows: unknown[][]): { index: number; columns: Partial<Record<OtifLiveField, number>>; missing: string[] } | null {
  let best: { index: number; columns: Partial<Record<OtifLiveField, number>>; missing: string[] } | null = null
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const mapped = mapOtifHeaders(rows[i] ?? [])
    const found = Object.keys(mapped.columns).length
    if (found > 0 && (!best || found > Object.keys(best.columns).length)) best = { index: i, ...mapped }
  }
  return best
}

/** One data row as an OTIF row; null for an empty row or one with no PO number. */
export function otifRowOf(row: unknown[], columns: Partial<Record<OtifLiveField, number>>, date1904 = false): OtifLiveRow | null {
  const cell = (field: OtifLiveField) => (columns[field] === undefined ? null : row[columns[field]!])
  const poNo = textCell(cell('poNo'))
  if (!poNo) return null
  return {
    poNo,
    soNo: textCell(cell('soNo')),
    soDate: dateCell(cell('soDate'), date1904),
    poDueDate: dateCell(cell('poDueDate'), date1904),
    poClosedDate: dateCell(cell('poClosedDate'), date1904),
    delayDays: numberCell(cell('delayDays')),
    dayCommitted: numberCell(cell('dayCommitted')),
    customerName: textCell(cell('customerName')),
    openOrderQty: numberCell(cell('openOrderQty')),
    otifScore: otifCell(cell('otifScore')),
    relationManager: textCell(cell('relationManager')),
    department: departmentCell(cell('department')),
  }
}

/**
 * The OTIF rows of a workbook, given each sheet as rows of cells. With a sheet
 * named in the settings, that sheet; otherwise the sheet whose header row
 * names the most of the columns. Every one of the team's fields must be
 * there: a sheet missing one is refused, naming what is missing.
 */
export function readOtifSheets(sheets: { name: string; rows: unknown[][] }[], options: { wantedSheet?: string | null; date1904?: boolean } = {}): OtifReadResult {
  const pool = options.wantedSheet ? sheets.filter((s) => s.name === options.wantedSheet) : sheets
  if (options.wantedSheet && pool.length === 0) return { ok: false, error: `The workbook has no sheet named "${options.wantedSheet}".` }

  let pick: { sheet: (typeof sheets)[number]; header: NonNullable<ReturnType<typeof findHeaderRow>> } | null = null
  for (const sheet of pool) {
    const header = findHeaderRow(sheet.rows)
    if (header && (!pick || Object.keys(header.columns).length > Object.keys(pick.header.columns).length)) pick = { sheet, header }
  }
  if (!pick) return { ok: false, error: 'No sheet in the workbook has the OTIF columns (PO No., SO No, OTIF Score and the rest).' }
  if (pick.header.missing.length) {
    return { ok: false, error: `Sheet "${pick.sheet.name}" is missing ${pick.header.missing.length === 1 ? 'the column' : 'the columns'}: ${pick.header.missing.join(', ')}.` }
  }

  const rows: OtifLiveRow[] = []
  let skipped = 0
  let total = 0
  for (const raw of pick.sheet.rows.slice(pick.header.index + 1)) {
    if (!raw || !raw.some((c) => c !== null && c !== undefined && c !== '')) continue
    total++
    const row = otifRowOf(raw, pick.header.columns, options.date1904)
    if (row) rows.push(row)
    else skipped++
  }
  return { ok: true, sheetName: pick.sheet.name, rows, total, skipped }
}

/* ===================== Weeks ===================== */

export type WeekBasis = 'closed' | 'due' | 'so'

/** Which date puts an order in a week. */
export const WEEK_BASES: { id: WeekBasis; label: string; field: 'poClosedDate' | 'poDueDate' | 'soDate' }[] = [
  { id: 'closed', label: 'PO Closed Date', field: 'poClosedDate' },
  { id: 'due', label: 'PO Due Date', field: 'poDueDate' },
  { id: 'so', label: 'SO Date', field: 'soDate' },
]

export const basisDate = (row: OtifLiveRow, basis: WeekBasis): string | null => row[WEEK_BASES.find((b) => b.id === basis)!.field]

/** The Monday of the week (Monday to Sunday) a day falls in. */
export const mondayOf = (day: string) => weekOf(day)

/** "2 Nov – 8 Nov 2026" */
export const otifWeekLabel = (monday: string) => periodLabel('week', monday)

/** The orders whose basis date falls in the week starting `monday` (Monday to Sunday). */
export function rowsInWeek(rows: readonly OtifLiveRow[], basis: WeekBasis, monday: string): OtifLiveRow[] {
  const sunday = addDays(monday, 6)
  return rows.filter((r) => {
    const day = basisDate(r, basis)
    return day !== null && day >= monday && day <= sunday
  })
}

/** The newest week with any order on that basis, up to the week holding `today`; null with none. */
export function latestWeekWithRows(rows: readonly OtifLiveRow[], basis: WeekBasis, today: string): string | null {
  const last = addDays(mondayOf(today), 6)
  let best: string | null = null
  for (const r of rows) {
    const day = basisDate(r, basis)
    if (day && day <= last && (!best || day > best)) best = day
  }
  return best ? mondayOf(best) : null
}

/* ===================== Analysis ===================== */

export const NOT_CLOSED = 'Not closed yet'
export const NO_DEPARTMENT = 'No department'
export const NOT_SET = 'Not set'

/** The delay buckets of the uploaded reports (file-parser computeDelayBucket), and one for an order still open. */
export function delayBucketOf(row: Pick<OtifLiveRow, 'delayDays' | 'poClosedDate'>): string {
  const d = row.delayDays
  if (d === null) return row.poClosedDate ? 'Unknown' : NOT_CLOSED
  if (d <= 0) return 'On-Time / Early'
  if (d <= 3) return '1-3 Days Late'
  if (d <= 7) return '4-7 Days Late'
  if (d <= 10) return '8-10 Days Late'
  return '10+ Days Late'
}

export interface OtifLiveFilters {
  department: string | null
  relationManager: string | null
  bucket: string | null
}

export const NO_LIVE_FILTERS: OtifLiveFilters = { department: null, relationManager: null, bucket: null }

export function filterRows(rows: readonly OtifLiveRow[], f: OtifLiveFilters): OtifLiveRow[] {
  return rows.filter(
    (r) =>
      (!f.department || (r.department ?? NO_DEPARTMENT) === f.department) &&
      (!f.relationManager || (r.relationManager ?? NOT_SET) === f.relationManager) &&
      (!f.bucket || delayBucketOf(r) === f.bucket)
  )
}

/** The page's summary, by the same function as an uploaded report: OTIF % = orders with OTIF Score YES ÷ all orders. */
export function liveSummary(rows: readonly OtifLiveRow[]): OtifSummary {
  return computeOtifSummary(rows.map((r) => ({ otif_score: r.otifScore, category: r.department ?? NO_DEPARTMENT, delay_bucket: delayBucketOf(r) })))
}

export interface ManagerLine {
  name: string
  total: number
  yes: number
  no: number
  /** OTIF Score YES ÷ orders, 0-100. */
  pct: number
}

/** OTIF per Relation Manager, most orders first ("Not set" where the sheet names nobody). */
export function byRelationManager(rows: readonly OtifLiveRow[]): ManagerLine[] {
  const per = new Map<string, ManagerLine>()
  for (const r of rows) {
    const name = r.relationManager ?? NOT_SET
    const line = per.get(name) ?? { name, total: 0, yes: 0, no: 0, pct: 0 }
    line.total++
    if (r.otifScore === 'YES') line.yes++
    else line.no++
    per.set(name, line)
  }
  return [...per.values()]
    .map((l) => ({ ...l, pct: l.total ? (l.yes / l.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** Each of the `count` weeks up to the one starting `monday`, oldest first: orders, OTIF YES and OTIF %. */
export function weeklyTrend(rows: readonly OtifLiveRow[], basis: WeekBasis, monday: string, count = 8): { monday: string; total: number; yes: number; pct: number | null }[] {
  const weeks = Array.from({ length: count }, (_, i) => addDays(monday, -7 * (count - 1 - i)))
  const index = new Map(weeks.map((w, i) => [w, i]))
  const tally = weeks.map((w) => ({ monday: w, total: 0, yes: 0, pct: null as number | null }))
  for (const r of rows) {
    const day = basisDate(r, basis)
    if (!day) continue
    const i = index.get(mondayOf(day))
    if (i === undefined) continue
    tally[i].total++
    if (r.otifScore === 'YES') tally[i].yes++
  }
  return tally.map((t) => ({ ...t, pct: t.total ? (t.yes / t.total) * 100 : null }))
}

/* ===================== Reading again ===================== */

/** What a new read of the file changed against the read before it. */
export interface OtifReadChange {
  /** Orders whose PO No. was not there before. */
  added: number
  /** Orders still there whose values changed (matched by PO No.). */
  changed: number
  /** Orders no longer in the file. */
  removed: number
}

const fingerprint = (r: OtifLiveRow) =>
  JSON.stringify([r.poNo, r.soNo, r.soDate, r.poDueDate, r.poClosedDate, r.delayDays, r.dayCommitted, r.customerName, r.openOrderQty, r.otifScore, r.relationManager, r.department])

/**
 * Compares two reads of the file. Identical rows cancel out (a PO No. can
 * repeat in the sheet, so they are counted, not just looked up); what is left
 * on both sides with the same PO No. is a change, the rest is new or gone.
 */
export function compareReads(before: readonly OtifLiveRow[], after: readonly OtifLiveRow[]): OtifReadChange {
  const left = new Map<string, { poNo: string; count: number }>()
  for (const r of before) {
    const key = fingerprint(r)
    const held = left.get(key)
    if (held) held.count++
    else left.set(key, { poNo: r.poNo, count: 1 })
  }
  const fresh = new Map<string, number>()
  for (const r of after) {
    const held = left.get(fingerprint(r))
    if (held && held.count > 0) held.count--
    else fresh.set(r.poNo, (fresh.get(r.poNo) ?? 0) + 1)
  }
  const gone = new Map<string, number>()
  for (const { poNo, count } of left.values()) if (count > 0) gone.set(poNo, (gone.get(poNo) ?? 0) + count)

  let changed = 0
  for (const [poNo, n] of fresh) changed += Math.min(n, gone.get(poNo) ?? 0)
  const freshTotal = [...fresh.values()].reduce((a, n) => a + n, 0)
  const goneTotal = [...gone.values()].reduce((a, n) => a + n, 0)
  return { added: freshTotal - changed, changed, removed: goneTotal - changed }
}

/** "66,740 orders" for a first read; afterwards "Nothing changed" or "3 new, 2 changed, 1 gone". */
export function summariseRead(read: { rows: readonly unknown[]; change: OtifReadChange | null }): string {
  if (!read.change) return `${read.rows.length.toLocaleString('en-IN')} orders`
  const { added, changed, removed } = read.change
  const parts = [added && `${added.toLocaleString('en-IN')} new`, changed && `${changed.toLocaleString('en-IN')} changed`, removed && `${removed.toLocaleString('en-IN')} gone`].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Nothing changed'
}

/** The week's orders as sheet rows for Excel: the team's fields, in their order. */
export function otifSheetRows(rows: readonly OtifLiveRow[]): (string | number | null)[][] {
  return [
    OTIF_LIVE_COLUMNS.map((c) => c.label),
    ...rows.map((r) => [
      r.poNo,
      r.soNo,
      r.soDate,
      r.poDueDate,
      r.poClosedDate,
      r.delayDays,
      r.dayCommitted,
      r.customerName,
      r.openOrderQty,
      r.otifScore,
      r.relationManager,
      r.department,
    ]),
  ]
}
