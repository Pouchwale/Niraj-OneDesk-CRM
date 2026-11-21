import { normalizeBpCode } from './bp-code'
import { isSetAside, type BankruptFields, type NoFollowupFields } from './no-followup'

type InvoiceState = NoFollowupFields & BankruptFields & { sap_bp_code: string | null; status: string | null }

/**
 * True while a customer still has an invoice being chased (21 Nov 2026).
 *
 * A customer-wide follow-up is filed on one invoice but speaks for them all, so
 * its promise and reminder stay alive when that one invoice is paid and others
 * are still open.
 */
export function customerStillOpen(code: string | null | undefined, invoices: readonly InvoiceState[]): boolean {
  const key = normalizeBpCode(code)
  return key !== null && invoices.some((c) => normalizeBpCode(c.sap_bp_code) === key && c.status !== 'paid' && !isSetAside(c))
}
