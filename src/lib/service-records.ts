/**
 * Service: the dispatch mails coordinators send customers, and the score the
 * team leader reads from them (the SERVICE sheet's rules, 5 Nov 2026).
 *
 *   Row score       10 when an Information Date is entered, else 0. The
 *                   sheet's formula meant to grade Date Diff but reads the
 *                   Information Date column; the user chose to keep it as it is.
 *   No. of mails    the coordinator's rows dated in the period.
 *   Mail ratio      mails ÷ Total Customers.
 *   Final score     (sum of row scores ÷ Total Customers) × 10, capped at 100
 *                   (user's choice). No Total Customers → 0.
 *
 * Total Customers is typed per coordinator per month by the team leader or
 * administrator (since 5 Nov 2026, user's choice: one number for every month
 * sent ratios to 450%). A period longer than a month adds up its months.
 * Since 16 Nov 2026 it is no longer typed, for any month: it is the
 * coordinator's different customers in the OTIF file with a PO closed that
 * month (shared/service-otif.ts).
 */

import { daysBetween, datesByNeighbours, pickDate, sheetDateCandidates } from './sheet-dates'
import type { DispatchStatus, ServiceCustomerTarget, ServiceRecord } from './types'
import { OTIF_CUSTOMERS_FROM, type OtifCustomerCounts } from '../../shared/service-otif'
import { resolveResponsible, type BillingPerson } from './billing-issues'

export const DISPATCH_STATUSES: DispatchStatus[] = ['Early', 'On Time', 'Delay']

/** Days the customer was told ahead of the original dispatch date (negative = told after). */
export function serviceDateDiff(r: Pick<ServiceRecord, 'information_date' | 'original_dispatch_date'>): number | null {
  return r.information_date && r.original_dispatch_date ? daysBetween(r.information_date, r.original_dispatch_date) : null
}

export const SERVICE_ROW_POINTS = 10
export const SERVICE_SCORE_CAP = 100

export function serviceRowScore(r: Pick<ServiceRecord, 'information_date'>): number {
  return r.information_date ? SERVICE_ROW_POINTS : 0
}

export function inServicePeriod(r: Pick<ServiceRecord, 'date'>, from: string | null, to: string | null): boolean {
  if (from && r.date < from) return false
  if (to && r.date > to) return false
  return true
}

/** The month a customer count is for. Counts saved before months existed came from the sheet's May 2026 table. */
export function targetMonth(t: Pick<ServiceCustomerTarget, 'month'>): string {
  return t.month ?? '2026-05'
}

/** A coordinator's Total Customers for one month (yyyy-mm), or null when nobody has typed it. */
export function customersFor(targets: readonly ServiceCustomerTarget[], coordinatorId: string, month: string): number | null {
  return targets.find((t) => t.coordinatorId === coordinatorId && targetMonth(t) === month)?.customers ?? null
}

/** Whether a month's Total Customers comes from OTIF rather than being typed: every month since 16 Nov 2026. */
export const customersFromOtif = (month: string) => month >= OTIF_CUSTOMERS_FROM

/**
 * A coordinator's Total Customers for one month: from OTIF (0 when the file
 * has none of theirs; null when the file could not be read). With no OTIF
 * source given at all (undefined), the typed numbers, as before 16 Nov 2026.
 */
export function monthCustomers(
  targets: readonly ServiceCustomerTarget[],
  otif: OtifCustomerCounts | null | undefined,
  coordinatorId: string,
  month: string
): number | null {
  if (otif !== undefined && customersFromOtif(month)) return otif ? (otif[month]?.[coordinatorId] ?? 0) : null
  return customersFor(targets, coordinatorId, month)
}

const monthOf = (day: string) => day.slice(0, 7)
function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** The months a period touches; an open end runs to the first or last record. */
export function monthsInPeriod(from: string | null, to: string | null, records: readonly Pick<ServiceRecord, 'date'>[]): string[] {
  const days = records.map((r) => r.date).sort()
  const start = from ?? days[0]
  const end = to ?? days[days.length - 1]
  if (!start || !end || start > end) return []
  const out: string[] = []
  for (let m = monthOf(start); m <= monthOf(end) && out.length < 240; m = nextMonth(m)) out.push(m)
  return out
}

export interface ServiceScore {
  coordinatorId: string
  /** The months' Total Customers added up; null when none of them has a number. */
  totalCustomers: number | null
  /** Months in the period with no number for this coordinator (none typed, or the OTIF file not read). */
  missingMonths: string[]
  mails: number
  /** Mails ÷ customers, 0-1+ (not capped); null without a customer count. */
  mailRatio: number | null
  sumOfScore: number
  /** 0-100, null without a customer count. */
  finalScore: number | null
}

/** Each coordinator's service score for the period; everyone listed gets a line. Highest final score first. */
export function serviceScores(
  records: readonly ServiceRecord[],
  targets: readonly ServiceCustomerTarget[],
  coordinatorIds: readonly string[],
  from: string | null,
  to: string | null,
  /** Total Customers from OTIF (null: the file was not read, so no number; left out: the typed numbers). */
  otif?: OtifCustomerCounts | null
): ServiceScore[] {
  const months = monthsInPeriod(from, to, records)
  const tally = new Map<string, { mails: number; sum: number }>(coordinatorIds.map((id) => [id, { mails: 0, sum: 0 }]))
  for (const r of records) {
    if (!r.coordinator_id || !inServicePeriod(r, from, to)) continue
    const t = tally.get(r.coordinator_id)
    if (!t) continue
    t.mails++
    t.sum += serviceRowScore(r)
  }
  return [...tally.entries()]
    .map(([coordinatorId, { mails, sum }]) => {
      const counts = months.map((m) => monthCustomers(targets, otif, coordinatorId, m))
      const known = counts.filter((c): c is number => c !== null)
      const customers = known.length ? known.reduce((a, c) => a + c, 0) : null
      const usable = customers !== null && customers > 0
      return {
        coordinatorId,
        totalCustomers: customers,
        missingMonths: months.filter((_, i) => counts[i] === null),
        mails,
        mailRatio: usable ? mails / customers : null,
        sumOfScore: sum,
        finalScore: usable ? Math.min(SERVICE_SCORE_CAP, (sum / customers) * 10) : null,
      }
    })
    .sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1) || b.mails - a.mails)
}

