/**
 * Special attention for money past 120 days that is held up by a credit or
 * debit note (since 13 Oct 2026). When the latest follow-up on an overdue
 * customer with a 121+ balance mentions a credit or debit note, Robi gives a
 * task for it every day - first in the list, on top of the day's eight, and
 * regardless of the five-day rest or a later follow-up date - until a newer
 * follow-up no longer mentions one.
 */

import { isSetAside } from '@/lib/no-followup'
import type { Followup, OverduePayment } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { PLAN_MIN_AMOUNT, type CustomerOf, type PlanItem } from './daily-plan'

/** "credit note", "debit note", "C.N", "CN", "D.N", "DN" - however it is written. */
export const NOTE_PATTERN = /credit\s*note|debit\s*note|\b[cd]\s?\.?\s?n\b\.?/i

export function mentionsNote(f: Pick<Followup, 'notes' | 'customer_response'>): boolean {
  return NOTE_PATTERN.test([f.customer_response, f.notes].filter(Boolean).join(' '))
}

/** True for a plan item that sits on top of the day's eight rather than in them. */
export function isOnTop(item: Pick<PlanItem, 'carriedFrom' | 'special'>): boolean {
  return Boolean(item.carriedFrom || item.special)
}

/** Today's credit/debit note tasks for one coordinator's overdue customers. */
export function notePendingItems(
  date: string,
  overduePayments: OverduePayment[],
  followups: Followup[],
  customerOf?: CustomerOf,
  plannedAt: string = new Date().toISOString()
): PlanItem[] {
  const customer = (key: string) => customerOf?.(key) ?? key
  // The latest follow-up on each customer, whichever of their records it was logged on.
  const latest = new Map<string, Followup>()
  for (const f of followups) {
    const key = customer(`${f.entity_type}:${f.entity_id}`)
    const held = latest.get(key)
    const at = (x: Followup) => `${String(x.followup_date || x.created_at).slice(0, 19)}|${x.created_at}`
    if (!held || at(f) > at(held)) latest.set(key, f)
  }

  const items: PlanItem[] = []
  const seen = new Set<string>()
  for (const p of overduePayments) {
    if ((p.due_121_plus ?? 0) <= 0 || (p.balance_due ?? 0) < PLAN_MIN_AMOUNT || isSetAside(p) || p.status === 'settled') continue
    const key = customer(`overdue_payment:${p.id}`)
    if (seen.has(key)) continue
    const last = latest.get(key)
    if (!last || !mentionsNote(last)) continue
    seen.add(key)
    const said = [last.customer_response, last.notes].filter(Boolean).join(' - ').slice(0, 140)
    items.push({
      taskId: `note:${date}:${p.id}`,
      kind: 'note_pending',
      special: 'note_pending',
      message: `Credit/debit note pending: ${p.customer_name || p.bp_code} - ${formatCurrency(p.due_121_plus)} is past 120 days. Last note: "${said}". Get the note issued or reconciled, then log where it stands.`,
      entityType: 'overdue_payment',
      entityId: p.id,
      entityName: p.customer_name || p.bp_code,
      amount: p.due_121_plus,
      plannedAt,
    })
  }
  // Biggest 121+ money first, like the rest of the plan.
  return items.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
}
