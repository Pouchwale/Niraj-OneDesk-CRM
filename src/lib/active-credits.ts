/**
 * A customer's unadjusted credits in Active Payments (28 Nov 2026, the user's
 * rule from SAP's "Bill Wise Details"): the file's lines with a minus Pending
 * Amount — Incoming Payment, Journal Entry, credit note — are kept apart on
 * every sync (they are never invoices, never Robi tasks) and shown in the
 * customer panel as lines of their own, so its totals read like SAP's:
 * Sapiens Labs 5,88,820 of invoices less 72,804 of credits = 5,16,016 pending.
 * Every other total in the CRM stays as it was (invoices only).
 *
 * Pure: no React, relative imports only.
 */

import { normalizeBpCode } from './bp-code'
import type { Company } from './types'

export interface ActiveCredit {
  bp_code: string | null
  customer_name: string
  /** "Incoming Payment", "Journal Entry", … */
  type: string
  ref_no: string | null
  date: string | null
  due_date: string | null
  basic: number | null
  tds: number | null
  gross: number | null
  /** Below zero. */
  pending: number
}

/** The mapped rows a sync reads, as far as this needs them. */
interface FileRow {
  sap_bp_code: string | null
  company_name: string
  invoice_no: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number
  extra_fields: Record<string, unknown>
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** The credit lines of a whole file: every line owing less than nothing. */
export function creditRowsOf(rows: readonly FileRow[]): ActiveCredit[] {
  return rows
    .filter((r) => Number.isFinite(r.total_amount) && r.total_amount < 0)
    .map((r) => ({
      bp_code: r.sap_bp_code,
      customer_name: r.company_name,
      type: String(r.extra_fields['Transaction Type'] ?? 'Credit'),
      ref_no: r.invoice_no,
      date: r.invoice_date,
      due_date: r.due_date,
      basic: num(r.extra_fields['Basic Amount']),
      tds: num(r.extra_fields['TDS Amount']),
      gross: num(r.extra_fields['Gross Amount']),
      pending: r.total_amount,
    }))
}

/** This customer's credits: by BP code, else by name. */
export function creditsFor(customer: { code: string | null; name: string }, credits: readonly ActiveCredit[]): ActiveCredit[] {
  const code = normalizeBpCode(customer.code)
  const name = customer.name.trim().toLowerCase()
  return credits.filter((c) => (code ? normalizeBpCode(c.bp_code) === code : c.customer_name.trim().toLowerCase() === name))
}

/** One line of the customer's table, the way SAP's Bill Wise Details lists it. */
export interface BillLine {
  /** The invoice's record, or null for a credit line. */
  invoice: Company | null
  type: string
  refNo: string | null
  date: string | null
  dueDate: string | null
  basic: number | null
  tds: number | null
  gross: number | null
  pending: number
}

/** Invoices and credits together, by date like SAP. */
export function billLines(invoices: readonly Company[], credits: readonly ActiveCredit[]): BillLine[] {
  const lines: BillLine[] = [
    ...invoices.map((inv) => {
      const x = (inv.extra_fields ?? {}) as Record<string, unknown>
      return {
        invoice: inv,
        type: String(x['Transaction Type'] ?? 'AR Invoice'),
        refNo: inv.invoice_no ?? null,
        date: inv.invoice_date,
        dueDate: inv.due_date,
        basic: num(x['Basic Amount']),
        tds: num(x['TDS Amount']),
        gross: num(x['Gross Amount']) ?? num(x['Invoice Total']),
        pending: inv.total_amount || 0,
      }
    }),
    ...credits.map((c) => ({ invoice: null, type: c.type, refNo: c.ref_no, date: c.date, dueDate: c.due_date, basic: c.basic, tds: c.tds, gross: c.gross, pending: c.pending })),
  ]
  return lines.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
}

/** SAP's two totals: Gross Amount and Pending Amount, credits included. */
export function billTotals(lines: readonly BillLine[]): { gross: number; pending: number; credits: number } {
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    gross: round(lines.reduce((a, l) => a + (l.gross ?? l.pending), 0)),
    pending: round(lines.reduce((a, l) => a + l.pending, 0)),
    credits: round(lines.filter((l) => !l.invoice).reduce((a, l) => a + l.pending, 0)),
  }
}
