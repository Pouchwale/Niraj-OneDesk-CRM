/**
 * Summary tables, the way the team's pivot sheet lays them out (6 Nov 2026):
 * one table per group (Regular, Dispute, Export, No follow-up, Bankrupt), one
 * line per coordinator with the number of customers, the balance and the
 * balance by age, and a grand total.
 *
 * Overdue Payments reads the ageing buckets the file gives. Active Payments
 * puts each open invoice in a bucket by days past its due date, and counts a
 * customer once however many invoices they have.
 */

import { isBankrupt, isNoFollowup, setAsideKindOf, type BankruptFields, type NoFollowupFields } from './no-followup'
import type { Company, OverduePayment } from './types'

export type SummaryGroup = 'regular' | 'dispute' | 'export' | 'no_followup' | 'bankrupt'

/** In the sheet's order; the colours follow its header bars. */
export const SUMMARY_GROUPS: { key: SummaryGroup; label: string; bar: string }[] = [
  { key: 'regular', label: 'Regular Customer', bar: 'bg-emerald-500/90 text-white' },
  { key: 'dispute', label: 'Dispute Account', bar: 'bg-amber-400 text-amber-950' },
  { key: 'export', label: 'Export Customer', bar: 'bg-sky-300 text-sky-950 dark:bg-sky-400' },
  { key: 'no_followup', label: 'Do Not take Follow-up', bar: 'bg-rose-300 text-rose-950 dark:bg-rose-400' },
  { key: 'bankrupt', label: 'Bankrupt', bar: 'bg-slate-400 text-slate-950' },
]

/** Which group a record is in, or null when there is nothing owed to show. */
export function summaryGroupOf(record: NoFollowupFields & BankruptFields): SummaryGroup {
  if (isBankrupt(record)) return 'bankrupt'
  if (!isNoFollowup(record)) return 'regular'
  const kind = setAsideKindOf(record)
  return kind === 'plain' ? 'no_followup' : kind
}

export interface SummaryLine {
  /** null = not assigned to anyone in the CRM. */
  ownerId: string | null
  customers: number
  balance: number
  /** One amount per age column, in the order of the column labels. */
  buckets: number[]
}

export interface SummaryTable {
  group: SummaryGroup
  lines: SummaryLine[]
  total: SummaryLine
}

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * The tables for a set of records. `customerOf` says which customer a record
 * belongs to, so a customer with several records is counted once per line.
 * Lines are in the order `nameOf` gives, unassigned last; empty groups are kept
 * (with no lines) so the screen can say so.
 */
export function buildSummary<T>(
  records: readonly T[],
  options: {
    columns: number
    groupOf: (r: T) => SummaryGroup | null
    ownerOf: (r: T) => string | null
    customerOf: (r: T) => string
    balanceOf: (r: T) => number
    bucketsOf: (r: T) => number[]
    nameOf: (ownerId: string | null) => string
  }
): SummaryTable[] {
  const empty = (ownerId: string | null): SummaryLine & { seen: Set<string> } => ({
    ownerId,
    customers: 0,
    balance: 0,
    buckets: Array(options.columns).fill(0),
    seen: new Set(),
  })
  const groups = new Map<SummaryGroup, Map<string, ReturnType<typeof empty>>>(SUMMARY_GROUPS.map((g) => [g.key, new Map()]))

  for (const r of records) {
    const group = options.groupOf(r)
    if (!group) continue
    const owner = options.ownerOf(r)
    const lines = groups.get(group)!
    const key = owner ?? ''
    const line = lines.get(key) ?? empty(owner)
    lines.set(key, line)
    line.seen.add(options.customerOf(r))
    line.balance += options.balanceOf(r) || 0
    options.bucketsOf(r).forEach((v, i) => (line.buckets[i] += v || 0))
  }

  return SUMMARY_GROUPS.map(({ key }) => {
    const lines = [...groups.get(key)!.values()]
      .map(({ seen, ...l }) => ({ ...l, customers: seen.size, balance: round2(l.balance), buckets: l.buckets.map(round2) }))
      .sort((a, b) => (a.ownerId === null ? 1 : b.ownerId === null ? -1 : options.nameOf(a.ownerId).localeCompare(options.nameOf(b.ownerId))))
    const total: SummaryLine = {
      ownerId: null,
      customers: lines.reduce((s, l) => s + l.customers, 0),
      balance: round2(lines.reduce((s, l) => s + l.balance, 0)),
      buckets: Array.from({ length: options.columns }, (_, i) => round2(lines.reduce((s, l) => s + l.buckets[i], 0))),
    }
    return { group: key, lines, total }
  })
}

