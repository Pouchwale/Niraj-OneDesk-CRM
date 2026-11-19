/**
 * Robi's daily list for a coordinator who works only on Ready for Dispatch
 * (Avani, 19 Nov 2026). The user's rules:
 *
 * - Seven tasks a day, one per customer, from their RFD lines.
 * - Most of them (four or five) are customers with a line waiting 47 to 52
 *   days; the rest are split half and half between older (over 52 days) and
 *   newer (under 47) customers. Whichever group runs short, the others fill
 *   the list up to seven.
 * - Inside each group, the biggest pending amount comes first.
 * - Customers owing under ₹1,000 are left out, as for everyone else.
 * - Done when a follow-up is logged on the customer. A next follow-up date
 *   makes Robi wait for it; with no date the customer rests five days - or
 *   three when a line has waited 80 days or more, so the oldest come back two
 *   or three times a week.
 */

import type { Followup, RfdRow } from '../../lib/types'
import { accountKeyOf } from '../../lib/account-key'
import { formatCurrency, formatRelativeDate, toLocalISODate } from '../../lib/utils'
import { PLAN_MIN_AMOUNT, waitingCustomers, type BalanceOf, type CustomerOf, type PlanItem } from './daily-plan'

/** Fresh RFD tasks a day; four on a half day. */
export const RFD_PLAN_SIZE = 7
export const RFD_HALF_DAY_SIZE = 4
/** The days-waiting band that leads the list. */
export const RFD_BAND = { from: 47, to: 52 } as const
/** Of the seven, up to five come from the band. */
const BAND_SHARE = 5 / 7
/** A customer with a line this old rests only three days after a follow-up. */
export const RFD_OLD_DAYS = 80
export const RFD_OLD_REST_DAYS = 3

export type RfdGroup = 'band' | 'older' | 'newer'

export interface RfdCustomer {
  /** The customer, as the rest of the CRM keys them (BP code, else name). */
  key: string
  name: string
  /** The record follow-ups are logged on (the RFD page logs on this one). */
  entityType: 'company' | 'overdue_payment'
  entityId: string
  pending: number
  /** The longest any of their lines has waited, today. */
  maxDays: number
  group: RfdGroup
  lines: RfdRow[]
}

const DAY = 86_400_000
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY

/** Days a line has waited on `date`: from Ready Since, else the sheet's Days moved on since it was read. */
export function rfdDaysOn(row: Pick<RfdRow, 'ready_since' | 'days' | 'imported_at'>, date: string): number {
  if (row.ready_since && /^\d{4}-\d{2}-\d{2}/.test(row.ready_since)) return Math.max(0, dayNumber(date) - dayNumber(row.ready_since.slice(0, 10)))
  const read = row.imported_at ? toLocalISODate(new Date(row.imported_at)) : date
  return Math.max(0, (row.days ?? 0) + Math.max(0, dayNumber(date) - dayNumber(read)))
}

const inBand = (days: number) => days >= RFD_BAND.from && days <= RFD_BAND.to

/** The coordinator's RFD customers on `date`: lines with a record to log on, grouped per customer. */
export function rfdCustomers(rows: RfdRow[], userId: string, date: string): RfdCustomer[] {
  const byKey = new Map<string, RfdCustomer & { band: boolean }>()
  for (const row of rows) {
    if (row.assigned_coordinator_id !== userId || row.pending_value <= 0) continue
    if (!row.anchor_id || (row.anchor_type !== 'company' && row.anchor_type !== 'overdue_payment')) continue
    const key = accountKeyOf(row.bp_code, row.customer_name)
    const days = rfdDaysOn(row, date)
    const held = byKey.get(key)
    if (!held) {
      byKey.set(key, {
        key,
        name: row.customer_name,
        entityType: row.anchor_type,
        entityId: row.anchor_id,
        pending: row.pending_value,
        maxDays: days,
        group: 'newer',
        lines: [row],
        band: inBand(days),
      })
      continue
    }
    held.pending += row.pending_value
    held.maxDays = Math.max(held.maxDays, days)
    held.band ||= inBand(days)
    held.lines.push(row)
  }
  return [...byKey.values()].map(({ band, ...c }) => ({
    ...c,
    group: band ? 'band' : c.maxDays > RFD_BAND.to ? 'older' : 'newer',
    // The line the task opens comes first: a 47-52 day one when that is why the
    // customer is on the list, else the longest waiting.
    lines: c.lines.sort(
      (a, b) =>
        Number(band && inBand(rfdDaysOn(b, date))) - Number(band && inBand(rfdDaysOn(a, date))) ||
        rfdDaysOn(b, date) - rfdDaysOn(a, date) ||
        b.pending_value - a.pending_value
    ),
  }))
}

/** What the plan needs to read RFD work: which customer a record is, what they owe, which records are open. */
export function rfdLookups(customers: RfdCustomer[]): { customerOf: CustomerOf; balanceOf: BalanceOf; open: Set<string> } {
  const customer = new Map<string, string>()
  const owed = new Map<string, number>()
  for (const c of customers) {
    for (const line of c.lines) customer.set(`${line.anchor_type}:${line.anchor_id}`, c.key)
    customer.set(`${c.entityType}:${c.entityId}`, c.key)
    owed.set(`${c.entityType}:${c.entityId}`, c.pending)
  }
  return {
    customerOf: (key) => customer.get(key) ?? null,
    balanceOf: (key) => owed.get(key) ?? null,
    open: new Set(customer.keys()),
  }
}

