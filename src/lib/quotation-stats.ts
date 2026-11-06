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

/** Which date a date range reads: when it was sent, when it was decided, or when the enquiry came in. */
export type DateBasis = 'quotation' | 'closing' | 'enquiry'

/** The day a quotation counts on for that basis; null when it has none (an open one has no closing date). */
export function dayFor(q: Pick<Quotation, 'quotation_date' | 'inquiry_date' | 'closing_date' | 'created_at'>, basis: DateBasis): string | null {
  if (basis === 'closing') return q.closing_date
  if (basis === 'enquiry') return q.inquiry_date ?? quotationDay(q)
  return quotationDay(q)
}

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
    const day = dayFor(q, f.basis)
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

/* ===================== Score and conversions (the team's sheet format, 5 Nov 2026) ===================== */

/** Points per quotation: winning a new customer is worth twice winning more work from an existing one. */
export const QUOTATION_SCORE = { closedNew: 100, closedExisting: 50, other: 0 } as const

/**
 * A quotation's score: Closed + New customer = 100, Closed + Existing = 50,
 * anything else (Open, Lost, or a closed one with no customer type) = 0.
 * Same as the sheet's =IF(K2="Closed", IF(L2="new",100, IF(L2="existing",50,0)), 0).
 */
export function quotationScore(q: Pick<Quotation, 'status' | 'customer_type'>): number {
  if (q.status !== 'closed') return QUOTATION_SCORE.other
  if (q.customer_type === 'new') return QUOTATION_SCORE.closedNew
  if (q.customer_type === 'existing') return QUOTATION_SCORE.closedExisting
  return QUOTATION_SCORE.other
}

/** Quotations and conversions (closed = converted), split by new and existing customers, with the score. */
export interface ConversionSummary {
  quotations: number
  newQuotations: number
  existingQuotations: number
  conversions: number
  newConversions: number
  existingConversions: number
  /** Converted out of all quotations, 0-100; null with none. */
  conversionRate: number | null
  /** Order value of the conversions (only a Closed quotation carries an amount). */
  amount: number
  score: number
  /** Different customers quoted (names compared ignoring case and spaces), as the sheet's COUNT OF CUSTOMER. */
  customers: number
  /** Score ÷ customers, as the sheet's AVG SCORE; null with no customers. */
  averageScore: number | null
}

const customerKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export function conversionsOf(list: readonly Quotation[]): ConversionSummary {
  const closed = list.filter((q) => q.status === 'closed')
  const score = list.reduce((sum, q) => sum + quotationScore(q), 0)
  const customers = new Set(list.map((q) => customerKey(q.customer_name))).size
  return {
    quotations: list.length,
    newQuotations: list.filter((q) => q.customer_type === 'new').length,
    existingQuotations: list.filter((q) => q.customer_type === 'existing').length,
    conversions: closed.length,
    newConversions: closed.filter((q) => q.customer_type === 'new').length,
    existingConversions: closed.filter((q) => q.customer_type === 'existing').length,
    conversionRate: list.length ? Math.round((closed.length / list.length) * 100) : null,
    amount: Math.round(closed.reduce((sum, q) => sum + (q.amount ?? 0), 0) * 100) / 100,
    score,
    customers,
    averageScore: customers ? Math.round((score / customers) * 100) / 100 : null,
  }
}

/**
 * Conversions per person ('' = not assigned to anyone in the CRM). Everyone in
 * `people` gets a line, at zero when they sent nothing in the period, as the
 * sheet lists every coordinator. Highest average score first, then total score.
 */
export function conversionsByPerson(
  list: readonly Quotation[],
  people: readonly string[] = []
): { personId: string; summary: ConversionSummary }[] {
  const groups = new Map<string, Quotation[]>(people.map((id) => [id, []]))
  for (const q of list) {
    const key = q.coordinator_id ?? ''
    groups.set(key, [...(groups.get(key) ?? []), q])
  }
  return [...groups.entries()]
    .map(([personId, rows]) => ({ personId, summary: conversionsOf(rows) }))
    .sort(
      (a, b) =>
        (b.summary.averageScore ?? -1) - (a.summary.averageScore ?? -1) ||
        b.summary.score - a.summary.score ||
        b.summary.quotations - a.summary.quotations
    )
}

/** Counts by status and value won, month by month (yyyy-mm), oldest first, on the chosen date basis. */
export function monthlyPerformance(
  list: readonly Quotation[],
  basis: DateBasis
): { month: string; open: number; closed: number; lost: number; valueWon: number }[] {
  const months = new Map<string, { month: string; open: number; closed: number; lost: number; valueWon: number }>()
  for (const q of list) {
    const day = dayFor(q, basis)
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
