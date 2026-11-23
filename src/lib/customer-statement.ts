/**
 * The customer's invoice table inside an email (21 Nov 2026, the user's format:
 * Ref No., Date, Due on, Overdue by days, Gross Amount, Pending Amount).
 *
 * The table is added by the CRM rather than typed by Robi: every figure comes
 * from the invoices, in full, with a total. An email link can carry only plain
 * text, so the lined table cannot travel in it: the email opens with the message
 * already written and an empty line, and the table is copied for Ctrl+V there.
 * (It first opened empty, which looked broken and could have gone out blank.)
 * The plain text table is what is left for a program that cannot take that.
 */

import { daysPastDue, groupCustomers, invoiceValue, isWorkingInvoice, type CustomerAccount } from './customer-accounts'
import { normalizeBpCode } from './bp-code'
import type { EmailProvider } from './messaging'
import type { Company } from './types'
import { todayISO } from './utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** yyyy-mm-dd as 17-Oct-2025, as in the user's table. */
export function statementDate(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : '-'
}

/** The invoice number as the customer knows it, without the date that keeps a reused number apart in the CRM. */
export const plainInvoiceNo = (invoiceNo: string | null | undefined) =>
  (invoiceNo ?? '').replace(/ \(\d{2}-[A-Z][a-z]{2}-\d{4}\)$/, '') || '-'

const money = (n: number) => (Math.round((n || 0) * 100) / 100).toFixed(2)
export { money as statementAmount }

/** The table's title: the customer's name alone (the "(Label & Pouch)" was removed on 23 Nov 2026). */
export const invoiceTableTitle = (name: string) => name

/** One row per invoice: Ref No., Date, Due on, Overdue by days, Gross Amount, Pending Amount. */
export function invoiceTableRows(customer: CustomerAccount, today: string = todayISO()): string[][] {
  return customer.invoices.map((invoice) => {
    const days = daysPastDue(invoice.due_date, today)
    return [
      plainInvoiceNo(invoice.invoice_no),
      statementDate(invoice.invoice_date),
      statementDate(invoice.due_date),
      days > 0 ? String(days) : '-',
      money(invoiceValue(invoice)),
      money(invoice.total_amount || 0),
    ]
  })
}

export function invoiceTableText(customer: CustomerAccount, today: string = todayISO()): string {
  const lines = invoiceTableRows(customer, today).map((row) => row.join(' | '))
  return [
    invoiceTableTitle(customer.name),
    'Ref No. | Date | Due on | Overdue by days | Gross Amount | Pending Amount',
    ...lines,
    `Total | - | - | - | ${money(customer.totalAmount)} | ${money(customer.outstanding)}`,
    ...(customer.overdue > 0 ? [`Total Overdue: ${money(customer.overdue)}`] : []),
  ].join('\n')
}

/** Where the table goes in an email the coordinator can still edit. */
export const INVOICE_TABLE_SLOT = '[Invoice table]'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CELL =
  'border:1px solid #000;padding:2px 4px;white-space:nowrap;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#000;background:#fff;'

const cell = (value: string, align: 'left' | 'right' | 'center' = 'left', extra = '', span = 1) =>
  `<td${span > 1 ? ` colspan="${span}"` : ''} align="${align}" style="${CELL}text-align:${align};${extra}">${value}</td>`

/**
 * The table with real lines, in the user's layout (21 Nov 2026). Styles are
 * written on every cell because mail programs drop style sheets.
 */
export function invoiceTableHtml(customer: CustomerAccount, today: string = todayISO()): string {
  const rows = invoiceTableRows(customer, today).map(
    ([ref, date, due, days, gross, pending]) =>
      `<tr>${[cell(escapeHtml(ref)), cell(date, 'right'), cell(due), cell(days), cell(gross, 'right'), cell(pending, 'right')].join('')}</tr>`
  )
  const bold = 'font-weight:bold;'
  return [
    '<table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #000;background:#fff;">',
    `<tr>${cell(escapeHtml(invoiceTableTitle(customer.name)), 'center', 'font-size:14px;', 6)}</tr>`,
    `<tr>${['Ref No.', 'Date', 'Due on', 'Overdue<br>by days', 'Gross Amount', 'Pending Amount'].map((h) => cell(h, 'left', 'vertical-align:top;')).join('')}</tr>`,
    ...rows,
    `<tr>${cell('Total', 'left', bold, 4)}${cell(money(customer.totalAmount), 'right', bold)}${cell(money(customer.outstanding), 'right', bold)}</tr>`,
    ...(customer.overdue > 0 ? [`<tr>${cell('Total Overdue', 'left', bold, 5)}${cell(money(customer.overdue), 'right', bold)}</tr>`] : []),
    '</table>',
  ].join('')
}