/**
 * Customers Robi leaves alone today: waiting for a next follow-up date, or
 * resting after a follow-up with none - five days, three for the 80-day ones.
 */
export function rfdWaiting(followups: Followup[], date: string, customers: RfdCustomer[], customerOf: CustomerOf): Set<string> {
  const old = new Set(customers.filter((c) => c.maxDays >= RFD_OLD_DAYS).map((c) => c.key))
  return waitingCustomers(followups, date, customerOf, true, (key) => (old.has(key) ? RFD_OLD_REST_DAYS : undefined))
}

/** How many of each group go on a list of `size`: the band first, the rest half and half, the shortfall filled. */
export function rfdPick(customers: RfdCustomer[], size: number): RfdCustomer[] {
  const biggest = (group: RfdGroup) => customers.filter((c) => c.group === group).sort((a, b) => b.pending - a.pending || b.maxDays - a.maxDays)
  const band = biggest('band')
  const older = biggest('older')
  const newer = biggest('newer')
  const fromBand = Math.min(band.length, Math.round(size * BAND_SHARE))
  const rest = size - fromBand
  const fromOlder = Math.min(older.length, Math.ceil(rest / 2))
  const fromNewer = Math.min(newer.length, rest - fromOlder)
  const picked = [...band.slice(0, fromBand), ...older.slice(0, fromOlder), ...newer.slice(0, fromNewer)]
  // Short somewhere: older, then newer, then more of the band make up the seven.
  for (const c of [...older.slice(fromOlder), ...newer.slice(fromNewer), ...band.slice(fromBand)]) {
    if (picked.length >= size) break
    picked.push(c)
  }
  const order: Record<RfdGroup, number> = { band: 0, older: 1, newer: 2 }
  return picked.sort((a, b) => order[a.group] - order[b.group] || b.pending - a.pending)
}

/** The words of a task, as the customer stands today. */
export function rfdMessage(c: RfdCustomer, date: string, lastContact: string | null): string {
  const orders = [...new Set(c.lines.map((l) => l.sales_order).filter(Boolean))]
  const shown = orders.slice(0, 3).join(', ') + (orders.length > 3 ? ` +${orders.length - 3}` : '')
  const lead = c.lines[0] ? rfdDaysOn(c.lines[0], date) : c.maxDays
  return `Ready for Dispatch: ${formatCurrency(c.pending)} pending on ${c.lines.length} line${c.lines.length === 1 ? '' : 's'}${
    shown ? ` (SO ${shown})` : ''
  }, waiting ${lead} days${c.maxDays > lead ? ` (oldest ${c.maxDays})` : ''} — ${lastContact ? `last contact ${formatRelativeDate(lastContact)}` : 'never followed up'}.`
}

/** One customer as a plan task; it opens their longest-waiting line on the RFD page. */
export function rfdItem(c: RfdCustomer, date: string, lastContact: string | null, plannedAt: string): PlanItem {
  return {
    taskId: `rfd:${date}:${c.key}`,
    kind: 'rfd_followup',
    message: rfdMessage(c, date, lastContact),
    entityType: c.entityType,
    entityId: c.entityId,
    entityName: c.name,
    amount: c.pending,
    rfdLineId: c.lines[0]?.id,
    plannedAt,
  }
}

/**
 * The day's RFD list: what was left from before (still owed, nobody waiting
 * on a date) on top, then `size` fresh customers by the rules above.
 */
export function rfdPlanItems(input: {
  rows: RfdRow[]
  userId: string
  date: string
  followups: Followup[]
  carried: PlanItem[]
  size: number
  now?: Date
}): PlanItem[] {
  const { rows, userId, date, followups, size } = input
  const now = (input.now ?? new Date()).toISOString()
  const customers = rfdCustomers(rows, userId, date)
  const byKey = new Map(customers.map((c) => [c.key, c]))
  const { customerOf } = rfdLookups(customers)
  const waiting = rfdWaiting(followups, date, customers, customerOf)

  const lastContact = new Map<string, string>()
  for (const f of followups) {
    const key = customerOf(`${f.entity_type}:${f.entity_id}`)
    const at = f.created_at ?? f.followup_date
    if (key && (!lastContact.has(key) || at > lastContact.get(key)!)) lastContact.set(key, at)
  }

  const taken = new Set<string>()
  const brought: PlanItem[] = []
  for (const item of input.carried) {
    const key = item.entityType && item.entityId ? customerOf(`${item.entityType}:${item.entityId}`) : null
    const c = key ? byKey.get(key) : undefined
    if (!c || taken.has(c.key) || waiting.has(c.key) || c.pending < PLAN_MIN_AMOUNT) continue
    taken.add(c.key)
    brought.push({
      ...rfdItem(c, date, lastContact.get(c.key) ?? null, item.plannedAt ?? now),
      taskId: item.taskId,
      carriedFrom: item.carriedFrom,
    })
  }

  const fresh = rfdPick(
    customers.filter((c) => !taken.has(c.key) && !waiting.has(c.key) && c.pending >= PLAN_MIN_AMOUNT),
    size
  )
  return [...brought, ...fresh.map((c) => rfdItem(c, date, lastContact.get(c.key) ?? null, now))]
}
