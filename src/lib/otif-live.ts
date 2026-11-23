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
import type { OtifLiveFilters, OtifLiveRow, WeekBasis } from '../../shared/otif-reports'

export type { OtifLiveFilters, OtifLiveRow, OtifSavedReport, OtifSavedReportSummary, WeekBasis } from '../../shared/otif-reports'

// The reading of the sheet itself is shared with the server (Service score customers).
export * from '../../shared/otif-read'

/* ===================== Weeks ===================== */

/** Which date puts an order in a week. */
export const WEEK_BASES: { id: WeekBasis; label: string; field: 'poClosedDate' | 'poDueDate' | 'soDate' }[] = [
  { id: 'closed', label: 'PO Closed Date', field: 'poClosedDate' },
  { id: 'due', label: 'PO Due Date', field: 'poDueDate' },
  { id: 'so', label: 'SO Date', field: 'soDate' },
]

export const basisDate = (row: OtifLiveRow, basis: WeekBasis): string | null => row[WEEK_BASES.find((b) => b.id === basis)!.field]

/** The Saturday that starts the week (Saturday to Friday, the company week) a day falls in. */
export const weekStartOf = (day: string) => weekOf(day)

/** "2 Nov – 8 Nov 2026" */
export const otifWeekLabel = (start: string) => periodLabel('week', start)

/** The orders whose basis date falls in the week starting `start` (a Saturday; Saturday to Friday). */
export function rowsInWeek(rows: readonly OtifLiveRow[], basis: WeekBasis, start: string): OtifLiveRow[] {
  const friday = addDays(start, 6)
  return rows.filter((r) => {
    const day = basisDate(r, basis)
    return day !== null && day >= start && day <= friday
  })
}

/** The newest week with any order on that basis, up to the week holding `today`; null with none. */
export function latestWeekWithRows(rows: readonly OtifLiveRow[], basis: WeekBasis, today: string): string | null {
  const last = addDays(weekStartOf(today), 6)
  let best: string | null = null
  for (const r of rows) {
    const day = basisDate(r, basis)
    if (day && day <= last && (!best || day > best)) best = day
  }
  return best ? weekStartOf(best) : null
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

/** Each of the `count` weeks up to the one starting `start` (a Saturday), oldest first: orders, OTIF YES and OTIF %. */
export function weeklyTrend(rows: readonly OtifLiveRow[], basis: WeekBasis, start: string, count = 8): { start: string; total: number; yes: number; pct: number | null }[] {
  const weeks = Array.from({ length: count }, (_, i) => addDays(start, -7 * (count - 1 - i)))
  const index = new Map(weeks.map((w, i) => [w, i]))
  const tally = weeks.map((w) => ({ start: w, total: 0, yes: 0, pct: null as number | null }))
  for (const r of rows) {
    const day = basisDate(r, basis)
    if (!day) continue
    const i = index.get(weekStartOf(day))
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

/* ===================== Any From–To dates (14 Nov 2026) ===================== */

/**
 * The orders whose basis date falls between `from` and `to`, both included.
 * The user asked for From–To dates in place of the Saturday-to-Friday week
 * picker (14 Nov 2026).
 */
export function rowsInRange(rows: readonly OtifLiveRow[], basis: WeekBasis, from: string, to: string): OtifLiveRow[] {
  return rows.filter((r) => {
    const day = basisDate(r, basis)
    return day !== null && day >= from && day <= to
  })
}

/** "1 Nov 2026 – 14 Nov 2026" */
/**
 * The From-To dates after one of them is chosen (23 Nov 2026). The calendars no
 * longer grey out days beyond the other date, so remembered October dates cannot
 * block November: a From after the To moves the To to that month's end (today at
 * most), and a To before the From moves the From to that month's first day.
 */
export function pickRangeDay(range: { from: string; to: string }, edge: 'from' | 'to', day: string, today: string): { from: string; to: string } {
  // A year still being typed (0202) is left alone rather than dragging the other date with it.
  if (day < '2000-01-01') return { ...range, [edge]: day }
  if (edge === 'from') {
    if (day <= range.to) return { from: day, to: range.to }
    const monthEnd = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10)
    return { from: day, to: day <= today && today < monthEnd ? today : monthEnd }
  }
  if (day >= range.from) return { from: range.from, to: day }
  return { from: `${day.slice(0, 8)}01`, to: day }
}

export function otifRangeLabel(from: string, to: string): string {
  const fmt = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`
  }
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`
}
