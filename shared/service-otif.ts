/**
 * The Service score's Total Customers, from OTIF (16 Nov 2026, the user's
 * rules): from November 2026 on, a coordinator's Total Customers for a month
 * is the number of different customers in the OTIF-SCORE file whose
 * production order closed that month (PO Closed Date) under that coordinator
 * as Relation Manager. Nobody types it any more; months before November 2026
 * keep the numbers that were typed. The mails stay every Service record of
 * the coordinator in the period.
 */

import type { OtifLiveRow } from './otif-reports'

export const SERVICE_OTIF_ROUTE = '/api/service-otif'

/** The first month whose Total Customers comes from OTIF (yyyy-mm); earlier months keep the typed numbers. */
export const OTIF_CUSTOMERS_FROM = '2026-11'

/** month (yyyy-mm) → coordinator id → different customers. */
export type OtifCustomerCounts = Record<string, Record<string, number>>

export interface OtifCustomerTally {
  counts: OtifCustomerCounts
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
  unmatched: OtifCustomerTally['unmatched'] | null
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
  }
  const counts: OtifCustomerCounts = {}
  const unmatched: OtifCustomerTally['unmatched'] = {}
  for (const [key, set] of seen) {
    const [month, kind, ...rest] = key.split('|')
    const name = rest.join('|')
    const into = kind === 'c' ? counts : unmatched
    ;(into[month] ??= {})[name] = set.size
  }
  return { counts, unmatched }
}
