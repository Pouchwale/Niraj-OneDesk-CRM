/**
 * The RFD (Ready for Dispatch) sheet: finished goods in the warehouse, with
 * money to come before they go. It names only the customer, so each line is
 * linked by name to the customer's record in Active or Overdue Payments, which
 * gives it a BP code, a coordinator and a record to log follow-ups against.
 * Only lines with a pending amount are kept.
 */

import type { Company, FollowupEntityType, OverduePayment, RfdRow } from './types'
import { normalizeDate } from './file-parser'

/** The sheet's columns, by the names SAP gives them (matched loosely). */
const COLUMNS = {
  customer_name: ['customer name', 'customer'],
  production_order: ['production order no', 'production order'],
  po_status: ['po status'],
  sales_order: ['sales order no', 'sales order'],
  item_code: ['fg item code', 'item code'],
  item_name: ['fg item name', 'item name'],
  item_group: ['item group'],
  planned_qty: ['po planned qty', 'planned qty'],
  rfd_qty: ['rfd qty'],
  uom: ['uom'],
  so_rate: ['so rate', 'rate'],
  rfd_value: ['rfd value'],
  paid_1: ['payment amount 1'],
  paid_2: ['payment amount 2'],
  pending_value: ['pending rfd value', 'pending value'],
  warehouse: ['warehouse'],
  batches: ['no of batches', 'batches'],
  ready_since: ['ready since'],
  days: ['days'],
} as const

type Field = keyof typeof COLUMNS
export type RfdMapping = Partial<Record<Field, string>>

export const RFD_REQUIRED: Field[] = ['customer_name', 'pending_value']

/**
 * Item categories that always go to one coordinator, whoever the customer
 * belongs to (since 13 Oct 2026): every FGPO (FG-Pouch) line is Avani Patel's.
 * Everything else follows the customer's coordinator, matched by name.
 */
export const RFD_CATEGORY_OWNERS: { itemPrefix: string; coordinator: string }[] = [
  { itemPrefix: 'FGPO', coordinator: 'Avani Patel' },
]

/** The coordinator a line's item category belongs to, if any. */
export function categoryOwner(itemCode: string | null): string | null {
  const code = (itemCode ?? '').trim().toUpperCase()
  return RFD_CATEGORY_OWNERS.find((o) => code.startsWith(o.itemPrefix))?.coordinator ?? null
}

const loose = (h: string) => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

/** Which sheet column feeds each field; exact names first, so "RFD Value" never takes "Pending RFD Value". */
export function autoMapRfdColumns(headers: string[]): RfdMapping {
  const mapping: RfdMapping = {}
  const used = new Set<string>()
  for (const field of Object.keys(COLUMNS) as Field[]) {
    const hit = headers.find((h) => !used.has(h) && (COLUMNS[field] as readonly string[]).includes(loose(h)))
    if (hit) {
      mapping[field] = hit
      used.add(hit)
    }
  }
  return mapping
}

/** How well a sheet looks like the RFD sheet: what only it has. */
export function scoreRfdSheet(headers: string[]): number {
  const m = autoMapRfdColumns(headers)
  return (['customer_name', 'rfd_value', 'pending_value', 'rfd_qty', 'ready_since', 'production_order'] as Field[]).filter((f) => m[f]).length
}

const text = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s === '' ? null : s
}
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/[,\s₹]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** A customer name reduced to what identifies it: case, punctuation and company suffixes don't matter. */
export function customerKey(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\bm\/s\.?/g, '')
    .replace(/\bprivate\b/g, 'pvt')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/[^a-z0-9]/g, '')
}
const withoutSuffix = (key: string) => key.replace(/(pvtltd|ltd|llp|pvt|inc|co)+$/, '')

interface Anchor {
  type: FollowupEntityType
  id: string
  bp: string | null
  coordinatorId: string | null
  coordinatorName: string | null
}

/**
 * Finds each customer's record: the ageing row first (one per customer), else
 * their largest open invoice. Exact name first, then without "Pvt Ltd" and the
 * like, used only when that names one customer.
 */
