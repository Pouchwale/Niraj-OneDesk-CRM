/**
 * Making the app agree with the file, including about what is *not* in it.
 *
 * The import used to be additive only: every row in the workbook was created or
 * updated, and anything the workbook no longer said was left exactly as it was.
 * That is fine while balances only grow, and quietly wrong the moment somebody
 * gets paid — which is the normal case. A customer whose invoices were all
 * settled in the file, or whose rows were removed from it altogether, kept the
 * old amount here forever, so the outstanding total drifted further from the
 * truth with every sync while the sync itself reported success.
 *
 * So a sync now answers two questions per customer, not one: what does the file
 * say they owe, and does the file still mention them at all.
 *
 *   - mentioned, with money        → created or updated, as before
 *   - mentioned, with nothing left → settled here
 *   - not mentioned at all         → settled here, but only when the sync read
 *                                    the whole book
 *
 * That last condition matters. With a date window in force the workbook is
 * deliberately a slice, so silence about a customer means "outside your filter",
 * not "paid" — settling on that basis would delete real money from the totals.
 * A filtered sync therefore updates what it sees and reconciles nothing.
 *
 * Two things are never settled by a file: an account somebody set to no
 * follow-up, and a customer declared bankrupt. Both are decisions a person made
 * here, and a row disappearing from tomorrow's export is not an argument
 * against either.
 */

// One definition of who a customer is, shared with the import and the book.
export { accountKeyOf, invoiceKeyOf } from './account-key'

/** What the sheet said about each customer it mentioned. */
export interface FileAccounts {
  /** Every account key the sheet mentions, whatever the amount. */
  present: Set<string>
  /** Those the sheet mentions with no money left against them. */
  nil: Set<string>
}

/** Adds up what the sheet says each customer owes, per account key. */
export function readFileAccounts<T>(
  rows: T[],
  keyOf: (row: T) => string,
  amountOf: (row: T) => number
): FileAccounts {
  const totals = new Map<string, number>()
  /** Customers with a cell nobody could read: the file is not saying "paid". */
  const unreadable = new Set<string>()

  for (const row of rows) {
    const key = keyOf(row)
    // `name:` with nothing after it is a blank row, not a customer.
    if (key === 'name:') continue
    const amount = amountOf(row)
    if (!Number.isFinite(amount)) {
      // An amount that will not parse is a row somebody has to fix, and it
      // must never be read as a nil balance — that would settle a live debt
      // over a typo.
      unreadable.add(key)
      if (!totals.has(key)) totals.set(key, 0)
      continue
    }
    totals.set(key, (totals.get(key) ?? 0) + amount)
  }

  const nil = new Set<string>()
  for (const [key, total] of totals) {
    if (total === 0 && !unreadable.has(key)) nil.add(key)
  }

  return { present: new Set(totals.keys()), nil }
}

/** Why an account is being brought to nil, for the person who has to explain it later. */
export type SettleReason = 'paid-in-file' | 'gone-from-file'

export interface Settlement {
  id: string
  key: string
  name: string
  amount: number
  reason: SettleReason
}

export interface SettlementInputs<T> {
  records: T[]
  file: FileAccounts
  /** False for a filtered sync: silence about a customer means nothing then. */
  reconcileAbsent: boolean
  idOf: (record: T) => string
  keyOf: (record: T) => string
  nameOf: (record: T) => string
  amountOf: (record: T) => number
  /** True for a record the file is not allowed to settle. */
  isProtected: (record: T) => boolean
}

/**
 * The accounts this sync should bring to nil, and why.
 *
 * Records already at nothing are left out: settling a zero changes no figure
 * and would only inflate the count the sync reports, which is the number people
 * will read to decide whether the import did something alarming.
 */
export function planSettlements<T>(inputs: SettlementInputs<T>): Settlement[] {
  const { records, file, reconcileAbsent } = inputs
  const settlements: Settlement[] = []

  for (const record of records) {
    if (inputs.isProtected(record)) continue

    const amount = inputs.amountOf(record)
    if (!Number.isFinite(amount) || amount === 0) continue

    const key = inputs.keyOf(record)
    const reason: SettleReason | null = file.nil.has(key)
      ? 'paid-in-file'
      : !file.present.has(key) && reconcileAbsent
        ? 'gone-from-file'
        : null
    if (!reason) continue

    settlements.push({
      id: inputs.idOf(record),
      key,
      name: inputs.nameOf(record),
      amount,
      reason,
    })
  }

  return settlements
}

/**
 * The share of the book a sync may write down before it is treated as a
 * mistake rather than a very good month.
 *
 * Earned the hard way: the file side of this was keyed by customer while the
 * records were keyed by invoice, so nothing matched, and one sync wrote 1,011
 * live invoices down to nil and reported it as a success. A file that settles
 * most of the book is a truncated export or a keying bug, near enough always -
 * and the cost of pausing on the rare real case is a message, while the cost of
 * being wrong is the whole ledger.
 */
export const SETTLEMENT_ALARM_SHARE = 0.5
/** Below this many records the share means nothing, so it is not applied. */
export const SETTLEMENT_ALARM_FLOOR = 20

export interface GuardedSettlements {
  /** The settlements to write. Empty when the plan looked wrong. */
  apply: Settlement[]
  /** How many were held back, for the message. 0 when nothing was. */
  refused: number
}

/**
 * Refuses a settlement plan that would empty the book.
 *
 * All or nothing on purpose: if the plan cannot be trusted, applying the half
 * of it that happens to look reasonable is not safer, it just makes the damage
 * harder to spot.
 */
export function guardSettlements(plan: Settlement[], openRecords: number): GuardedSettlements {
  if (openRecords < SETTLEMENT_ALARM_FLOOR) return { apply: plan, refused: 0 }
  if (plan.length < openRecords * SETTLEMENT_ALARM_SHARE) return { apply: plan, refused: 0 }
  return { apply: [], refused: plan.length }
}

/** How many were settled for each reason, for the line the sync prints. */
export function countSettlements(settlements: Settlement[]): { paid: number; gone: number } {
  let paid = 0
  let gone = 0
  for (const settlement of settlements) {
    if (settlement.reason === 'paid-in-file') paid++
    else gone++
  }
  return { paid, gone }
}