/** The message on either side of the table: at its slot, else above the sign-off. */
export function splitAtTable(body: string): { before: string; after: string } {
  const [before, ...rest] = withInvoiceTable(body, INVOICE_TABLE_SLOT).split(INVOICE_TABLE_SLOT)
  return { before: before.trim(), after: rest.join('').trim() }
}

const paragraphHtml = (text: string) => escapeHtml(text).replace(/\n/g, '<br>')

/** The whole email as formatted text, for pasting into the mail program. */
export function emailHtml(body: string, tableHtml: string): string {
  const { before, after } = splitAtTable(body)
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#000;">${paragraphHtml(before)}<br><br>${tableHtml}<br>${paragraphHtml(after)}</div>`
}

/** The same email as plain text, for anywhere that cannot take a formatted one. */
export function emailText(body: string, tableText: string): string {
  const { before, after } = splitAtTable(body)
  return [before, tableText, after].filter(Boolean).join('\n\n')
}

/** The message for the email link, with an empty line where the table will be pasted. */
export function emailWithTableGap(body: string): string {
  const { before, after } = splitAtTable(body)
  return after ? `${before}\n\n\n${after}` : `${before}\n\n`
}

/** Where to click before pressing Ctrl+V, in words. */
export function tablePasteHint(body: string): string {
  const next = splitAtTable(body).after.split('\n')[0]?.trim()
  return next ? `click the empty line above "${next}"` : 'click below the message'
}

/** The customer's open invoices by BP code, or null when none is being chased. */
export function statementForCode(
  code: string | null | undefined,
  all: readonly Company[],
  today: string = todayISO()
): CustomerAccount | null {
  const key = normalizeBpCode(code)
  if (!key) return null
  const open = all.filter((c) => normalizeBpCode(c.sap_bp_code) === key && isWorkingInvoice(c))
  return open.length ? groupCustomers(open, today)[0] : null
}

/** By the exact customer name, for a draft that names no code. */
export function statementForName(name: string, all: readonly Company[], today: string = todayISO()): CustomerAccount | null {
  const tidy = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const wanted = tidy(name)
  if (!wanted) return null
  const open = all.filter((c) => tidy(c.name) === wanted && isWorkingInvoice(c))
  const customers = groupCustomers(open, today)
  return customers.length === 1 ? customers[0] : null
}

const SIGN_OFF = /^\s*(warm regards|kind regards|best regards|regards|thanks and regards|thanks & regards|thank you|thanks|sincerely|yours sincerely|yours faithfully)\s*[,.!]?\s*$/i

/** Puts the table above the sign-off, or at the end when there is none. */
export function withInvoiceTable(body: string, table: string): string {
  if (!table || body.includes(table)) return body
  const lines = body.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SIGN_OFF.test(lines[i])) {
      const before = lines.slice(0, i).join('\n').trimEnd()
      return `${before}\n\n${table}\n\n${lines.slice(i).join('\n')}`
    }
  }
  return `${body.trimEnd()}\n\n${table}`
}

/** The body without the table, for a link that cannot carry it. */
export const withoutInvoiceTable = (body: string, table: string) =>
  table ? body.replace(table, '').replace(/\n{3,}/g, '\n\n').trim() : body

/** How long a link each mail program is trusted with. */
const LINK_LIMIT: Record<EmailProvider, number> = { gmail: 6000, outlook: 6000, default: 1900 }
export const emailLinkFits = (provider: EmailProvider, url: string) => url.length <= LINK_LIMIT[provider]

/**
 * Copies inside a click. The CRM runs on plain http on the office network,
 * where the browser's clipboard API does not exist, so this uses the older
 * route that works there.
 */
export function copyText(text: string): boolean {
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.style.position = 'fixed'
  box.style.opacity = '0'
  // Inside the top dialog: an open dialog keeps focus to itself, and without focus nothing is copied.
  const dialogs = document.querySelectorAll('[role="dialog"]')
  const holder = dialogs[dialogs.length - 1] ?? document.body
  const previous = document.activeElement as HTMLElement | null
  holder.appendChild(box)
  box.focus()
  box.select()
  box.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.activeElement === box && document.execCommand('copy')
  } catch {
    ok = false
  }
  box.remove()
  previous?.focus?.()
  return ok
}

/** Copies formatted text, with plain text for programs that cannot take it. */
export function copyRich(html: string, text: string): boolean {
  const write = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/html', html)
    event.clipboardData?.setData('text/plain', text)
    event.preventDefault()
  }
  document.addEventListener('copy', write, true)
  try {
    return copyText(text)
  } finally {
    document.removeEventListener('copy', write, true)
  }
}