export function anchorFinder(companies: Company[], overduePayments: OverduePayment[]) {
  const exact = new Map<string, Anchor>()
  const loose = new Map<string, Anchor | null>()
  const put = (name: string, anchor: Anchor) => {
    const key = customerKey(name)
    if (!key) return
    if (!exact.has(key)) exact.set(key, anchor)
    const short = withoutSuffix(key)
    const held = loose.get(short)
    // Two different customers on the same short name: too vague to use.
    loose.set(short, held === undefined || held?.bp === anchor.bp ? anchor : null)
  }
  for (const p of overduePayments) {
    put(p.customer_name || p.bp_code, {
      type: 'overdue_payment', id: p.id, bp: p.bp_code, coordinatorId: p.assigned_coordinator_id, coordinatorName: p.coordinator_name,
    })
  }
  const invoices = [...companies].sort((a, b) => (b.total_amount ?? 0) - (a.total_amount ?? 0))
  for (const c of invoices) {
    put(c.name, {
      type: 'company', id: c.id, bp: c.sap_bp_code, coordinatorId: c.assigned_coordinator_id, coordinatorName: c.coordinator_name ?? null,
    })
  }
  return (name: string): Anchor | null => {
    const key = customerKey(name)
    return exact.get(key) ?? loose.get(withoutSuffix(key)) ?? null
  }
}

/** The sheet's rows as RFD lines with money pending, each linked to its customer. */
export function buildRfdRows(
  rows: Record<string, unknown>[],
  mapping: RfdMapping,
  companies: Company[],
  overduePayments: OverduePayment[],
  importedAt: string,
  /** A coordinator's user id from their full name. */
  userIdByName: (name: string) => string | null | undefined = () => null
): { rows: RfdRow[]; unlinked: string[] } {
  const find = anchorFinder(companies, overduePayments)
  const cell = (row: Record<string, unknown>, field: Field) => (mapping[field] ? row[mapping[field]!] : null)
  const seen = new Map<string, number>()
  const out: RfdRow[] = []
  const unlinked = new Set<string>()

  for (const row of rows) {
    const customer = text(cell(row, 'customer_name'))
    const pending = num(cell(row, 'pending_value')) ?? 0
    if (!customer || pending <= 0) continue
    const anchor = find(customer)
    if (!anchor) unlinked.add(customer)

    // FGPO and the like go to their category's coordinator; the rest to the customer's.
    const itemCode = text(cell(row, 'item_code'))
    const byCategory = categoryOwner(itemCode)
    const categoryId = byCategory ? userIdByName(byCategory) ?? null : null

    const base = [cell(row, 'production_order'), cell(row, 'sales_order'), cell(row, 'item_code'), cell(row, 'warehouse')].map((v) => text(v) ?? '-').join(':')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)

    out.push({
      id: `rfd:${base}${n > 1 ? `:${n}` : ''}`,
      customer_name: customer,
      production_order: text(cell(row, 'production_order')),
      po_status: text(cell(row, 'po_status')),
      sales_order: text(cell(row, 'sales_order')),
      item_code: text(cell(row, 'item_code')),
      item_name: text(cell(row, 'item_name')),
      item_group: text(cell(row, 'item_group')),
      planned_qty: num(cell(row, 'planned_qty')),
      rfd_qty: num(cell(row, 'rfd_qty')),
      uom: text(cell(row, 'uom')),
      so_rate: num(cell(row, 'so_rate')),
      rfd_value: num(cell(row, 'rfd_value')) ?? 0,
      paid_1: num(cell(row, 'paid_1')) ?? 0,
      paid_2: num(cell(row, 'paid_2')) ?? 0,
      pending_value: pending,
      warehouse: text(cell(row, 'warehouse')),
      batches: num(cell(row, 'batches')),
      ready_since: normalizeDate(cell(row, 'ready_since')),
      days: num(cell(row, 'days')),
      bp_code: anchor?.bp ?? null,
      assigned_coordinator_id: byCategory ? categoryId : anchor?.coordinatorId ?? null,
      coordinator_name: byCategory ?? anchor?.coordinatorName ?? null,
      anchor_type: anchor?.type ?? null,
      anchor_id: anchor?.id ?? null,
      imported_at: importedAt,
    })
  }
  return { rows: out, unlinked: [...unlinked].sort() }
}
