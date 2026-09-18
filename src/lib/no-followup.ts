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

/** Carried on both an Active Payments account and an ageing balance. */
export interface NoFollowupFields {
  /** When it was set aside. Its presence is what marks the account. */
  no_followup_at?: string | null
  no_followup_by?: string | null
  /** Why — a dispute reference, an agreed hold, whatever was decided. */
  no_followup_note?: string | null
}

/** True when this account has been set aside from chasing and from the totals. */
export function isNoFollowup(record: NoFollowupFields | null | undefined): boolean {
  return Boolean(record?.no_followup_at)
}

/** The fields to write when somebody sets an account aside. */
export function markNoFollowup(by: string, note?: string | null): Required<NoFollowupFields> {
  return {
    no_followup_at: new Date().toISOString(),
    no_followup_by: by,
    no_followup_note: note?.trim() || null,
  }
}

/** The fields to write when the decision is undone. */
export const CLEAR_NO_FOLLOWUP: Required<NoFollowupFields> = {
  no_followup_at: null,
  no_followup_by: null,
  no_followup_note: null,
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
