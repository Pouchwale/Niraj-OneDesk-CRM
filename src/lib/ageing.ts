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
