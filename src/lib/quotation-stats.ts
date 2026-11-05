/**
 * Quotations: narrowing the list (dates, value) and measuring how the team
 * and each person perform. Read-only - it never changes a quotation.
 *
 * Value is the order amount, which the team records on a won (Closed)
 * quotation; open and lost ones carry none, so a value filter keeps only
 * quotations with an amount, and "value won" sums the closed ones.
 */

import { followupCount } from './quotations'
import type { Quotation, QuotationStatus } from './types'

/** The day a quotation counts on: when it was sent (else enquired, else entered). */
export const quotationDay = (q: Pick<Quotation, 'quotation_date' | 'inquiry_date' | 'created_at'>): string =>
  q.quotation_date ?? q.inquiry_date ?? q.created_at.slice(0, 10)

/** Which date a date range reads: when it was sent, or when it was decided. */
export type DateBasis = 'quotation' | 'closing'

export interface QuotationFilter {
  basis: DateBasis
  /** yyyy-mm-dd, inclusive; null = open-ended. */
  from: string | null
  to: string | null
  /** Order amount, inclusive; null = no bound. */
  minValue: number | null
  maxValue: number | null
}

export const NO_QUOTATION_FILTER: QuotationFilter = { basis: 'quotation', from: null, to: null, minValue: null, maxValue: null }

/** Whether a quotation passes the date and value filter. */
export function matchesQuotationFilter(q: Quotation, f: QuotationFilter): boolean {
  if (f.from || f.to) {
    const day = f.basis === 'closing' ? q.closing_date : quotationDay(q)
    // Read by closing date, an undecided quotation has no day and drops out.
    if (!day) return false
    if (f.from && day < f.from) return false
    if (f.to && day > f.to) return false
  }
  if (f.minValue !== null || f.maxValue !== null) {
    const amount = q.amount ?? null
    if (amount === null) return false
    if (f.minValue !== null && amount < f.minValue) return false
    if (f.maxValue !== null && amount > f.maxValue) return false
  }
  return true
}

export interface QuotationPerformance {
  quotations: number
  open: number
  closed: number
  lost: number
  /** Closed out of closed + lost, 0-100; null until something is decided. */
  winRate: number | null
  /** Order amount of the closed quotations. */
  valueWon: number
  /** Closed quotations that carry an amount (the average is over these). */
  valued: number
  averageOrder: number | null
  averageFollowups: number | null
  /** Days from the quotation to its closing, over closed ones with both dates. */
  averageDaysToClose: number | null
  newCustomers: number
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/** How a set of quotations performed. */
export function performanceOf(list: readonly Quotation[]): QuotationPerformance {
  const count = (s: QuotationStatus) => list.filter((q) => q.status === s).length
  const closed = list.filter((q) => q.status === 'closed')
  const valued = closed.filter((q) => (q.amount ?? 0) > 0)
  const valueWon = Math.round(valued.reduce((sum, q) => sum + (q.amount ?? 0), 0) * 100) / 100
  const timed = closed
    .filter((q) => q.quotation_date && q.closing_date)
    .map((q) => days(q.quotation_date!, q.closing_date!))
    .filter((d) => d >= 0)
  const decided = closed.length + count('lost')
  return {
    quotations: list.length,
    open: count('open'),
    closed: closed.length,
    lost: count('lost'),
    winRate: decided ? Math.round((closed.length / decided) * 100) : null,
    valueWon,
    valued: valued.length,
    averageOrder: valued.length ? Math.round(valueWon / valued.length) : null,
    averageFollowups: list.length ? Math.round((list.reduce((s, q) => s + followupCount(q), 0) / list.length) * 10) / 10 : null,
    averageDaysToClose: timed.length ? Math.round(timed.reduce((s, d) => s + d, 0) / timed.length) : null,
    newCustomers: list.filter((q) => q.customer_type === 'new').length,
  }
}

/** Performance per person ('' = not assigned to anyone in the CRM), biggest value won first. */
export function performanceByPerson(list: readonly Quotation[]): { personId: string; performance: QuotationPerformance }[] {
  const groups = new Map<string, Quotation[]>()
  for (const q of list) {
    const key = q.coordinator_id ?? ''
    groups.set(key, [...(groups.get(key) ?? []), q])
  }
  return [...groups.entries()]
    .map(([personId, rows]) => ({ personId, performance: performanceOf(rows) }))
    .sort((a, b) => b.performance.valueWon - a.performance.valueWon || b.performance.quotations - a.performance.quotations)
}

/** Counts by status and value won, month by month (yyyy-mm), oldest first, on the chosen date basis. */
export function monthlyPerformance(
  list: readonly Quotation[],
  basis: DateBasis
): { month: string; open: number; closed: number; lost: number; valueWon: number }[] {
  const months = new Map<string, { month: string; open: number; closed: number; lost: number; valueWon: number }>()
  for (const q of list) {
    const day = basis === 'closing' ? q.closing_date : quotationDay(q)
    if (!day) continue
    const month = day.slice(0, 7)
    const m = months.get(month) ?? { month, open: 0, closed: 0, lost: 0, valueWon: 0 }
    m[q.status] += 1
    if (q.status === 'closed') m.valueWon += q.amount ?? 0
    months.set(month, m)
  }
  return [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ ...m, valueWon: Math.round(m.valueWon * 100) / 100 }))
}
