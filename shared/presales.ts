/**
 * Pre Sales Analysis (14 Nov 2026), shared by the browser and the server.
 *
 * The Pre-Sales-Order-CRM workbook lists every sales-order line (customer,
 * coordinator, SO, date, item, quantity). The page compares the same months
 * last year with this year, so a coordinator can remind a customer who
 * ordered then and has not ordered yet. No imports, so the server can use it.
 */

export const PRESALES_ROUTE = '/api/presales'

/** One sales-order line, as the server sends it (short keys: there are ~20,000). */
export interface PresalesLine {
  /** Customer Code ("C0276"), upper case. */
  c: string
  /** SO No, with its series ("202627/34001"). */
  so: string
  /** SO Date, yyyy-mm-dd. */
  d: string
  /** Item Code. */
  ic: string
  /** Item Name. */
  in: string
  /** Quantity. */
  q: number
}

export interface PresalesCustomer {
  code: string
  name: string
  /**
   * Whose customer this is: the coordinator the CRM assigns its customer code
   * to, or (no CRM account) the coordinator named on its latest order in the
   * file, when that name matches exactly one CRM coordinator; null otherwise.
   */
  coordinatorId: string | null
  /** Where the coordinator came from: the CRM account, the file's name, or nowhere. */
  assignedFrom: 'crm' | 'file' | null
  /** The coordinator name on the customer's latest order in the file (shown for customers not in the CRM). */
  fileCoordinator: string | null
}

export interface PresalesReminder {
  id: string
  customerCode: string
  at: string
  by: string
  byName: string
  note: string | null
}

export interface PresalesFile {
  configured: boolean
  name: string | null
  /** When the workbook was last saved. */
  modifiedAt: string | null
  /** Why it could not be read. */
  error: string | null
}

export interface PresalesResponse {
  file: PresalesFile
  /** When the server last read the workbook. */
  readAt: string | null
  /** The customers this person may see (a coordinator: only those the CRM assigns to them). */
  customers: PresalesCustomer[]
  lines: PresalesLine[]
  reminders: PresalesReminder[]
  /** Lines the reader skipped (no customer code or no date). */
  skipped: number
}
