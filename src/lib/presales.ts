/**
 * Pre Sales Analysis (14 Nov 2026): the same months last year against this
 * year, from the Pre-Sales-Order-CRM sales-order lines.
 *
 * For each month picked, "this year" is its next occurrence counting the
 * current month (in November: November and December 2026, January 2027) and
 * "last year" the same month a year before. A customer who ordered in those
 * months last year and has no order in them this year is one to remind before
 * their usual time; one who has ordered again is shown as such. Orders are
 * counted as distinct sales orders; quantity is the sum of the lines (the file
 * has no amount).
 */

import type { PresalesCustomer, PresalesLine, PresalesReminder } from '../../shared/presales'

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

export interface ItemSummary {
  itemCode: string
  itemName: string
  orders: number
  qty: number
  lastDate: string
}

export interface CustomerPreSales extends PresalesCustomer {
  lastYear: { orders: number; qty: number; items: ItemSummary[] }
  thisYear: { orders: number; qty: number }
  /** The customer's latest order of all, whenever it was. */
  lastOrder: string | null
  status: 'to_remind' | 'ordered_again'
}

/** Every customer who ordered in the months last year, with this year beside it; most last-year orders first. */
export function analysePresales(customers: readonly PresalesCustomer[], lines: readonly PresalesLine[], windows: readonly MonthWindow[]): CustomerPreSales[] {
  const byCustomer = new Map<string, PresalesLine[]>()
  for (const l of lines) {
    const list = byCustomer.get(l.c)
    if (list) list.push(l)
    else byCustomer.set(l.c, [l])
  }
  const out: CustomerPreSales[] = []
  for (const customer of customers) {
    const all = byCustomer.get(customer.code) ?? []
    const last = all.filter((l) => inSide(l.d, windows, 'lastYear'))
    if (!last.length) continue
    const now = all.filter((l) => inSide(l.d, windows, 'thisYear'))
    const items = new Map<string, ItemSummary & { sos: Set<string> }>()
    for (const l of last) {
      const k = l.ic || l.in
      const held = items.get(k) ?? { itemCode: l.ic, itemName: l.in, orders: 0, qty: 0, lastDate: l.d, sos: new Set<string>() }
      held.sos.add(l.so)
      held.qty += l.q
      if (l.d > held.lastDate) held.lastDate = l.d
      items.set(k, held)
    }
    const nowOrders = new Set(now.map((l) => l.so)).size
    out.push({
      ...customer,
      lastYear: {
        orders: new Set(last.map((l) => l.so)).size,
        qty: last.reduce((s, l) => s + l.q, 0),
        items: [...items.values()]
          .map(({ sos, ...i }) => ({ ...i, orders: sos.size }))
          .sort((a, b) => b.qty - a.qty || a.itemName.localeCompare(b.itemName)),
      },
      thisYear: { orders: nowOrders, qty: now.reduce((s, l) => s + l.q, 0) },
      lastOrder: all.reduce<string | null>((max, l) => (!max || l.d > max ? l.d : max), null),
      status: nowOrders > 0 ? 'ordered_again' : 'to_remind',
    })
  }
  return out.sort((a, b) => b.lastYear.orders - a.lastYear.orders || b.lastYear.qty - a.lastYear.qty || a.name.localeCompare(b.name))
}

/** A reminder counts as this round's when it is no older than this. */
export const REMINDER_FRESH_DAYS = 30

/** The customer's latest reminder, and whether it is recent enough to count as reminded. */
export function reminderOf(reminders: readonly PresalesReminder[], code: string, today: string): { latest: PresalesReminder | null; reminded: boolean; count: number } {
  const mine = reminders.filter((r) => r.customerCode === code).sort((a, b) => b.at.localeCompare(a.at))
  const latest = mine[0] ?? null
  if (!latest) return { latest: null, reminded: false, count: 0 }
  const age = (Date.parse(`${today}T23:59:59`) - Date.parse(latest.at)) / 86_400_000
  return { latest, reminded: age <= REMINDER_FRESH_DAYS, count: mine.length }
}
