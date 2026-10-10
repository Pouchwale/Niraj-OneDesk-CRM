/**
 * Reading an ageing report's buckets.
 *
 * Every figure in a bucket is money the customer still owes - the balance
 * due, split by how long it has been outstanding. None of it is money that
 * has been collected, and nothing on screen should let it be read that way.
 * A collected amount leaves the report entirely: it comes back in the next
 * upload as a smaller balance, or the row is settled.
 *
 * The bucket boundaries live once, in due-filter.ts, so the filter, the
 * critical rule and this display all cut the days the same way.
 */

import { AGEING_BUCKETS, type AgeingBucketKey, type AgeingRow } from './due-filter'
import { AGEING_CRITICAL_FROM_DAYS } from './status-rules'

/** Rupees; anything smaller than this is rounding, not a real difference. */
const TOLERANCE = 0.5

export interface AgeingBucketRow {
  key: AgeingBucketKey
  /** "0–30 days", "121+ days". */
  label: string
  amount: number
  /** Past the 90-day line - the money most likely to be written off. */
  isCritical: boolean
}

function labelFor(bucket: (typeof AGEING_BUCKETS)[number]): string {
  return bucket.to === null ? `${bucket.from}+ days` : `${bucket.from}–${bucket.to} days`
}

/** Whole paise: sums of these are exact, where sums of rupee floats drift. */
function toPaise(rupees: number | null | undefined): number {
  const value = Number(rupees)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

export function ageingRows(row: AgeingRow): AgeingBucketRow[] {
  return AGEING_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: labelFor(bucket),
    amount: row[bucket.key] ?? 0,
    isCritical: bucket.from >= AGEING_CRITICAL_FROM_DAYS,
  }))
}

/** The oldest bucket still holding money: what sets the tone of a reminder. */
export function oldestAgeingBand(row: AgeingRow): { label: string; fromDays: number } | null {
  for (let i = AGEING_BUCKETS.length - 1; i >= 0; i--) {
    const bucket = AGEING_BUCKETS[i]
    if ((row[bucket.key] ?? 0) > 0) return { label: labelFor(bucket), fromDays: bucket.from }
  }
  return null
}

export interface AgeingSummary {
  rows: AgeingBucketRow[]
  /** Everything the buckets hold. All of it is still unpaid. */
  total: number
  /** False when the report carried no bucket columns for this customer. */
  hasBreakdown: boolean
  balance: number
  /** Balance minus the buckets. Non-zero means the report does not add up. */
  difference: number
  tiesOut: boolean
}

/**
 * The buckets against the balance they are meant to explain.
 *
 * They should add up to the balance due. When they do not, the upload is
 * missing a column or the report was built on a different date - worth saying
 * out loud rather than showing two figures that quietly disagree.
 */
export function summariseAgeing(payment: AgeingRow & { balance_due?: number | null }): AgeingSummary {
  const rows = ageingRows(payment)
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  const balance = payment.balance_due ?? 0
  const difference = balance - total
  return {
    rows,
    total,
    hasBreakdown: rows.some((row) => row.amount !== 0),
    balance,
    difference,
    tiesOut: Math.abs(difference) <= TOLERANCE,
  }
}

export interface AgeingBookBucket extends AgeingBucketRow {
  /** `amount` is net: what is owed here less the credits sitting in the same bucket. */
  owed: number
  /** Advances and credit notes in this bucket, as a negative figure (0 when none). */
  credit: number
  /** Companies with money owed in this bucket (a credit in it does not count). */
  accounts: number
  /** This bucket's part of everything the buckets hold, 0–100. */
  share: number
}

export interface AgeingBook {
  buckets: AgeingBookBucket[]
  /** Every bucket added up, net of credits: what the list still owes. */
  total: number
  /** Before credits, and the credits netted off (negative). owed + credit = total. */
  owed: number
  credit: number
  /** The balances added up, which the buckets should explain. */
  balance: number
  difference: number
  tiesOut: boolean
  /** Rows in the list. */
  accounts: number
  /** Rows with any money past the 90-day line. */
  criticalAccounts: number
  /** Money past the 90-day line. */
  criticalAmount: number
}

/**
 * The ageing buckets added up across a whole list, company by company.
 *
 * Added in paise and turned back into rupees once, so a book of hundreds of
 * part-paid invoices totals to the paisa and every bucket figure adds up to
 * the grand total exactly — the check an accountant makes first.
 */
export function ageingBookTotals(
  rows: readonly (AgeingRow & { balance_due?: number | null })[]
): AgeingBook {
  const paise = AGEING_BUCKETS.map(() => 0)
  const creditPaise = AGEING_BUCKETS.map(() => 0)
  const accounts = AGEING_BUCKETS.map(() => 0)
  let balancePaise = 0
  let criticalAccounts = 0

  for (const row of rows) {
    balancePaise += toPaise(row.balance_due)
    let critical = false
    AGEING_BUCKETS.forEach((bucket, i) => {
      const amount = toPaise(row[bucket.key])
      paise[i] += amount
      if (amount < 0) creditPaise[i] += amount
      if (amount > 0) {
        accounts[i]++
        if (bucket.from >= AGEING_CRITICAL_FROM_DAYS) critical = true
      }
    })
    if (critical) criticalAccounts++
  }

  const totalPaise = paise.reduce((sum, p) => sum + p, 0)
  const totalCreditPaise = creditPaise.reduce((sum, p) => sum + p, 0)
  const criticalPaise = AGEING_BUCKETS.reduce(
    (sum, bucket, i) => (bucket.from >= AGEING_CRITICAL_FROM_DAYS ? sum + paise[i] : sum),
    0
  )
  const differencePaise = balancePaise - totalPaise

  return {
    buckets: AGEING_BUCKETS.map((bucket, i) => ({
      key: bucket.key,
      label: labelFor(bucket),
      amount: paise[i] / 100,
      isCritical: bucket.from >= AGEING_CRITICAL_FROM_DAYS,
      owed: (paise[i] - creditPaise[i]) / 100,
      credit: creditPaise[i] / 100,
      accounts: accounts[i],
      share: totalPaise > 0 ? (paise[i] / totalPaise) * 100 : 0,
    })),
    total: totalPaise / 100,
    owed: (totalPaise - totalCreditPaise) / 100,
    credit: totalCreditPaise / 100,
    balance: balancePaise / 100,
    difference: differencePaise / 100,
    tiesOut: Math.abs(differencePaise) <= TOLERANCE * 100,
    accounts: rows.length,
    criticalAccounts,
    criticalAmount: criticalPaise / 100,
  }
}
