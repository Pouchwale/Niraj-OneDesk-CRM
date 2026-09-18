/**
 * The receivables book: every customer who owes money, counted once.
 *
 * The same customer usually exists twice - an Active Payments record and a
 * row in the ageing report - and each screen used to add up a different pair of
 * sources. The Overview said one total, the dashboard another, the assistant a
 * third, and every one of them was arithmetically right about its own inputs.
 *
 * This module is the single definition the summary screens share. A customer
 * is identified by BP code; where the three sources disagree on the amount,
 * the record the team actually works from wins:
 *
 *   1. the Active Payments record - it is what a coordinator opens, chases
 *      and settles with a follow-up;
 *   2. the ageing row - the uploaded balance, when there is no invoice record.
 *
 * A record marked paid or settled still claims its BP code, so a stale row in
 * another source cannot resurrect a customer the team has closed.
 */

import type { Company, OverduePayment } from './types'
import { normalizeBpCode } from './bp-code'
import { accountKeyOf } from './account-key'
import { isSetAside } from './no-followup'
import { DAY_MS } from './constants'
import { LEDGER_CRITICAL_AFTER_DAYS } from './status-rules'

export type BookSource = 'company' | 'ageing'

export interface BookAccount {
  /** `bp:<code>` when the customer has a BP code, else the record's own id. */
  key: string
  bpCode: string | null
  name: string
  coordinatorId: string | null
  /** Which record supplied the figures. */
  source: BookSource
  outstanding: number
  /** The part of the balance that is past its due date. */
  pastDue: number
  isOverdue: boolean
  /** Past 90 days: a critical account record, a 91+ bucket, or an invoice that old. */
  isCritical: boolean
  /** The company has gone under. Still owed, still counted, nobody to chase. */
  isBankrupt: boolean
  criticalAmount: number
  /** Whole days past the oldest due date, where a date is known. */
  daysPastDue: number | null
  /** The customer's oldest open invoice, which the account reads from. */
  company?: Company
  /** Every Active Payments invoice behind the figure, oldest first. */
  invoices_open?: Company[]
  ageing?: OverduePayment
}

export interface BookInputs {
  companies: Company[]
  overduePayments: OverduePayment[]
  today: string
}

export interface BookTotals {
  accounts: number
  outstanding: number
  overdueAccounts: number
  pastDue: number
  criticalAccounts: number
  criticalAmount: number
}

