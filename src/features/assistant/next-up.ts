/**
 * The overdue accounts Robi hands out once the morning's Active Payments tasks
 * are done, a round at a time, until nobody is left to ring (see
 * extendPlanIfFinished): the oldest money first, then the biggest balance.
 *
 * Same rules as the rest of the plan: nothing under PLAN_MIN_AMOUNT, nothing
 * already set aside or settled, one per customer, nobody already rung today
 * and nobody already on the plan.
 */

import type { Followup, OverduePayment } from '@/lib/types'
import { isNoFollowup } from '@/lib/no-followup'
import { accountKeyOf } from '@/lib/account-key'
import { enteredAt, entityKeyOf, PLAN_MIN_AMOUNT, waitingCustomers, type CustomerOf, type PlanItem } from './daily-plan'

export interface NextUp {
  id: string
  name: string
  balance: number
  /** Money past 90 days. */
  critical: number
  /** The oldest ageing bucket holding money: 0 for 0-30 days up to 4 for 121+. */
  oldestBucket: number
  /** When this coordinator last logged anything on the customer; null for never. */
  lastContact: string | null
}

export const NEXT_UP_SIZE = 5

export function nextToFollowUp(input: {
  userId: string
  overduePayments: OverduePayment[]
  followups: Followup[]
  /** Today's plan: its customers are not offered again. */
  planItems: PlanItem[]
  /** Local midnight today, as an ISO instant. */
  startOfToday: string
  customerOf?: CustomerOf
  limit?: number
  /** Local date: customers with a next follow-up date after it are left out. */
  today?: string
}): NextUp[] {
  const { userId, overduePayments, followups, planItems, startOfToday, customerOf } = input
  const customer = (entityKey: string) => customerOf?.(entityKey) ?? entityKey
  const waiting = input.today ? waitingCustomers(followups, input.today, customerOf) : new Set<string>()

  const planned = new Set(
    planItems.map((item) => entityKeyOf(item)).filter((key): key is string => key !== null).map(customer)
  )

  const lastContact = new Map<string, string>()
  for (const f of followups) {
    if (f.coordinator_id !== userId) continue
    const key = customer(`${f.entity_type}:${f.entity_id}`)
    const at = enteredAt(f)
    if (!lastContact.has(key) || at > lastContact.get(key)!) lastContact.set(key, at)
  }

  const seen = new Set<string>()
  const candidates: (NextUp & { key: string })[] = []
  for (const p of overduePayments) {
    if (p.assigned_coordinator_id !== userId) continue
    if (p.status === 'settled' || p.status === 'bankrupt' || isNoFollowup(p)) continue
    if ((p.balance_due ?? 0) < PLAN_MIN_AMOUNT) continue
    const key = customerOf?.(`overdue_payment:${p.id}`) ?? accountKeyOf(p.bp_code, p.customer_name)
    if (planned.has(key) || seen.has(key) || waiting.has(key)) continue
    const last = lastContact.get(key) ?? null
    // Rung today already: that is today's work done, not work to do.
    if (last && last >= startOfToday) continue
    seen.add(key)
    candidates.push({
      key,
      id: p.id,
      name: p.customer_name || p.bp_code,
      balance: p.balance_due ?? 0,
      critical: (p.due_91_120 ?? 0) + (p.due_121_plus ?? 0),
      oldestBucket: oldestBucketOf(p),
      lastContact: last,
    })
  }

  // The oldest money first (121+ days, then 91-120, ...), then the biggest
  // balance, then whoever has gone longest without a call.
  candidates.sort(
    (a, b) =>
      b.oldestBucket - a.oldestBucket ||
      b.balance - a.balance ||
      (a.lastContact ?? '').localeCompare(b.lastContact ?? '')
  )
  return candidates.slice(0, input.limit ?? NEXT_UP_SIZE).map(({ key: _key, ...rest }) => rest)
}

const BUCKETS_OLDEST_LAST = ['due_0_30', 'due_31_60', 'due_61_90', 'due_91_120', 'due_121_plus'] as const

/** How old the account's oldest money is, as a bucket index; -1 when no bucket holds any. */
function oldestBucketOf(payment: OverduePayment): number {
  for (let i = BUCKETS_OLDEST_LAST.length - 1; i >= 0; i--) {
    if ((payment[BUCKETS_OLDEST_LAST[i]] ?? 0) > 0) return i
  }
  return -1
}