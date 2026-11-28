/**
 * Active Payments by customer (21 Nov 2026): one line per customer with their
 * open invoices under it.
 *
 * The user's definitions, all from the invoices shown under the customer:
 *   - Total Amount: the full value of the open invoices;
 *   - Total Outstanding: what is still unpaid on them;
 *   - Overdue: the unpaid balance of invoices whose due date has passed;
 *   - Overdue in 7 days: the unpaid balance due from today to seven days ahead.
 * Fully paid and set-aside invoices are not part of any figure.
 */

import { ATTENTION_ORDER, companyAttention, type Attention } from './attention'
import { normalizeBpCode } from './bp-code'
import { isSetAside } from './no-followup'
import type { Company } from './types'
import { addDaysISO, parseISODate, todayISO } from './utils'

export const OVERDUE_SOON_DAYS = 7

export interface CustomerAccount {
  key: string
  code: string | null
  name: string
  /** Open invoices, the oldest due date first. */
  invoices: Company[]
  /** The invoice a customer follow-up is filed on: the one due last, so the last likely to close. */
  lead: Company
  totalAmount: number
  outstanding: number
  overdue: number
  overdueIn7Days: number
  overdueInvoices: number
  overdueIn7DaysInvoices: number
  /** The oldest due date among the overdue invoices, else among the open ones. */
  oldestDueDate: string | null
  /** Days past due of the oldest overdue invoice; 0 when nothing is overdue. */
  maxDaysOverdue: number
  /** The most serious status among the invoices. */
  status: string
}

const STATUS_ORDER = ['critical', 'overdue', 'upcoming', 'current']
const paise = (rupees: number | null | undefined) => Math.round((Number(rupees) || 0) * 100)
const dayOf = (date: string | null | undefined) => (date ? date.slice(0, 10) : null)

export const customerKeyOf = (invoice: Pick<Company, 'id' | 'sap_bp_code'>) => {
  const code = normalizeBpCode(invoice.sap_bp_code)
  return code ? `bp:${code}` : `company:${invoice.id}`
}

export const isWorkingInvoice = (invoice: Company) => invoice.status !== 'paid' && !isSetAside(invoice)

/**
 * The invoice's full value: the file's Gross Amount (the Active Payment query since 28 Nov 2026)
 * or Invoice Total (the query before), else its balance when the file gave neither.
 */
export function invoiceValue(invoice: Company): number {
  const extra = (invoice.extra_fields as Record<string, unknown> | null | undefined) ?? {}
  for (const raw of [extra['Gross Amount'], extra['Invoice Total']]) {
    const value = Number(String(raw ?? '').replace(/,/g, ''))
    if (raw !== undefined && raw !== null && raw !== '' && Number.isFinite(value) && value > 0) return value
  }
  return invoice.total_amount || 0
}

export function daysPastDue(dueDate: string | null | undefined, today: string = todayISO()): number {
  const due = dayOf(dueDate)
  if (!due || due >= today) return 0
  return Math.round((parseISODate(today).getTime() - parseISODate(due).getTime()) / 86_400_000)
}

