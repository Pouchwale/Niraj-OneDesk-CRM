/**
 * The "critical and closing in" window.
 *
 * Both payment screens offer two views: everything, and only what needs a
 * decision this week. This module decides what belongs in the second one,
 * with one rule for each screen's records:
 *
 *   - critical   more than 60 days past due (the status rule), or money past
 *                90 days on the ageing report;
 *   - overdue    past due but not yet critical - the last 15 days before the
 *                line are called out - or money sitting in the 61–90 bucket;
 *   - due soon   due within the next 7 days (Active Payments only - an ageing
 *                report holds nothing that is not yet due).
 */

import type { Company, OverduePayment } from './types'
import { daysUntilDue } from './due-filter'
import { formatCurrency, todayISO } from './utils'
import { isSetAside } from './no-followup'
import {
  CHASE_FLOOR,
  CRITICAL_AFTER_DAYS,
  DUE_SOON_DAYS,
  LEDGER_CRITICAL_AFTER_DAYS,
  TURNING_CRITICAL_WITHIN,
  worthChasing,
} from './status-rules'

export type AttentionReason = 'critical' | 'overdue' | 'due_soon'

export interface Attention {
  reason: AttentionReason
  /** Short, specific: "52 days overdue · critical in 9 days". */
  detail: string
  /** Lower sorts first inside a reason. */
  urgency: number
}

/** Days ahead that count as "closing in" - the same line as the "upcoming" status. */
export const CLOSING_IN_DAYS = DUE_SOON_DAYS
export { CRITICAL_AFTER_DAYS, TURNING_CRITICAL_WITHIN }

export const ATTENTION_ORDER: AttentionReason[] = ['critical', 'overdue', 'due_soon']

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  critical: 'Critical',
  overdue: 'Overdue',
  due_soon: 'Due soon',
}

export { CHASE_FLOOR }

export const ATTENTION_HINT: Record<AttentionReason, string> = {
  critical: `More than ${CRITICAL_AFTER_DAYS} days past due, or money past ${LEDGER_CRITICAL_AFTER_DAYS} days on the ageing report.`,
  overdue: `Past due and heading for critical - the last ${TURNING_CRITICAL_WITHIN} days before it are called out.`,
  due_soon: `Due within the next ${CLOSING_IN_DAYS} days.`,
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function companyAttention(company: Company, today: string = todayISO()): Attention | null {
  // Nothing to decide about an account nobody is chasing.
  if (company.status === 'paid' || isSetAside(company)) return null
  // Nor about a few paise left over from a part-payment. Still owed, still
  // counted, just not worth a phone call.
  if (!worthChasing(company.total_amount)) return null
  const days = company.due_date ? daysUntilDue(company.due_date, today) : null
  const overdueBy = days === null || Number.isNaN(days) ? null : -days

  if (company.status === 'critical' || (overdueBy !== null && overdueBy > CRITICAL_AFTER_DAYS)) {
    return {
      reason: 'critical',
      detail: overdueBy !== null && overdueBy > 0 ? `${plural(overdueBy, 'day')} overdue` : 'marked critical',
      urgency: overdueBy === null ? 0 : -overdueBy,
    }
  }

  // Past due, not yet critical. The closer it is to the line, the higher it
  // sorts, and the last stretch before critical says so in words.
  if (overdueBy !== null && overdueBy > 0) {
    const left = CRITICAL_AFTER_DAYS + 1 - overdueBy
    const nearLine = overdueBy > CRITICAL_AFTER_DAYS - TURNING_CRITICAL_WITHIN
    return {
      reason: 'overdue',
      detail: nearLine
        ? `${plural(overdueBy, 'day')} overdue · critical in ${plural(left, 'day')}`
        : `${plural(overdueBy, 'day')} overdue`,
      urgency: left,
    }
  }

  if (days !== null && days >= 0 && days <= CLOSING_IN_DAYS) {
    return {
      reason: 'due_soon',
      detail: days === 0 ? 'due today' : `due in ${plural(days, 'day')}`,
      urgency: days,
    }
  }

  return null
}

export function overdueAttention(payment: OverduePayment): Attention | null {
  // Settled means the money came in; bankrupt means there is nobody to ask.
  // Neither belongs in a list of things to decide this week.
  if (payment.status === 'settled' || isSetAside(payment)) return null
  if (!worthChasing(payment.balance_due)) return null

  const aged = (payment.due_91_120 ?? 0) + (payment.due_121_plus ?? 0)
  if (aged > 0) {
    // "of it": the aged buckets are part of the balance, not a figure left
    // after something was collected. Nothing here is ever a deduction.
    return { reason: 'critical', detail: `${formatCurrency(aged)} of it past 90 days`, urgency: -aged }
  }

  const nearing = payment.due_61_90 ?? 0
  if (nearing > 0) {
    return {
      reason: 'overdue',
      detail: `${formatCurrency(nearing)} of it in the 61–90 day bucket · crosses 90 next`,
      urgency: -nearing,
    }
  }

  return null
}

/** Most urgent first: by reason, then by each reason's own urgency. */
export function sortByAttention<T>(items: T[], of: (item: T) => Attention | null): T[] {
  return items
    .map((item, index) => ({ item, index, attention: of(item) }))
    .filter((entry): entry is { item: T; index: number; attention: Attention } => entry.attention !== null)
    .sort(
      (a, b) =>
        ATTENTION_ORDER.indexOf(a.attention.reason) - ATTENTION_ORDER.indexOf(b.attention.reason) ||
        a.attention.urgency - b.attention.urgency ||
        a.index - b.index
    )
    .map((entry) => entry.item)
}

/** The reason that starts a new group at `index` of a sorted list, if any. */
export function groupStartingAt<T>(
  items: T[],
  index: number,
  of: (item: T) => Attention | null
): AttentionReason | null {
  const here = of(items[index])?.reason ?? null
  if (!here) return null
  const before = index > 0 ? of(items[index - 1])?.reason ?? null : null
  return here === before ? null : here
}

export function countByReason<T>(items: T[], of: (item: T) => Attention | null): Record<AttentionReason, number> {
  const counts: Record<AttentionReason, number> = { critical: 0, overdue: 0, due_soon: 0 }
  for (const item of items) {
    const attention = of(item)
    if (attention) counts[attention.reason]++
  }
  return counts
}
