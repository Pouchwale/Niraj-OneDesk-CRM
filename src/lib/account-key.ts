/**
 * How a customer, and how one of their invoices, is identified.
 *
 * Two different keys, and the difference matters:
 *
 *   - A **customer** is one BP code. That is what the ageing report is about,
 *     what a coordinator is assigned, and what the receivables book counts
 *     once.
 *   - An **invoice** is one line of the Active Payments export. The same
 *     customer appears on many of them, and the invoice number is what tells
 *     them apart.
 *
 * Active Payments used to collapse the second into the first: every invoice for
 * a customer was added up into a single row. The total was right, but the
 * detail was gone — and with it the thing the screen exists for. In the live
 * file 1,175 open invoices became 337 rows, and 133 of those customers had
 * invoices falling due on different dates, so one date had to stand in for all
 * of them and the account's status was wrong.
 *
 * The invoice number is **not unique on its own**. In the live file 26 numbers
 * are reused by different customers — invoice "27" belongs to both C0155 and
 * C0004 — so the key has to carry the customer as well. Keying on the number
 * alone would silently merge two unrelated debts.
 */

import { normalizeBpCode } from './bp-code'

/** Trimmed, case-folded, and empty when there is nothing there. */
function tidy(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

/**
 * The customer: their BP code, or their name when the file gives no code.
 *
 * Used by everything that counts a customer once — the receivables book, the
 * ageing report, setting an account aside.
 */
export function accountKeyOf(bpCode: string | null | undefined, name: string | null | undefined): string {
  const code = normalizeBpCode(bpCode ?? null)
  return code ? `bp:${code}` : `name:${tidy(name).toLowerCase()}`
}

/**
 * One invoice: the customer, and the invoice number within them.
 *
 * Falls back to the customer key when the file carries no invoice number, so a
 * one-row-per-customer export behaves exactly as it always did rather than
 * turning every row into its own account.
 */
export function invoiceKeyOf(
  bpCode: string | null | undefined,
  invoiceNo: string | null | undefined,
  name: string | null | undefined
): string {
  const invoice = tidy(invoiceNo)
  if (!invoice) return accountKeyOf(bpCode, name)
  return `${accountKeyOf(bpCode, name)}#${invoice.toUpperCase()}`
}

/** Whether two rows are the same invoice of the same customer. */
export function sameInvoice(
  a: { sap_bp_code?: string | null; invoice_no?: string | null; name?: string },
  b: { sap_bp_code?: string | null; invoice_no?: string | null; name?: string }
): boolean {
  return (
    invoiceKeyOf(a.sap_bp_code, a.invoice_no, a.name) ===
    invoiceKeyOf(b.sap_bp_code, b.invoice_no, b.name)
  )
}