/** Days past due beyond which every screen calls an invoice critical. */
export const CRITICAL_AFTER_DAYS = LEDGER_CRITICAL_AFTER_DAYS

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(`${toISO}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) / DAY_MS
  )
}

/** Money in the 91-120 and 121+ buckets of an ageing row. */
export function agedBuckets(row: OverduePayment): number {
  return (row.due_91_120 ?? 0) + (row.due_121_plus ?? 0)
}

/**
 * The customers somebody has declared bankrupt, by BP code.
 *
 * A company goes under as a company, not as a row. The declaration is made on
 * the ageing screen, but most of these customers have an Active Payments
 * account too — and the book gives that record precedence, so without this the
 * declaration would have no effect at all on the customers who appear in both.
 */
export function bankruptCodes(overduePayments: OverduePayment[]): Set<string> {
  const codes = new Set<string>()
  for (const row of overduePayments) {
    if (row.status !== 'bankrupt') continue
    const code = normalizeBpCode(row.bp_code)
    if (code) codes.add(code)
  }
  return codes
}

export function buildReceivablesBook(inputs: BookInputs): BookAccount[] {
  const { companies, overduePayments, today } = inputs
  // Declared on the ageing screen, but it is the customer that is bankrupt, so
  // it applies whichever record ends up supplying the figures.
  const bankrupt = bankruptCodes(overduePayments)

  const accounts: BookAccount[] = []
  /** BP codes already spoken for, whether or not they contributed money. */
  const claimed = new Set<string>()

  /*
   * Active Payments holds one record per invoice, so a customer usually has
   * several. The book counts a customer once, so their invoices are added
   * together here rather than the first one standing for all of them - which
   * is what happened while the import rolled them up, and would now quietly
   * drop every invoice but one from the totals.
   */
  const byCustomer = new Map<string, Company[]>()
  for (const company of companies) {
    const key = accountKeyOf(company.sap_bp_code, company.name)
    const group = byCustomer.get(key)
    if (group) group.push(company)
    else byCustomer.set(key, [company])
  }

  for (const group of byCustomer.values()) {
    const code = normalizeBpCode(group[0].sap_bp_code)
    if (code) {
      if (claimed.has(code)) continue
      claimed.add(code)
    }

    // A settled invoice is not money still owed, but the customer keeps their
    // code. An invoice set aside is the same: the code stays claimed so a
    // stale ageing row cannot bring the balance back.
    // Set aside — no follow-up or bankrupt, stamped or declared on the ageing
    // row — is out of the book, and the code stays claimed.
    const open = group.filter(
      (company) => company.status !== 'paid' && !isSetAside(company) && !(code && bankrupt.has(code))
    )
    if (open.length === 0) continue

    // Oldest money first: the status, the contact and the link all read from
    // the invoice that has been waiting longest.
    const ordered = [...open].sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
    const lead = ordered[0]

    const amountOf = (company: Company) => company.total_amount || 0
    const overdueInvoices = open.filter(
      (company) => company.status === 'overdue' || company.status === 'critical'
    )
    const criticalInvoices = open.filter((company) => company.status === 'critical')
    const sum = (list: Company[]) => list.reduce((total, company) => total + amountOf(company), 0)

    accounts.push({
      key: code ? `bp:${code}` : `company:${lead.id}`,
      bpCode: code,
      name: lead.name,
      coordinatorId: lead.assigned_coordinator_id,
      source: 'company',
      outstanding: sum(open),
      pastDue: sum(overdueInvoices),
      isOverdue: overdueInvoices.length > 0,
      isCritical: criticalInvoices.length > 0,
      isBankrupt: code ? bankrupt.has(code) : false,
      criticalAmount: sum(criticalInvoices),
      daysPastDue: lead.due_date ? Math.max(0, daysBetween(lead.due_date, today)) : null,
      company: lead,
      invoices_open: ordered,
    })
  }

  for (const row of overduePayments) {
    const code = normalizeBpCode(row.bp_code)
    if (code) {
      if (claimed.has(code)) continue
      claimed.add(code)
    }
    if (row.status === 'settled' || isSetAside(row)) continue

    const amount = row.balance_due || 0
    // A credit balance nets off the book the same way it nets off the Overdue
    // screen's own total; only a nil balance is nothing at all.
    if (amount === 0) continue

    // An ageing report only lists money past its date, so the whole balance
    // is past due; only the 91+ buckets are critical.
    const criticalAmount = agedBuckets(row)
    accounts.push({
      key: code ? `bp:${code}` : `ageing:${row.id}`,
      bpCode: code,
      name: row.customer_name || row.bp_code,
      coordinatorId: row.assigned_coordinator_id,
      source: 'ageing',
      outstanding: amount,
      pastDue: amount,
      isOverdue: true,
      isCritical: criticalAmount > 0,
      isBankrupt: row.status === 'bankrupt',
      criticalAmount,
      daysPastDue: null,
      ageing: row,
    })
  }

  return accounts
}

/** The accounts one coordinator carries. */
export function bookForCoordinator(book: BookAccount[], coordinatorId: string): BookAccount[] {
  return book.filter((account) => account.coordinatorId === coordinatorId)
}

export function summariseBook(book: BookAccount[]): BookTotals {
  const totals: BookTotals = {
    accounts: book.length,
    outstanding: 0,
    overdueAccounts: 0,
    pastDue: 0,
    criticalAccounts: 0,
    criticalAmount: 0,
  }
  for (const account of book) {
    totals.outstanding += account.outstanding
    totals.pastDue += account.pastDue
    totals.criticalAmount += account.criticalAmount
    if (account.isOverdue) totals.overdueAccounts++
    if (account.isCritical) totals.criticalAccounts++
  }
  return totals
}

/** The account a follow-up was logged against, if it is still in the book. */
export function findAccountForRecord(
  book: BookAccount[],
  entityType: 'company' | 'overdue_payment',
  entityId: string
): BookAccount | undefined {
  return book.find((account) =>
    entityType === 'company'
      ? // Any of the customer's invoices, not only the one the account reads
        // from: a follow-up is logged against the invoice that was open at the
        // time, which may not be the oldest one today.
        account.company?.id === entityId ||
        Boolean(account.invoices_open?.some((invoice) => invoice.id === entityId))
      : account.ageing?.id === entityId
  )
}
