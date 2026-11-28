/**
 * Reading the OTIF-SCORE workbook's rows (moved here from src/lib/otif-live.ts
 * on 16 Nov 2026 so the server can count each coordinator's customers for the
 * Service score with the very same reading the OTIF page uses). Pure: no
 * React, no xlsx; the caller opens the workbook and passes its rows.
 */

import type { OtifLiveRow } from './otif-reports'

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

export type OtifReadResult =
  | { ok: true; sheetName: string; rows: OtifLiveRow[]; total: number; skipped: number; /** Rows of departments the CRM does not count (OTIF_DEPARTMENTS). */ leftOut?: number }
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

/**
 * The departments the CRM counts (28 Nov 2026, the user): Label, Laminates and
 * Sleeves only. Carton, Corrugation, General, Service, Building and anything
 * else in the OTIF sheet are left out everywhere — the OTIF page, its PDF and
 * the Service score.
 */
export const OTIF_DEPARTMENTS: readonly string[] = ['FG - Label', 'FG - Laminates', 'FG - Sleeves']
export const countedDepartment = (department: string | null): boolean => department !== null && OTIF_DEPARTMENTS.includes(department)

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

/**
 * Orders the CRM counts under someone other than the file's Relation Manager
 * (21 Nov 2026, the user's rule): Krina Shah's orders closed from 1 Nov 2026
 * are Disha Acharya's, on the OTIF page and in the Service score, because
 * Disha handles those customers' service mails. The file is not changed, and
 * older orders and orders still open stay with Krina.
 */
export const OTIF_RELATION_MANAGER_MOVES: readonly { from: string; to: string; closedFrom: string }[] = [
  { from: 'krina shah', to: 'Disha Acharya', closedFrom: '2026-11-01' },
]

/** The Relation Manager the CRM uses for an order. */
export function otifRelationManager(name: string | null, poClosedDate: string | null): string | null {
  if (!name || !poClosedDate) return name
  const wanted = name.trim().replace(/\s+/g, ' ').toLowerCase()
  const move = OTIF_RELATION_MANAGER_MOVES.find((m) => m.from === wanted && poClosedDate >= m.closedFrom)
  return move ? move.to : name
}

/** One data row as an OTIF row; null for an empty row or one with no PO number. */
export function otifRowOf(row: unknown[], columns: Partial<Record<OtifLiveField, number>>, date1904 = false): OtifLiveRow | null {
  const cell = (field: OtifLiveField) => (columns[field] === undefined ? null : row[columns[field]!])
  const poNo = textCell(cell('poNo'))
  if (!poNo) return null
  const poClosedDate = dateCell(cell('poClosedDate'), date1904)
  return {
    poNo,
    soNo: textCell(cell('soNo')),
    soDate: dateCell(cell('soDate'), date1904),
    poDueDate: dateCell(cell('poDueDate'), date1904),
    poClosedDate,
    delayDays: numberCell(cell('delayDays')),
    dayCommitted: numberCell(cell('dayCommitted')),
    customerName: textCell(cell('customerName')),
    openOrderQty: numberCell(cell('openOrderQty')),
    otifScore: otifCell(cell('otifScore')),
    relationManager: otifRelationManager(textCell(cell('relationManager')), poClosedDate),
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
  let leftOut = 0
  let total = 0
  for (const raw of pick.sheet.rows.slice(pick.header.index + 1)) {
    if (!raw || !raw.some((c) => c !== null && c !== undefined && c !== '')) continue
    total++
    const row = otifRowOf(raw, pick.header.columns, options.date1904)
    if (!row) skipped++
    else if (countedDepartment(row.department)) rows.push(row)
    else leftOut++
  }
  return { ok: true, sheetName: pick.sheet.name, rows, total, skipped, leftOut }
}