export const SERVICE_TEAMS = ['Pouchwale', 'GP3'] as const
export type ServiceTeam = (typeof SERVICE_TEAMS)[number]

export interface ServiceTeamScore {
  team: ServiceTeam
  /** The team's people with the Service module switched on. */
  memberIds: string[]
  /** Those of them with a final score this period. */
  scored: number
  customers: number
  mails: number
  sumOfScore: number
  /** The average of its people's final scores, as on the leader Dashboard; null when none has one. */
  finalScore: number | null
}

/**
 * Each team's Service score (23 Nov 2026). A team is its people in the Admin
 * Panel with Service switched on (today Pouchwale is Disha Acharya alone). A
 * person with no customers in the period has no score and is left out of the average.
 */
export function serviceTeamScores(
  scores: readonly ServiceScore[],
  people: readonly { id: string; module?: string | null }[],
  isServiceOff: (id: string) => boolean
): ServiceTeamScore[] {
  return SERVICE_TEAMS.map((team) => {
    const ids = new Set(people.filter((p) => p.module === team && !isServiceOff(p.id)).map((p) => p.id))
    const lines = scores.filter((s) => ids.has(s.coordinatorId))
    const finals = lines.map((s) => s.finalScore).filter((v): v is number => v !== null)
    return {
      team,
      memberIds: lines.map((s) => s.coordinatorId),
      scored: finals.length,
      customers: lines.reduce((a, s) => a + (s.totalCustomers ?? 0), 0),
      mails: lines.reduce((a, s) => a + s.mails, 0),
      sumOfScore: lines.reduce((a, s) => a + s.sumOfScore, 0),
      finalScore: finals.length ? finals.reduce((a, v) => a + v, 0) / finals.length : null,
    }
  })
}

/* ===================== The old SERVICE sheet, imported once (5 Nov 2026) ===================== */

/** A dispatch date this far from the Information Date is taken as a day/month mix-up, if the other reading is near. */
const NEAR_DISPATCH_DAYS = 60

const cellText = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s === '' || s === '-' || s.toLowerCase() === 'none' ? null : s
}

function statusOf(v: unknown): DispatchStatus | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (s.startsWith('early')) return 'Early'
  if (s.startsWith('on')) return 'On Time'
  if (s.startsWith('delay')) return 'Delay'
  return null
}

/**
 * The SERVICE sheet's rows (columns A-J as headed in the sheet) as records.
 * The row Date is read by its neighbours, the Information Date by the row's
 * Date. A dispatch date is often still ahead, so it is kept as written unless
 * that is over 60 days from the Information Date and the other reading is not.
 * A row with no Date takes its Information Date; one with no customer name is
 * kept as "-". Rows with neither date are left out.
 */
export function serviceRecordsFromSheet(
  rows: Record<string, unknown>[],
  people: readonly BillingPerson[],
  importedAt: string,
  today: string
): { records: ServiceRecord[]; skipped: number; reread: number } {
  const used = rows.map((row, index) => ({ row, index })).filter(({ row }) => cellText(row['Customer Name']) || cellText(row['Sales Order No']))
  const options = used.map(({ row }) => sheetDateCandidates(row['Date']))
  const dates = datesByNeighbours(options, today)
  let skipped = rows.length - used.length
  let reread = 0
  const records: ServiceRecord[] = []

  used.forEach(({ row, index }, i) => {
    const information = pickDate(sheetDateCandidates(row['Information Date']), dates[i], today)
    const date = dates[i] ?? information
    if (!date) {
      skipped++
      return
    }
    if (options[i].length > 1 && date !== options[i][0]) reread++
    const informationDate = (() => {
      const o = sheetDateCandidates(row['Information Date'])
      const picked = pickDate(o, date, today)
      if (picked && o.length > 1 && picked !== o[0]) reread++
      return picked
    })()
    const dispatchDate = (key: string) => {
      const o = sheetDateCandidates(row[key])
      if (o.length < 2) return o[0] ?? null
      const anchor = informationDate ?? date
      const far = (d: string) => Math.abs(daysBetween(anchor, d)) > NEAR_DISPATCH_DAYS
      if (far(o[0]) && !far(o[1])) {
        reread++
        return o[1]
      }
      return o[0]
    }
    const name = cellText(row['Coordinator Name'])
    const who = resolveResponsible(name, people)
    const matched = people.some((p) => p.id === who)
    records.push({
      id: `service-import-${index + 2}`,
      date,
      coordinator_id: matched ? who : null,
      coordinator_name: name,
      po_no: cellText(row['PO No.']),
      fg_code: cellText(row['FG Code']),
      sales_order_no: cellText(row['Sales Order No']),
      customer_name: cellText(row['Customer Name']) ?? '-',
      dispatch_status: statusOf(row['Dispatch Status']),
      information_date: informationDate,
      original_dispatch_date: dispatchDate('Original SO Dispatch Date'),
      final_dispatch_date: dispatchDate('Final Dispatch Date'),
      remark: cellText(row['Remark']),
      created_at: importedAt,
      created_by: null,
      updated_at: importedAt,
      updated_by: null,
    })
  })
  return { records, skipped, reread }
}
