/**
 * Whose customer each code is, as the Active Payments file says (21 Nov 2026).
 *
 * The user chose this file's Coordinator column to decide a Pre Sales
 * customer's owner: the name on the customer's latest invoice, paid or not. It
 * counts only when it names one current coordinator, so someone who has left
 * or been switched off never gets a customer from it.
 */

import * as XLSX from 'xlsx'
import { coordinatorMatcher } from './match'
import { dayOf } from './read'

const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const CODE = ['bpcode', 'customercode', 'cardcode']
const COORDINATOR = ['coordinator', 'coordinatorname']
const INVOICE_DATE = ['invoicedate']

/** Customer code (upper case) → the Coordinator on its latest invoice. */
export function readPaymentCoordinators(buffer: Buffer, wantedSheet?: string | null): Map<string, string> {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, ...(wantedSheet ? { sheets: wantedSheet } : {}) })
  const order = wantedSheet ? [wantedSheet] : wb.SheetNames
  for (const sheet of order) {
    if (!wb.Sheets[sheet]) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: null, raw: true })
    const headerAt = rows.findIndex((r) => Array.isArray(r) && r.some((c) => CODE.includes(key(c))) && r.some((c) => COORDINATOR.includes(key(c))) && r.some((c) => INVOICE_DATE.includes(key(c))))
    if (headerAt < 0) continue
    const header = rows[headerAt].map(key)
    const codeAt = header.findIndex((h) => CODE.includes(h))
    const nameAt = header.findIndex((h) => COORDINATOR.includes(h))
    const dateAt = header.findIndex((h) => INVOICE_DATE.includes(h))
    const latest = new Map<string, { day: string; name: string }>()
    for (const row of rows.slice(headerAt + 1)) {
      if (!Array.isArray(row)) continue
      const code = String(row[codeAt] ?? '').trim().toUpperCase()
      const name = String(row[nameAt] ?? '').trim()
      const day = dayOf(row[dateAt])
      if (!code || !name || !day) continue
      const held = latest.get(code)
      if (!held || day >= held.day) latest.set(code, { day, name })
    }
    return new Map([...latest].map(([code, v]) => [code, v.name]))
  }
  throw new Error('No sheet has the BP Code, Coordinator and Invoice Date columns.')
}

/** A name as one current coordinator's id; null for a name that fits nobody, several people, or someone switched off. */
export function currentCoordinatorMatcher(people: readonly { id: string; name: string; disabled?: boolean }[]): (name: string | null | undefined) => string | null {
  const match = coordinatorMatcher(people)
  const off = new Set(people.filter((p) => p.disabled).map((p) => p.id))
  return (name) => {
    const id = match(name)
    return id && !off.has(id) ? id : null
  }
}
