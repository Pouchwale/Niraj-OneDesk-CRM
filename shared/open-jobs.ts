/**
 * Open jobs from the inventory app (27 Nov 2026, the user's request), and the
 * customer update each one needs.
 *
 * The inventory app's API (read-only) gives two reports, Open Jobs — Pouch and
 * Open Jobs — Label & Sleeve, with PO No. (SAP's production order), PO Date,
 * Due Date and Po RFD Date. The server reads them (server/modules/open-jobs);
 * the customer and coordinator come from the API's own columns only (the
 * user's choice); the Service-AutoPO workbook (LOGISTIC_APP) adds the SO
 * number, FG code and job name.
 *
 * The user's rule: from 3 days before the Due Date the coordinator emails the
 * customer how the RFD Date stands against the Due Date:
 *   RFD before Due  → Early, by that many days
 *   RFD on Due      → On Time
 *   RFD after Due   → Delay, by that many days
 * A PO with no RFD date yet (the API's 01/01/1900) waits until one appears.
 * A "|MANUAL" RFD date counts like any other (the user: it is updated by date
 * later, and once a date is there it is considered).
 * Telling the customer is saved as a Service record (Information Date = the
 * day, 10 points), with Final dispatch = the RFD date told; when the RFD date
 * changes afterwards the customer needs telling again.
 */

export const OPEN_JOBS_ROUTE = '/api/open-jobs'

/** The inventory app's reports this reads, in the order shown. */
export const OPEN_JOB_REPORTS = [
  { id: 'bom-pouch-open', label: 'Pouch' },
  { id: 'bom-label-sleeve-open', label: 'Label & Sleeve' },
] as const
export type OpenJobReport = (typeof OPEN_JOB_REPORTS)[number]['id']

/**
 * Live for the administrator only while they verify it (27 Nov 2026, the user:
 * "just live it on admin side to verify"): no tab, list or pop-up for anyone
 * else, and the server answers nobody else. Set false to open it to everyone.
 */
export const CUSTOMER_UPDATES_ADMIN_ONLY = true

/** Whether this role sees Customer updates now. */
export const seesCustomerUpdates = (role: string | null | undefined) => (CUSTOMER_UPDATES_ADMIN_ONLY ? role === 'admin' : Boolean(role))

/** Days before the Due Date the customer is to be told. */
export const TELL_DAYS_BEFORE_DUE = 3

export type UpdateStatus = 'Early' | 'On Time' | 'Delay'

export interface OpenJob {
  poNo: string
  report: OpenJobReport
  /** yyyy-mm-dd */
  poDate: string | null
  /** yyyy-mm-dd */
  dueDate: string | null
  /** yyyy-mm-dd; null while the inventory app has none (01/01/1900). */
  rfdDate: string | null
  /** The RFD date was written "…|MANUAL" in the inventory app. */
  rfdManual: boolean
  customerName: string | null
  /** The coordinator as the API or Service-AutoPO writes the name. */
  coordinatorName: string | null
  /** The CRM coordinator that name is; null when it is nobody's. */
  coordinatorId: string | null
  salesOrderNo: string | null
  fgCode: string | null
  jobName: string | null
  /** 'api' when the API sent the customer or coordinator. */
  detailsFrom: 'api' | null
}

export interface OpenJobsResponse {
  /** Whether the inventory API is set up on the server. */
  configured: boolean
  /** Why the last read failed, when it failed and nothing older is held. */
  error: string | null
  /** When the jobs were read from the inventory app (ISO). */
  fetchedAt: string | null
  jobs: OpenJob[]
}

/* ===================== Reading the API's cells ===================== */

const iso = (y: number, m: number, d: number): string | null => {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

/** PO Date and Due Date: month first, "11/26/26" or "11/26/2026". */
export function monthFirstDate(value: unknown): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/.exec(String(value ?? ''))
  if (!m) return null
  const year = fullYear(m[3])
  return year <= 1900 ? null : iso(year, Number(m[1]), Number(m[2]))
}

/** Po RFD Date: day first, "30/11/2026", maybe "…|MANUAL"; 01/01/1900 is no date. */
export function rfdDateOf(value: unknown): { date: string | null; manual: boolean } {
  const [datePart, ...rest] = String(value ?? '').split('|')
  const manual = rest.some((r) => r.trim().toUpperCase() === 'MANUAL')
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\s*$/.exec(datePart)
  if (!m) return { date: null, manual }
  const year = fullYear(m[3])
  return { date: year <= 1900 ? null : iso(year, Number(m[2]), Number(m[1])), manual }
}

