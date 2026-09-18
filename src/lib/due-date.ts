/**
 * Working a due date out from the invoice date and the credit period.
 *
 * The workbook usually carries a due date, and where it does that is what the
 * app uses. But invoice dates get corrected, terms get renegotiated, and rows
 * arrive with a due date that no longer follows from either — so a coordinator
 * looking at an account needs to be able to say "recompute this from the
 * invoice date" and see what the terms actually imply.
 *
 * **Advance payment is the exception, and it is a real one.** "Advance 50%" is
 * not a credit period at all: the money is due before the goods move, and there
 * is no arithmetic from the invoice date that produces a meaningful date.
 * Reading it as "invoice date + 0 days" would stamp every such account as due
 * the day it was raised and overdue the day after, which is worse than leaving
 * the date alone. So these are refused, by name, with the reason said out loud.
 */

import { addDaysISO } from './utils'

/**
 * Whether the terms mean "pay before delivery" rather than a credit period.
 *
 * Deliberately separate from the day count: both answer "0 days" and only one
 * of them means it.
 */
export function isAdvancePayment(terms: string | null | undefined): boolean {
  if (!terms) return false
  return /\b(advance|prepaid|proforma|pro-forma|pia|cia)\b/i.test(String(terms))
}

/**
 * The credit period in days, or null when the terms do not state one.
 *
 * "Immediate", "COD" and "against delivery" are a real zero — the money is due
 * on the invoice date — which is not the same as advance payment, where it was
 * due before it.
 */
export function parsePaymentTermDays(terms: string | null | undefined): number | null {
  if (!terms) return null
  const str = String(terms).toLowerCase()

  if (/\b(immediate|advance|cash|cod|prepaid|against delivery)\b/.test(str)) return 0

  const match = str.match(/(\d{1,4})/)
  if (!match) return null

  const days = parseInt(match[1], 10)
  if (isNaN(days) || days < 0 || days > 3650) return null
  return days
}

/** Due date = supplied value, else invoice date + credit period. */
export function deriveDueDate(
  invoiceDate: string | null,
  dueDate: string | null,
  paymentTerms: string | null
): string | null {
  if (dueDate) return dueDate
  if (!invoiceDate) return null
  const days = parsePaymentTermDays(paymentTerms)
  if (days === null) return null
  return addDaysISO(invoiceDate, days)
}

/** Why a due date could not be worked out from the invoice date. */
export type RecalculationRefusal =
  | 'advance-payment'
  | 'no-invoice-date'
  | 'unreadable-terms'

export type Recalculation =
  | { ok: true; dueDate: string; days: number; changed: boolean }
  | { ok: false; reason: RecalculationRefusal }

/**
 * What the due date would be if it followed the invoice date and the terms.
 *
 * Returns the answer rather than applying it: whether to overwrite a date the
 * file supplied is somebody's decision, and this is the half of it that can be
 * worked out.
 */
export function recalculateDueDate(
  invoiceDate: string | null | undefined,
  paymentTerms: string | null | undefined,
  currentDueDate: string | null | undefined
): Recalculation {
  // Checked before the day count, which would otherwise answer 0 and look like
  // a credit period of nothing.
  if (isAdvancePayment(paymentTerms)) return { ok: false, reason: 'advance-payment' }
  if (!invoiceDate) return { ok: false, reason: 'no-invoice-date' }

  const days = parsePaymentTermDays(paymentTerms)
  if (days === null) return { ok: false, reason: 'unreadable-terms' }

  const dueDate = addDaysISO(invoiceDate, days)
  return { ok: true, dueDate, days, changed: dueDate !== (currentDueDate ?? null) }
}

/** Said to the person holding the account, in their terms rather than ours. */
export const REFUSAL_MESSAGE: Record<RecalculationRefusal, string> = {
  'advance-payment':
    'These are advance-payment terms, so there is no credit period to count from the invoice date.',
  'no-invoice-date': 'This invoice has no invoice date to count from.',
  'unreadable-terms': 'The payment terms do not state a credit period.',
}
