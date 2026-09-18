/**
 * The day thresholds every screen agrees on.
 *
 * One number each, imported everywhere it is used: the status an upload
 * derives, the "Critical & closing in" window, the payment-due filter's
 * presets, the bell's "due soon" alert and Robi's nudges all read the same
 * lines, so an account can never be "critical" on one screen and merely
 * "overdue" on the next.
 */

import type { CompanyStatus } from './types'
import { parseISODate } from './utils'
import { DAY_MS } from './constants'

/**
 * Below this, a balance is not worth anybody's time to chase.
 *
 * A part-payment routinely leaves paise behind - the live file has ten invoices
 * sitting at 8 to 50 paise, ₹3.34 between them - and each of those was turning
 * up as a critical account 120 days overdue. Nobody rings a customer about 39
 * paise, so they stay off the chase lists.
 *
 * Deliberately not a write-off: the balance is untouched and still counts
 * towards what is owed, on every screen and for every role. It simply stops
 * asking for attention. Anything a person decides to actually write off goes
 * through "No follow-up", which is a decision with a name and a date on it.
 */
export const CHASE_FLOOR = 1

/**
 * Whether a balance is big enough to chase.
 *
 * Absolute, so a credit of a few paise is as uninteresting as a debt of a few
 * paise, while a real credit balance keeps behaving as it always has.
 */
export function worthChasing(amount: number | null | undefined): boolean {
  return Math.abs(Number(amount) || 0) >= CHASE_FLOOR
}

/** An Active Payments account is critical once it is more than this many days past due. */
export const CRITICAL_AFTER_DAYS = 60

/** Due within this many days counts as "upcoming" / "due soon" everywhere. */
export const DUE_SOON_DAYS = 7

/** How many days before the critical line "turning critical" starts. */
export const TURNING_CRITICAL_WITHIN = 15

/** On the ageing report, money from this bucket up is critical (the 91–120 and 121+ buckets). */
export const AGEING_CRITICAL_FROM_DAYS = 91

/** A ledger invoice is critical once it is more than this many days past due - the ageing report's line. */
export const LEDGER_CRITICAL_AFTER_DAYS = 90

/**
 * The status an Active Payments account has today, from its due date.
 *
 * Re-derived on every read (see demoCompanyStore.refreshStatuses), never
 * trusted from the day of the upload: an account imported as "upcoming" is
 * "overdue" the morning after its due date whether or not anyone touched it.
 */
export function deriveCompanyStatus(
  dueDate: string | null,
  totalAmount: number,
  today: Date = new Date()
): CompanyStatus {
  if (totalAmount <= 0) return 'paid'
  if (!dueDate) return 'current'

  const todayMidnight = new Date(today)
  todayMidnight.setHours(0, 0, 0, 0)

  const due = parseISODate(dueDate)
  if (isNaN(due.getTime())) return 'current'
  due.setHours(0, 0, 0, 0)

  const daysUntilDue = Math.round((due.getTime() - todayMidnight.getTime()) / DAY_MS)

  if (daysUntilDue < -CRITICAL_AFTER_DAYS) return 'critical'
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= DUE_SOON_DAYS) return 'upcoming'
  return 'current'
}
