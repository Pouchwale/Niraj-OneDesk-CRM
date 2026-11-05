/**
 * A dispute covers the amount that was disputed, not every rupee the customer
 * will ever owe.
 *
 * Until 5 Nov 2026 a dispute hid the customer's whole ageing balance. When
 * Jainam Invamed (C1472) was in dispute over ₹14,681 and a new ₹1,45,636
 * invoice fell due, the new money vanished with it and nobody chased it.
 *
 * Now the ageing row in dispute keeps the disputed amount (saved when the
 * dispute was applied), and anything the file shows above it goes on a second,
 * ordinary ageing row for the same customer: on the Regular list, in the
 * totals, in Robi's plans. Each sync recalculates both from the file.
 */

/** The money on an ageing row. */
export interface AgeingBuckets {
  balance_due: number
  due_0_30: number
  due_31_60: number
  due_61_90: number
  due_91_120: number
  due_121_plus: number
}

/** Newest money first: the disputed part is the old debt, new invoices are the extra. */
const NEWEST_FIRST = ['due_0_30', 'due_31_60', 'due_61_90', 'due_91_120', 'due_121_plus'] as const

const round2 = (value: number) => Math.round(value * 100) / 100

/** Marks the second row: the money above a dispute, on the Regular list. */
export interface DisputeExtraFields {
  /** The id of the ageing row in dispute this row is the extra of. */
  dispute_extra_of?: string | null
}

export function isDisputeExtra(row: DisputeExtraFields | null | undefined): boolean {
  return Boolean(row?.dispute_extra_of)
}

/** The id the extra row always gets, so every copy of the store agrees on it. */
export function disputeExtraIdOf(primaryId: string): string {
  return `${primaryId}-extra`
}

/**
 * Splits what the file says the customer owes into the disputed part and the
 * extra above it.
 *
 * The extra is taken from the newest buckets first, because that is the money
 * that arrived after the dispute. A balance at or below the disputed amount is
 * all disputed and leaves no extra.
 */
export function splitDisputedBalance(
  file: AgeingBuckets,
  disputedAmount: number
): { disputed: AgeingBuckets; extra: AgeingBuckets } {
  const balance = file.balance_due || 0
  const extraTotal = round2(Math.max(0, balance - Math.max(0, disputedAmount)))

  const extra: AgeingBuckets = { balance_due: extraTotal, due_0_30: 0, due_31_60: 0, due_61_90: 0, due_91_120: 0, due_121_plus: 0 }
  let left = extraTotal
  for (const bucket of NEWEST_FIRST) {
    if (left <= 0) break
    const take = round2(Math.min(left, Math.max(0, file[bucket] || 0)))
    extra[bucket] = take
    left = round2(left - take)
  }
  // Buckets that do not add up to the balance (credits in some): the rest is newest.
  if (left > 0) extra.due_0_30 = round2(extra.due_0_30 + left)

  const disputed: AgeingBuckets = { balance_due: round2(balance - extraTotal), due_0_30: 0, due_31_60: 0, due_61_90: 0, due_91_120: 0, due_121_plus: 0 }
  for (const bucket of NEWEST_FIRST) disputed[bucket] = round2((file[bucket] || 0) - extra[bucket])

  return { disputed, extra }
}

/** Puts the two parts back together, when the dispute is undone or re-decided. */
export function addBuckets(a: AgeingBuckets, b: AgeingBuckets): AgeingBuckets {
  return {
    balance_due: round2((a.balance_due || 0) + (b.balance_due || 0)),
    due_0_30: round2((a.due_0_30 || 0) + (b.due_0_30 || 0)),
    due_31_60: round2((a.due_31_60 || 0) + (b.due_31_60 || 0)),
    due_61_90: round2((a.due_61_90 || 0) + (b.due_61_90 || 0)),
    due_91_120: round2((a.due_91_120 || 0) + (b.due_91_120 || 0)),
    due_121_plus: round2((a.due_121_plus || 0) + (b.due_121_plus || 0)),
  }
}

export function bucketsOf(row: AgeingBuckets): AgeingBuckets {
  return {
    balance_due: row.balance_due || 0,
    due_0_30: row.due_0_30 || 0,
    due_31_60: row.due_31_60 || 0,
    due_61_90: row.due_61_90 || 0,
    due_91_120: row.due_91_120 || 0,
    due_121_plus: row.due_121_plus || 0,
  }
}
