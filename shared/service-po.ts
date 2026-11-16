/**
 * Service → new record: the PO lookup (16 Nov 2026, the user's request). The
 * server reads the Service-AutoPO workbook (SERVICE_PO_PATH) and answers for
 * one PO number at a time; the sheet itself is never sent to anyone. Typing a
 * PO no. fills Customer name, Sales order no, FG code and Original SO dispatch
 * date (the sheet's Due Date), all still editable; the Coordinator stays as
 * chosen. A PO the sheet does not have is said so, and filled in by hand.
 */

export const SERVICE_PO_ROUTE = '/api/service-po'

export interface ServicePoMatch {
  poNo: string
  customerName: string | null
  salesOrderNo: string | null
  fgCode: string | null
  /** yyyy-mm-dd: the sheet's Due Date, the record's Original SO dispatch date. */
  dueDate: string | null
}

export interface ServicePoResponse {
  /** Whether the Service-AutoPO file is set up on the server. */
  configured: boolean
  /** Why the file could not be read, when it could not. */
  error: string | null
  /** The PO's details; null when the sheet does not have that PO. */
  match: ServicePoMatch | null
}

/** A PO number as compared: spaces and case aside ("91662", " 91662 ", 91662.0 all match). */
export function poKey(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase()
}
