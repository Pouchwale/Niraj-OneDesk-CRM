/**
 * Accounts the team has decided not to chase, and not to count.
 *
 * Some balances are real on paper and meaningless in a collections list: an
 * inter-company transfer, a disputed amount sitting with the lawyers, a
 * customer on an agreed hold, a figure the source system keeps re-sending that
 * nobody will ever collect. Left in, they pad the outstanding figure every
 * screen quotes and put work in a coordinator's day that will never be done.
 *
 * This marks such an account as needing no follow-up. Two things follow, and
 * they go together — either alone would be wrong:
 *
 *   - it leaves every working list, so nobody is asked to chase it;
 *   - its balance leaves every total, so what is owed means what is owed.
 *
 * Bankruptcy used to differ on that second half: its balance stayed in the
 * book as "still owed". Since 11 Sept 2026 it is held out the same way; see
 * isSetAside at the end of this file. The two keep separate registers.
 *
 * It is never automatic. Somebody chooses it, their name and reason are kept
 * with the record, and it can be undone.
 */

import { normalizeBpCode } from './bp-code'
import type { Company, OverduePayment } from './types'

/** Carried on both an Active Payments account and an ageing balance. */
export interface NoFollowupFields {
  /** When it was set aside. Its presence is what marks the account. */
  no_followup_at?: string | null
  no_followup_by?: string | null
  /** Why — a dispute reference, an agreed hold, whatever was decided. */
  no_followup_note?: string | null
  /** 'dispute' for an account in dispute, 'export' for an export client; otherwise a plain no follow-up. */
  no_followup_kind?: SetAsideKind | null
}

/** Set aside because the customer disputes the amount (listed in its own register). */
/** The set-asides that keep their own register (since 7 and 13 Oct 2026). */
export type SetAsideKind = 'dispute' | 'export'

/** Which register a set-aside record belongs in. */
export function setAsideKindOf(record: NoFollowupFields | null | undefined): 'plain' | SetAsideKind {
  const kind = record?.no_followup_kind
  return kind === 'dispute' || kind === 'export' ? kind : 'plain'
}

export const SET_ASIDE_LABEL: Record<'plain' | SetAsideKind, string> = {
  plain: 'No follow-up',
  dispute: 'Dispute',
  export: 'Export client',
}

/** An export client: set aside because payment is handled outside this follow-up. */
export function isExportClient(record: NoFollowupFields | null | undefined): boolean {
  return isNoFollowup(record) && record?.no_followup_kind === 'export'
}

export function isDispute(record: NoFollowupFields | null | undefined): boolean {
  return isNoFollowup(record) && record?.no_followup_kind === 'dispute'
}

/** True when this account has been set aside from chasing and from the totals. */
export function isNoFollowup(record: NoFollowupFields | null | undefined): boolean {
  return Boolean(record?.no_followup_at)
}

/** The fields to write when somebody sets an account aside. */
export function markNoFollowup(by: string, note?: string | null, kind?: SetAsideKind | null): Required<NoFollowupFields> {
  return {
    no_followup_at: new Date().toISOString(),
    no_followup_by: by,
    no_followup_note: note?.trim() || null,
    no_followup_kind: kind === 'dispute' || kind === 'export' ? kind : null,
  }
}

/** The fields to write when the decision is undone. */
export const CLEAR_NO_FOLLOWUP: Required<NoFollowupFields> = {
  no_followup_at: null,
  no_followup_by: null,
  no_followup_note: null,
  no_followup_kind: null,
}

/** What is set aside, and how much of the book it accounts for. */
export function summariseNoFollowup<T extends NoFollowupFields>(
  records: T[],
  amountOf: (record: T) => number
): { count: number; amount: number } {
  let count = 0
  let amount = 0
  for (const record of records) {
    if (!isNoFollowup(record)) continue
    count++
    amount += amountOf(record) || 0
  }
  return { count, amount }
}


/* ===================== Bankruptcy, and "set aside" as a whole ===================== */

/** What marks a bankrupt customer: the ageing row's status, or the stamp on an invoice. */
export interface BankruptFields {
  status?: string | null
  bankrupt_declared_at?: string | null
  bankrupt_declared_by?: string | null
  bankrupt_note?: string | null
}

/**
 * True when the customer has been declared bankrupt.
 *
 * Declared on the ageing row, but it is the customer that has gone under, so
 * their Active Payments invoices carry the same stamp. Either signal is enough.
 */
