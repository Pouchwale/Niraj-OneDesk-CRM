/**
 * The Service score's Total Customers, from OTIF (16 Nov 2026, the user's
 * rules): a coordinator's Total Customers for a month is the number of
 * different customers in the OTIF-SCORE file whose production order closed
 * that month (PO Closed Date) under that coordinator as Relation Manager.
 * Nobody types it any more. First from November 2026 only; the same day the
 * user chose OTIF for every past month too, May 2026's typed numbers
 * included. The mails stay every Service record of the coordinator in the
 * period.
 */

import type { OtifLiveRow } from './otif-reports'

export const SERVICE_OTIF_ROUTE = '/api/service-otif'

/** The first month whose Total Customers comes from OTIF (yyyy-mm): every month (16 Nov 2026), so no typed number is used. */
export const OTIF_CUSTOMERS_FROM = '0000-01'

/** month (yyyy-mm) → coordinator id → different customers. */
export type OtifCustomerCounts = Record<string, Record<string, number>>

export interface OtifCustomerTally {
  counts: OtifCustomerCounts
  /** The same by week: the week's Saturday (yyyy-mm-dd, Saturday to Friday) → coordinator id → different customers. */
  weeks: OtifCustomerCounts
  /** month → Relation Manager as the file writes it ("(blank)" when empty) → customers, for names that are no CRM coordinator. */
  unmatched: Record<string, Record<string, number>>
}

export interface ServiceOtifResponse {
  /** Whether the OTIF file is set up on the server (EXCEL_OTIF_PATH). */
  configured: boolean
  /** Why the file could not be read, when it could not. */
  error: string | null
  /** When the server last read the file, and when the file was last saved. */
  readAt: string | null
  fileModifiedAt: string | null
  counts: OtifCustomerCounts | null
  /** By week (its Saturday), for the Service score of a week. */
  weeks: OtifCustomerCounts | null
  unmatched: OtifCustomerTally['unmatched'] | null
}

/** The Saturday starting the company week (Saturday to Friday) a day falls in. */
export function saturdayOf(day: string): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
  const back = (new Date(t).getUTCDay() + 1) % 7
  return new Date(t - back * 86_400_000).toISOString().slice(0, 10)
}

/** A customer name as compared: case and spacing aside. */
export const customerKey = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase()

/**
 * Each coordinator's different customers per month (from `from` on), by PO
 * Closed Date. `coordinatorOf` turns the file's Relation Manager into a CRM
 * coordinator id (null when it is nobody's); orders still open (no closed
 * date) or with no customer name are not counted.
 */
export function countOtifCustomers(
  rows: readonly Pick<OtifLiveRow, 'poClosedDate' | 'customerName' | 'relationManager'>[],
  coordinatorOf: (relationManager: string | null) => string | null,
  from: string = OTIF_CUSTOMERS_FROM
): OtifCustomerTally {
  const seen = new Map<string, Set<string>>()
  const weekly = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.poClosedDate || !r.customerName) continue
    const month = r.poClosedDate.slice(0, 7)
    if (month < from) continue
    const id = coordinatorOf(r.relationManager)
    const who = id ? `c|${id}` : `u|${r.relationManager?.trim() || '(blank)'}`
    const key = `${month}|${who}`
    let set = seen.get(key)
    if (!set) seen.set(key, (set = new Set()))
    set.add(customerKey(r.customerName))
    if (id) {
      const wk = `${saturdayOf(r.poClosedDate)}|${id}`
      let ws = weekly.get(wk)
      if (!ws) weekly.set(wk, (ws = new Set()))
      ws.add(customerKey(r.customerName))
    }
  }
  const weeks: OtifCustomerCounts = {}
  for (const [key, set] of weekly) {
    const [week, id] = key.split('|')
    ;(weeks[week] ??= {})[id] = set.size
  }
  const counts: OtifCustomerCounts = {}
  const unmatched: OtifCustomerTally['unmatched'] = {}
  for (const [key, set] of seen) {
    const [month, kind, ...rest] = key.split('|')
    const name = rest.join('|')
    const into = kind === 'c' ? counts : unmatched
    ;(into[month] ??= {})[name] = set.size
  }
  return { counts, weeks, unmatched }
}
