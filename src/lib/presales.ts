/**
 * Pre Sales Analysis (14 Nov 2026): the same months last year against this
 * year, item by item, from the Pre-Sales-Order-CRM sales-order lines.
 *
 * For each month picked, "this year" is its next occurrence counting the
 * current month (in November: November and December 2026, January 2027) and
 * "last year" the same month a year before. Every item a customer ordered in
 * those months last year is followed on its own (the user: "the company has
 * multiple items, so it should be reminded as per item"): ordered again this
 * year, followed up (until the follow-up's next date, or 30 days without
 * one), or to remind. Orders are distinct sales orders; quantity is the sum of
 * the lines (the file has no amount).
 */

import { itemKeyOf, type PresalesCustomer, type PresalesFollowup, type PresalesLine } from '../../shared/presales'

export interface MonthWindow {
  /** 1-12 */
  month: number
  thisYear: number
  lastYear: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthName = (m: number) => MONTHS[m - 1]

/** This month and the next: the page's starting choice. */
export function defaultMonths(today: string): number[] {
  const m = Number(today.slice(5, 7))
  return [m, (m % 12) + 1]
}

/** Each picked month with the year it falls in this time round and the year before. */
export function monthWindows(months: readonly number[], today: string): MonthWindow[] {
  const year = Number(today.slice(0, 4))
  const current = Number(today.slice(5, 7))
  return [...new Set(months)]
    .filter((m) => m >= 1 && m <= 12)
    .map((m) => {
      const thisYear = m >= current ? year : year + 1
      return { month: m, thisYear, lastYear: thisYear - 1 }
    })
    .sort((a, b) => a.thisYear - b.thisYear || a.month - b.month)
}

/** "Nov 2025 – Dec 2025" for one side of the windows. */
export function windowLabel(windows: readonly MonthWindow[], side: 'thisYear' | 'lastYear'): string {
  if (!windows.length) return '—'
  const parts = windows.map((w) => `${monthName(w.month)} ${w[side]}`)
  return parts.length <= 2 ? parts.join(' – ') : `${parts[0]} … ${parts[parts.length - 1]} (${parts.length} months)`
}

const inSide = (day: string, windows: readonly MonthWindow[], side: 'thisYear' | 'lastYear') => {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  return windows.some((w) => w.month === m && w[side] === y)
}

/** With no next date, a follow-up holds an item for this many days. */
export const FOLLOWUP_HOLD_DAYS = 30

export type ItemState = 'to_remind' | 'followed_up' | 'ordered_again'

export interface ItemSummary {
  key: string
  itemCode: string
  itemName: string
  /** In the months last year. */
  orders: number
  qty: number
  lastDate: string
  /** In the same months this year, so far. */
  thisYearOrders: number
  thisYearQty: number
  state: ItemState
  /** The latest follow-up about this item, if any. */
  followup: PresalesFollowup | null
}

export interface CustomerPreSales extends PresalesCustomer {
  lastYear: { orders: number; qty: number }
  thisYear: { orders: number; qty: number }
  items: ItemSummary[]
  counts: Record<ItemState, number>
  /** The customer's latest order of all, whenever it was. */
  lastOrder: string | null
  /** Their follow-ups, newest first. */
  followups: PresalesFollowup[]
  /** to_remind: an item to remind; followed_up: none to remind, one held by a follow-up; ordered_again: every item reordered. */
  status: ItemState
}

/** Whether a follow-up still holds an item on `today`: until its next date, or for 30 days without one. */
export function followupHolds(f: Pick<PresalesFollowup, 'at' | 'nextDate'>, today: string): boolean {
  if (f.nextDate) return today < f.nextDate
  return (Date.parse(`${today}T00:00:00`) - Date.parse(f.at)) / 86_400_000 < FOLLOWUP_HOLD_DAYS
}

/** Every customer who ordered in the months last year, item by item; those with most items to remind first. */
export function analysePresales(
  customers: readonly PresalesCustomer[],
  lines: readonly PresalesLine[],
  windows: readonly MonthWindow[],
  followups: readonly PresalesFollowup[] = [],
  today = ''
): CustomerPreSales[] {
  const byCustomer = new Map<string, PresalesLine[]>()
  for (const l of lines) {
    const list = byCustomer.get(l.c)
    if (list) list.push(l)
    else byCustomer.set(l.c, [l])
  }
  const followupsOf = new Map<string, PresalesFollowup[]>()
  for (const f of followups) followupsOf.set(f.customerCode, [...(followupsOf.get(f.customerCode) ?? []), f])
  const out: CustomerPreSales[] = []
  for (const customer of customers) {
    const all = byCustomer.get(customer.code) ?? []
    const last = all.filter((l) => inSide(l.d, windows, 'lastYear'))
    if (!last.length) continue
    const now = all.filter((l) => inSide(l.d, windows, 'thisYear'))
    const mine = (followupsOf.get(customer.code) ?? []).slice().sort((a, b) => b.at.localeCompare(a.at))
    const items = new Map<string, { itemCode: string; itemName: string; sos: Set<string>; qty: number; lastDate: string }>()
    for (const l of last) {
      const k = itemKeyOf(l)
      const held = items.get(k) ?? { itemCode: l.ic, itemName: l.in, sos: new Set<string>(), qty: 0, lastDate: l.d }
      held.sos.add(l.so)
      held.qty += l.q
      if (l.d > held.lastDate) held.lastDate = l.d
      items.set(k, held)
    }
    const summaries: ItemSummary[] = [...items.entries()].map(([key, i]) => {
      const again = now.filter((l) => itemKeyOf(l) === key)
      const followup = mine.find((f) => f.items.includes(key)) ?? null
      const thisYearOrders = new Set(again.map((l) => l.so)).size
      const state: ItemState = thisYearOrders > 0 ? 'ordered_again' : followup && followupHolds(followup, today) ? 'followed_up' : 'to_remind'
      return { key, itemCode: i.itemCode, itemName: i.itemName, orders: i.sos.size, qty: i.qty, lastDate: i.lastDate, thisYearOrders, thisYearQty: again.reduce((s, l) => s + l.q, 0), state, followup }
    })
    const order: Record<ItemState, number> = { to_remind: 0, followed_up: 1, ordered_again: 2 }
    summaries.sort((a, b) => order[a.state] - order[b.state] || b.qty - a.qty || a.itemName.localeCompare(b.itemName))
    const counts: Record<ItemState, number> = { to_remind: 0, followed_up: 0, ordered_again: 0 }
    for (const i of summaries) counts[i.state]++
    out.push({
      ...customer,
      lastYear: { orders: new Set(last.map((l) => l.so)).size, qty: last.reduce((s, l) => s + l.q, 0) },
      thisYear: { orders: new Set(now.map((l) => l.so)).size, qty: now.reduce((s, l) => s + l.q, 0) },
      items: summaries,
      counts,
      lastOrder: all.reduce<string | null>((max, l) => (!max || l.d > max ? l.d : max), null),
      followups: mine,
      status: counts.to_remind ? 'to_remind' : counts.followed_up ? 'followed_up' : 'ordered_again',
    })
  }
  return out.sort((a, b) => b.counts.to_remind - a.counts.to_remind || b.lastYear.orders - a.lastYear.orders || a.name.localeCompare(b.name))
}