/** A header as compared: case, spacing, dots and dashes aside ("Co-ordinator Name" = "Coordinator Name"). */
export const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The columns the API may carry beyond its four, by the names it may use. */
export const API_DETAIL_HEADERS = {
  customer: ['Customer Name', 'Customer', 'BP Name', 'Card Name'],
  coordinator: ['Coordinator Name', 'Co-ordinator Name', 'Coordinator', 'Co-Ordinator'],
  salesOrder: ['SO Number', 'SO No.', 'SO No', 'Sales Order No', 'Sales Order No.', 'Sales Order Number'],
  fg: ['FG Item Code', 'FG Code', 'Item Code'],
  job: ['Job Name', 'Item Name', 'FG Item Name'],
} as const

/** A row's value for any of these header names. */
export function cellFor(row: Record<string, unknown>, names: readonly string[]): string | null {
  const wanted = new Set(names.map(headerKey))
  for (const [k, v] of Object.entries(row)) {
    if (!wanted.has(headerKey(k))) continue
    const text = String(v ?? '').trim()
    if (text) return text
  }
  return null
}

/* ===================== The rule ===================== */

const DAY = 24 * 60 * 60 * 1000
const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DAY
/** Whole days from a to b (b − a). */
export const daysFrom = (a: string, b: string) => Math.round(dayNumber(b) - dayNumber(a))
export function addDays(d: string, n: number): string {
  const t = new Date((dayNumber(d) + n) * DAY)
  return t.toISOString().slice(0, 10)
}

/** How the RFD date stands against the Due Date; null without both. */
export function updateStatus(job: Pick<OpenJob, 'rfdDate' | 'dueDate'>): { status: UpdateStatus; days: number } | null {
  if (!job.rfdDate || !job.dueDate) return null
  const late = daysFrom(job.dueDate, job.rfdDate)
  return { status: late > 0 ? 'Delay' : late < 0 ? 'Early' : 'On Time', days: Math.abs(late) }
}

/** The day from which the customer is to be told: 3 days before the Due Date. */
export const tellFrom = (dueDate: string) => addDays(dueDate, -TELL_DAYS_BEFORE_DUE)

/** A Service record as far as "was the customer told this RFD date?" needs it. */
export interface ToldRecord {
  po_no: string | null
  final_dispatch_date: string | null
  information_date: string | null
}

const poMatch = (a: string | null | undefined, b: string) => String(a ?? '').trim().replace(/\s+/g, '').toUpperCase() === b.trim().replace(/\s+/g, '').toUpperCase()

/** The Service record that told the customer this PO's current RFD date, if any. */
export function toldRecord<T extends ToldRecord>(job: Pick<OpenJob, 'poNo' | 'rfdDate'>, records: readonly T[]): T | null {
  if (!job.rfdDate) return null
  return records.find((r) => r.information_date && poMatch(r.po_no, job.poNo) && r.final_dispatch_date === job.rfdDate) ?? null
}

export interface CustomerUpdate {
  job: OpenJob
  status: UpdateStatus
  /** Days early or late (0 on time). */
  days: number
  /** yyyy-mm-dd: 3 days before the Due Date. */
  tellFrom: string
  /** Whether the customer is to be told now (today is on or after tellFrom). */
  due: boolean
  /** Whether a Service record already told them this RFD date. */
  told: boolean
}

/** Every open job with an RFD and a Due date, graded; the ones to tell now first, the most overdue first. */
export function customerUpdates(jobs: readonly OpenJob[], records: readonly ToldRecord[], today: string): CustomerUpdate[] {
  const out: CustomerUpdate[] = []
  for (const job of jobs) {
    const s = updateStatus(job)
    if (!s || !job.dueDate) continue
    const from = tellFrom(job.dueDate)
    out.push({ job, status: s.status, days: s.days, tellFrom: from, due: today >= from, told: Boolean(toldRecord(job, records)) })
  }
  return out.sort(
    (a, b) =>
      Number(b.due && !b.told) - Number(a.due && !a.told) ||
      a.tellFrom.localeCompare(b.tellFrom) ||
      a.job.poNo.localeCompare(b.job.poNo)
  )
}

/** The updates waiting on the coordinator now: due and not told. */
export const pendingUpdates = (updates: readonly CustomerUpdate[]) => updates.filter((u) => u.due && !u.told)

/** A key for one PO at one RFD date: a new RFD date is a new update to give. */
export const updateKey = (u: Pick<CustomerUpdate, 'job'>) => `${u.job.poNo}|${u.job.rfdDate ?? ''}`