export function isBankrupt(record: BankruptFields | null | undefined): boolean {
  return record?.status === 'bankrupt' || Boolean(record?.bankrupt_declared_at)
}

/**
 * Out of Active Payments and Overdue altogether: set aside with no follow-up,
 * or declared bankrupt.
 *
 * Since 11 Sept 2026 the two are handled the same way — the team's decision; a
 * bankrupt balance used to stay in the totals as "still owed". Neither is
 * chased, neither is in any total, count or working list, and no status filter
 * brings either back. Each is listed only in its own register on the Overview,
 * with its amount, so the one place to see what was held out is the place
 * where it was decided.
 */
export function isSetAside(record: (NoFollowupFields & BankruptFields) | null | undefined): boolean {
  return isNoFollowup(record) || isBankrupt(record)
}

/** One customer declared bankrupt, with what each book holds for them. */
export interface BankruptCustomer {
  key: string
  bpCode: string | null
  name: string
  /** A record of theirs to address a reinstatement at; the ageing row where there is one. */
  entityType: 'company' | 'overdue_payment'
  entityId: string
  coordinatorId: string | null
  /** Null when the ageing report does not list the customer. */
  ageingBalance: number | null
  /** Open invoices only; a paid one is not money held out. */
  invoices: number
  invoiceAmount: number
  by: string | null
  at: string | null
  note: string | null
}

/**
 * Every bankrupt customer, once each, whichever book it was declared in.
 *
 * Grouped by BP code. A declaration made on an Active Payments invoice for a
 * customer the ageing report does not list has no ageing row to show it, and
 * a register that read only the ageing rows would hold that money out of every
 * total without listing it anywhere.
 */
export function listBankruptCustomers(
  companies: Company[],
  overduePayments: OverduePayment[]
): BankruptCustomer[] {
  const byCustomer = new Map<string, BankruptCustomer>()

  const seat = (key: string, seed: Omit<BankruptCustomer, 'key' | 'ageingBalance' | 'invoices' | 'invoiceAmount'>) => {
    const found = byCustomer.get(key)
    if (found) return found
    const made: BankruptCustomer = { key, ...seed, ageingBalance: null, invoices: 0, invoiceAmount: 0 }
    byCustomer.set(key, made)
    return made
  }

  // Ageing rows first, so a customer in both books is addressed at that row.
  for (const row of overduePayments) {
    if (row.status !== 'bankrupt') continue
    const code = normalizeBpCode(row.bp_code)
    const entry = seat(code ? `bp:${code}` : `ageing:${row.id}`, {
      bpCode: code,
      name: row.customer_name || row.bp_code,
      entityType: 'overdue_payment',
      entityId: row.id,
      coordinatorId: row.assigned_coordinator_id,
      by: row.bankrupt_declared_by ?? null,
      at: row.bankrupt_declared_at ?? null,
      note: row.bankrupt_note ?? null,
    })
    entry.ageingBalance = (entry.ageingBalance ?? 0) + (row.balance_due || 0)
  }

  for (const company of companies) {
    if (!isBankrupt(company)) continue
    const code = normalizeBpCode(company.sap_bp_code)
    const entry = seat(code ? `bp:${code}` : `company:${company.id}`, {
      bpCode: code,
      name: company.name,
      entityType: 'company',
      entityId: company.id,
      coordinatorId: company.assigned_coordinator_id,
      by: company.bankrupt_declared_by ?? null,
      at: company.bankrupt_declared_at ?? null,
      note: company.bankrupt_note ?? null,
    })
    if (company.status === 'paid') continue
    entry.invoices++
    entry.invoiceAmount += company.total_amount || 0
  }

  // Most recently declared first: the ones still being talked about.
  return [...byCustomer.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
}

/** The stamp a customer's invoices carry once the customer is declared bankrupt. */
export function bankruptMarkOf(source: BankruptFields): {
  bankrupt_declared_at: string
  bankrupt_declared_by: string | null
  bankrupt_note: string | null
} {
  return {
    bankrupt_declared_at: source.bankrupt_declared_at ?? new Date().toISOString(),
    bankrupt_declared_by: source.bankrupt_declared_by ?? null,
    bankrupt_note: source.bankrupt_note ?? null,
  }
}