function accountOf(key: string, invoices: Company[], today: string): CustomerAccount {
  const sorted = [...invoices].sort((a, b) => (dayOf(a.due_date) ?? '9999').localeCompare(dayOf(b.due_date) ?? '9999'))
  const soonEnd = addDaysISO(today, OVERDUE_SOON_DAYS)
  let total = 0
  let outstanding = 0
  let overdue = 0
  let soon = 0
  let overdueInvoices = 0
  let soonInvoices = 0
  let oldestOverdue: string | null = null
  for (const invoice of sorted) {
    const balance = paise(invoice.total_amount)
    const due = dayOf(invoice.due_date)
    total += paise(invoiceValue(invoice))
    outstanding += balance
    if (due && due < today) {
      overdue += balance
      overdueInvoices++
      oldestOverdue ??= due
    } else if (due && due <= soonEnd) {
      soon += balance
      soonInvoices++
    }
  }
  const statusRank = (s: string | null | undefined) => {
    const at = STATUS_ORDER.indexOf(String(s))
    return at < 0 ? STATUS_ORDER.length : at
  }
  const worst = [...sorted].sort((a, b) => statusRank(a.status) - statusRank(b.status))[0]
  const lead = [...sorted].reverse().find((i) => i.due_date) ?? sorted[sorted.length - 1]
  return {
    key,
    code: normalizeBpCode(sorted[0].sap_bp_code),
    name: sorted[0].name,
    invoices: sorted,
    lead,
    totalAmount: total / 100,
    outstanding: outstanding / 100,
    overdue: overdue / 100,
    overdueIn7Days: soon / 100,
    overdueInvoices,
    overdueIn7DaysInvoices: soonInvoices,
    oldestDueDate: oldestOverdue ?? dayOf(sorted.find((i) => i.due_date)?.due_date),
    maxDaysOverdue: oldestOverdue ? daysPastDue(oldestOverdue, today) : 0,
    status: String(worst.status),
  }
}

/** One account per customer, in the order each customer first appears. */
export function groupCustomers(invoices: readonly Company[], today: string = todayISO()): CustomerAccount[] {
  const byKey = new Map<string, Company[]>()
  for (const invoice of invoices) {
    const key = customerKeyOf(invoice)
    const list = byKey.get(key)
    if (list) list.push(invoice)
    else byKey.set(key, [invoice])
  }
  return [...byKey].map(([key, list]) => accountOf(key, list, today))
}

/**
 * The whole customer behind one invoice, or null when that invoice is not being
 * chased (paid or set aside), which keeps its own single-invoice view.
 */
export function customerOfInvoice(
  invoice: Company,
  all: readonly Company[],
  options: { sameOwnerOnly?: boolean; today?: string } = {}
): CustomerAccount | null {
  if (!isWorkingInvoice(invoice)) return null
  const key = customerKeyOf(invoice)
  const mine = all.filter(
    (c) =>
      customerKeyOf(c) === key &&
      isWorkingInvoice(c) &&
      (!options.sameOwnerOnly || c.assigned_coordinator_id === invoice.assigned_coordinator_id)
  )
  return accountOf(key, mine.length ? mine : [invoice], options.today ?? todayISO())
}

/** Every invoice id of this customer, paid and set aside too: their follow-up history is one history. */
export function customerInvoiceIds(invoice: Pick<Company, 'id' | 'sap_bp_code'>, all: readonly Company[]): string[] {
  const key = customerKeyOf(invoice)
  return all.filter((c) => customerKeyOf(c) === key).map((c) => c.id)
}

/** The most urgent reason among the customer's invoices. */
export function customerAttention(customer: CustomerAccount, today: string = todayISO()): Attention | null {
  let best: Attention | null = null
  for (const invoice of customer.invoices) {
    const here = companyAttention(invoice, today)
    if (!here) continue
    const rank = ATTENTION_ORDER.indexOf(here.reason)
    const bestRank = best ? ATTENTION_ORDER.indexOf(best.reason) : Number.POSITIVE_INFINITY
    if (rank < bestRank || (rank === bestRank && here.urgency < (best as Attention).urgency)) best = here
  }
  return best
}

/**
 * The customer with only the ticked invoices, every total worked again from
 * them (23 Nov 2026). No list (null) is all of them; nothing ticked is null.
 */
export function pickedInvoices(
  customer: CustomerAccount,
  ids: readonly string[] | null,
  today: string = todayISO()
): CustomerAccount | null {
  if (!ids) return customer
  const wanted = new Set(ids)
  const kept = customer.invoices.filter((i) => wanted.has(i.id))
  if (!kept.length) return null
  return kept.length === customer.invoices.length ? customer : accountOf(customer.key, kept, today)
}

/** What a reminder to the whole customer asks for: the overdue money, or all of it when nothing is overdue yet. */
export function customerReminderAmount(customer: CustomerAccount): number {
  return customer.overdue > 0 ? customer.overdue : customer.outstanding
}
