/**
 * Quotations: the rules shared by the page, the import and the tests.
 *
 * The old Quotation List workbook is imported once (13 Oct 2026); from then
 * on quotations are kept here. Its dates are MM-DD-YYYY. Cells Excel had
 * already turned into dates were read the other way round - day and month
 * swapped - which the quotation numbers prove (197 of 268 only fit swapped),
 * so those are swapped back.
 */

import type { Quotation, QuotationStatus } from './types'

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  lost: 'Lost',
}

/** The sheet's Performance Remark always followed the status, so the CRM works it out. */
export const PERFORMANCE: Record<QuotationStatus, string> = {
  closed: 'Excellent Performance',
  open: 'Good Performance',
  lost: 'Poor Performance',
}

export const QUOTATION_SOURCES = ['Label', 'Sleeve', 'Label / Sleeve'] as const

/** Follow-ups made on a quotation: those counted in the old sheet plus those logged here. */
export function followupCount(q: Pick<Quotation, 'earlier_followups' | 'followups'>): number {
  return (q.earlier_followups ?? 0) + (q.followups?.length ?? 0)
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 2000 ? `${y}-${pad(m)}-${pad(d)}` : null

/**
 * A date cell from the old sheet as yyyy-mm-dd. Text is MM-DD-YYYY or
 * MM/DD/YYYY. A real date was misread by Excel, so day and month are swapped
 * back where that gives a valid date.
 */
export function sheetDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = value.getMonth() + 1
    const d = value.getDate()
    return d <= 12 ? iso(y, d, m) : iso(y, m, d)
  }
  const m = String(value).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  return m ? iso(Number(m[3]), Number(m[1]), Number(m[2])) : null
}

const text = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s === '' || s === '-' ? null : s
}

function statusOf(v: unknown): QuotationStatus | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (s.startsWith('clos')) return 'closed'
  if (s.startsWith('lost')) return 'lost'
  if (s.startsWith('ope')) return 'open'
  return null
}

function sourceOf(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  const label = s.includes('label')
  const sleeve = s.includes('sleeve')
  if (label && sleeve) return 'Label / Sleeve'
  if (label) return 'Label'
  if (sleeve) return 'Sleeve'
  return null
}

/**
 * The old sheet's rows as quotations. `ownerOf` turns the sheet's coordinator
 * (a first name) into a user id. Rows without a status or customer are junk
 * and left out; "Pragati / Devyani" goes to the last name given.
 */
export function quotationsFromSheet(
  rows: Record<string, unknown>[],
  ownerOf: (name: string) => string | null,
  importedAt: string,
  importedBy: string
): { quotations: Quotation[]; skipped: number } {
  const out: Quotation[] = []
  let skipped = 0
  rows.forEach((row, index) => {
    const status = statusOf(row['Status'])
    const customer = text(row['Customer Name'])
    if (!status || !customer) {
      skipped++
      return
    }
    const sheetName = text(row['Coordinator Name']) ?? ''
    const named = sheetName.split('/').map((s) => s.trim()).filter(Boolean)
    const owner = named.length ? ownerOf(named[named.length - 1]) : null
    const number = text(row['Quotation No.'])
    const amount = Number(String(row['AMOUNT'] ?? '').replace(/[,\s₹]/g, ''))
    const type = String(row['Customer Type'] ?? '').trim().toLowerCase()
    out.push({
      id: `quote-import-${index + 1}-${(number ?? 'x').replace(/[^A-Za-z0-9]/g, '')}`,
      inquiry_date: sheetDate(row['MM/DD/YYYY']),
      coordinator_id: owner,
      coordinator_name: sheetName || null,
      customer_name: customer,
      concern_person: text(row['Concern person']),
      contact_number: text(row['Contact Number']),
      source: sourceOf(row['Source of inquiry']),
      quotation_date: sheetDate(row['Quotation Dt.']),
      sales_employee: text(row['Sales Employee']),
      quotation_no: number,
      followups: [],
      earlier_followups: Number(row['No of Followup']) || 0,
      closing_date: sheetDate(row['Closing Dt.']),
      status,
      customer_type: type.startsWith('new') ? 'new' : type.startsWith('exist') ? 'existing' : null,
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      lost_remark: text(row['Lost Remarks']),
      created_at: importedAt,
      created_by: importedBy,
      updated_at: importedAt,
      updated_by: importedBy,
    })
  })
  return { quotations: out, skipped }
}

/** The next number after the highest one used, keeping its prefix ("F-5293"). */
export function nextQuotationNo(quotations: Pick<Quotation, 'quotation_no'>[]): string {
  let best = 0
  let prefix = 'F-'
  for (const q of quotations) {
    const m = (q.quotation_no ?? '').match(/^(\D*?)\s*(\d+)\s*$/)
    if (m && Number(m[2]) > best) {
      best = Number(m[2])
      prefix = m[1] ? `${m[1].replace(/\s+/g, '')}` : prefix
    }
  }
  if (!prefix.endsWith('-') && prefix) prefix = `${prefix}-`
  return `${prefix || 'F-'}${best + 1}`
}