/* ===================== Overdue Payments ===================== */

export const OVERDUE_SUMMARY_COLUMNS = ['0 - 30', '31 - 60', '61 - 90', '91 - 120', '121+']

export function overdueSummary(rows: readonly OverduePayment[], nameOf: (id: string | null) => string): SummaryTable[] {
  return buildSummary(rows, {
    columns: OVERDUE_SUMMARY_COLUMNS.length,
    // A settled row owes nothing; everything else is in exactly one table.
    groupOf: (p) => (p.status === 'settled' ? null : summaryGroupOf(p)),
    ownerOf: (p) => p.assigned_coordinator_id,
    customerOf: (p) => (p.bp_code || p.customer_name || p.id).trim().toUpperCase(),
    balanceOf: (p) => p.balance_due,
    bucketsOf: (p) => [p.due_0_30, p.due_31_60, p.due_61_90, p.due_91_120, p.due_121_plus],
    nameOf,
  })
}

/* ===================== Active Payments ===================== */

export const ACTIVE_SUMMARY_COLUMNS = ['Not yet due', '0 - 30', '31 - 60', '61 - 90', '91 - 120', '121+']

const DAY = 86_400_000

/** Days past the due date (negative before it); null without a due date. */
export function daysPastDue(dueDate: string | null | undefined, today: string): number | null {
  if (!dueDate) return null
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`)) / DAY)
}

/** The column an invoice's amount goes in: 0 = not yet due (or no due date), then 0-30 … 121+. */
export function activeBucketOf(dueDate: string | null | undefined, today: string): number {
  const days = daysPastDue(dueDate, today)
  if (days === null || days < 0) return 0
  if (days <= 30) return 1
  if (days <= 60) return 2
  if (days <= 90) return 3
  if (days <= 120) return 4
  return 5
}

export function activeSummary(invoices: readonly Company[], today: string, nameOf: (id: string | null) => string): SummaryTable[] {
  return buildSummary(invoices, {
    columns: ACTIVE_SUMMARY_COLUMNS.length,
    // A paid invoice owes nothing.
    groupOf: (c) => (c.status === 'paid' ? null : summaryGroupOf(c)),
    ownerOf: (c) => c.assigned_coordinator_id,
    customerOf: (c) => (c.sap_bp_code || c.name || c.id).trim().toUpperCase(),
    balanceOf: (c) => c.total_amount || 0,
    bucketsOf: (c) => {
      const out = Array(ACTIVE_SUMMARY_COLUMNS.length).fill(0)
      out[activeBucketOf(c.due_date, today)] = c.total_amount || 0
      return out
    },
    nameOf,
  })
}

/* ===================== Excel ===================== */

/** All tables on one sheet, stacked like the pivot sheet: a title row, a header row, the lines, the grand total. */
export function summarySheetRows(tables: SummaryTable[], columns: string[], nameOf: (id: string | null) => string): (string | number)[][] {
  const out: (string | number)[][] = []
  for (const t of tables) {
    if (t.lines.length === 0) continue
    const label = SUMMARY_GROUPS.find((g) => g.key === t.group)!.label
    if (out.length) out.push([])
    out.push([label])
    out.push(['Coordinator Name', 'Count of Customers', 'Sum of Balance', ...columns.map((c) => `Sum of ${c}`)])
    for (const l of t.lines) out.push([nameOf(l.ownerId), l.customers, l.balance, ...l.buckets])
    out.push(['Grand Total', t.total.customers, t.total.balance, ...t.total.buckets])
  }
  return out
}
