/**
 * Pre Sales Analysis (14 Nov 2026), shared by the browser and the server.
 *
 * The Pre-Sales-Order-CRM workbook lists every sales-order line (customer,
 * coordinator, SO, date, item, quantity). The page compares the same months
 * last year with this year, item by item, so a coordinator can follow up a
 * customer about each item they ordered then and have not ordered yet. No
 * imports, so the server can use it.
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

/** An item's key: its code, or its name when it has no code. */
export const itemKeyOf = (line: Pick<PresalesLine, 'ic' | 'in'>) => line.ic || line.in

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

/** How the customer was reached, as in the Active/Overdue follow-ups. */
export const PRESALES_MODES = [
  { id: 'call', label: 'Call' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'in_person', label: 'In person' },
  { id: 'other', label: 'Other' },
] as const
export type PresalesMode = (typeof PRESALES_MODES)[number]['id']

/** What the customer said, in the user's six choices (14 Nov 2026). */
export const PRESALES_RESPONSES = [
  { id: 'will_order', label: 'Will order' },
  { id: 'order_expected', label: 'Order expected on a date' },
  { id: 'samples_quote', label: 'Need samples / new quote' },
  { id: 'not_this_season', label: 'Not needed this season' },
  { id: 'no_response', label: 'No response' },
  { id: 'other_supplier', label: 'Moved to another supplier' },
] as const
export type PresalesResponseId = (typeof PRESALES_RESPONSES)[number]['id']

/**
 * A pre-sales follow-up (14 Nov 2026: the user asked for it to work like the
 * Active/Overdue follow-ups): which of the customer's items it was about, how,
 * what the customer said, and when to follow up next.
 */
export interface PresalesFollowup {
  id: string
  customerCode: string
  /** The items talked about (itemKeyOf). */
  items: string[]
  at: string
  by: string
  byName: string
  mode: PresalesMode
  response: PresalesResponseId
  /** What the customer said. */
  said: string
  /** For "Order expected on a date". */
  expectedOrderDate: string | null
  /** The items show as to remind again from this day (30 days after the follow-up when empty). */
  nextDate: string | null
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
  /** The customers this person may see (a coordinator: only their own). */
  customers: PresalesCustomer[]
  lines: PresalesLine[]
  followups: PresalesFollowup[]
  /** Lines the reader skipped (no customer code or no date). */
  skipped: number
}
