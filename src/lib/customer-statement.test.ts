import { describe, expect, it } from 'vitest'

import { draftWithTable, parseDraft } from '@/features/assistant/email-draft'
import { groupImportRows, separateReusedInvoiceNumbers, type MappedCompanyRow } from './companies-upload'
import { groupCustomers } from './customer-accounts'
import {
  INVOICE_TABLE_SLOT,
  emailHtml,
  emailLinkFits,
  emailText,
  invoiceTableHtml,
  invoiceTableText,
  plainInvoiceNo,
  splitAtTable,
  statementDate,
  statementForCode,
  statementForName,
  withInvoiceTable,
  withoutInvoiceTable,
} from './customer-statement'
import { buildInvoiceTablePdf, invoicePdfFileName, loadPdfTools } from './customer-statement-pdf'
import { WHATSAPP_PDF_NOTE, renderMessage } from './message-templates'
import type { Company } from './types'

const TODAY = '2026-11-21'
const invoice = (no: string, gross: number, pending: number, date: string, due: string, o: Partial<Company> = {}): Company =>
  ({
    id: `id-${no}`,
    sap_bp_code: 'C0001',
    name: 'Isha Agro Developer Pvt.Ltd',
    invoice_no: no,
    total_amount: pending,
    invoice_date: date,
    due_date: due,
    status: 'overdue',
    assigned_coordinator_id: 'coord-1',
    extra_fields: { 'Invoice Total': String(gross) },
    no_followup_at: null,
    bankrupt_declared_at: null,
    ...o,
  }) as Company

describe('the invoice table', () => {
  const [customer] = groupCustomers(
    [
      invoice('3758', 52919, 5645, '2026-10-17', '2026-10-17'),
      invoice('3818', 72299.5, 72299.5, '2026-10-27', '2026-12-27', { status: 'current' }),
    ],
    TODAY
  )

  it('is the user’s columns, every invoice, and the totals', () => {
    expect(invoiceTableText(customer, TODAY).split('\n')).toEqual([
      'Isha Agro Developer Pvt.Ltd (Label & Pouch)',
      'Ref No. | Date | Due on | Overdue by days | Gross Amount | Pending Amount',
      '3758 | 17-Oct-2026 | 17-Oct-2026 | 35 | 52919.00 | 5645.00',
      '3818 | 27-Oct-2026 | 27-Dec-2026 | - | 72299.50 | 72299.50',
      'Total | - | - | - | 125218.50 | 77944.50',
      'Total Overdue: 5645.00',
    ])
  })

  it('leaves out the overdue line when nothing is overdue', () => {
    const [early] = groupCustomers([invoice('9', 100, 100, '2026-11-01', '2026-12-30', { status: 'current' })], TODAY)
    expect(invoiceTableText(early, TODAY)).not.toContain('Total Overdue')
  })

  it('writes dates like the user’s table and shows a reused number as the customer knows it', () => {
    expect(statementDate('2025-10-17')).toBe('17-Oct-2025')
    expect(statementDate(null)).toBe('-')
    expect(plainInvoiceNo('22 (16-Sep-2026)')).toBe('22')
    expect(plainInvoiceNo('INV (A)')).toBe('INV (A)')
  })

  it('finds only the customer’s open invoices', () => {
    const all = [
      invoice('1', 10, 10, '2026-10-01', '2026-10-01'),
      invoice('2', 10, 0, '2026-10-01', '2026-10-01', { status: 'paid' }),
      invoice('3', 10, 10, '2026-10-01', '2026-10-01', { no_followup_at: '2026-11-01T00:00:00Z' } as Partial<Company>),
      invoice('4', 10, 10, '2026-10-01', '2026-10-01', { sap_bp_code: 'C0002', name: 'Other' }),
    ]
    expect(statementForCode('c0001', all, TODAY)?.invoices.map((i) => i.invoice_no)).toEqual(['1'])
    expect(statementForName(' isha agro  developer pvt.ltd ', all, TODAY)?.invoices.map((i) => i.invoice_no)).toEqual(['1'])
    expect(statementForCode('C9999', all, TODAY)).toBeNull()
  })
})

describe('the lined table', () => {
  const [customer] = groupCustomers(
    [
      invoice('3758', 52919, 5645, '2026-10-17', '2026-10-17', { name: 'Isha <Agro> & Co' }),
      invoice('3818', 72299.5, 72299.5, '2026-10-27', '2026-12-27', { status: 'current', name: 'Isha <Agro> & Co' }),
    ],
    TODAY
  )
  const html = invoiceTableHtml(customer, TODAY)

  it('has a line round every cell, written on the cell so mail programs keep it', () => {
    expect(html).toContain('border-collapse:collapse')
    expect(html.match(/<td/g)).toHaveLength(1 + 6 + 12 + 3 + 2)
    expect(html.match(/<td[^>]*border:1px solid #000/g)).toHaveLength(1 + 6 + 12 + 3 + 2)
  })

  it('has the user’s title, columns, alignment and figures', () => {
    expect(html).toContain('colspan="6"')
    expect(html).toContain('Isha &lt;Agro&gt; &amp; Co (Label &amp; Pouch)')
    for (const heading of ['Ref No.', 'Date', 'Due on', 'Overdue<br>by days', 'Gross Amount', 'Pending Amount']) expect(html).toContain(`>${heading}</td>`)
    expect(html).toMatch(/text-align:right;">17-Oct-2026<\/td>/)
    expect(html).toMatch(/text-align:left;">17-Oct-2026<\/td>/)
    expect(html).toMatch(/text-align:right;">52919\.00<\/td>/)
    expect(html).toContain('>Total</td>')
    expect(html).toMatch(/Total Overdue<\/td>.*>5645\.00<\/td>/)
  })

  it('goes where the email says, or above the sign-off', () => {
    const body = `Dear Sir,\n\nPlease pay.\n\n${INVOICE_TABLE_SLOT}\n\nThank you.\n\nWarm regards,\nDiya`
    expect(splitAtTable(body)).toEqual({ before: 'Dear Sir,\n\nPlease pay.', after: 'Thank you.\n\nWarm regards,\nDiya' })
    expect(splitAtTable('Dear Sir,\n\nWarm regards,\nDiya')).toEqual({ before: 'Dear Sir,', after: 'Warm regards,\nDiya' })
    const out = emailHtml(body, '<table></table>')
    expect(out.indexOf('Please pay.')).toBeLessThan(out.indexOf('<table>'))
    expect(out.indexOf('<table>')).toBeLessThan(out.indexOf('Warm regards'))
    expect(out).not.toContain(INVOICE_TABLE_SLOT)
    expect(emailText(body, 'TABLE')).toBe('Dear Sir,\n\nPlease pay.\n\nTABLE\n\nThank you.\n\nWarm regards,\nDiya')
  })

  it('escapes what a person typed in the message', () => {
    expect(emailHtml('Pay <now> & thanks', '<table></table>')).toContain('Pay &lt;now&gt; &amp; thanks')
  })
})

describe('the WhatsApp PDF', () => {
  const rows = Array.from({ length: 120 }, (_, i) => invoice(String(1000 + i), 100 + i, 50 + i, '2026-10-01', i % 2 ? '2026-10-15' : '2026-12-15'))
  const [customer] = groupCustomers(rows, TODAY)

  it('holds the title, every invoice and the totals, across its pages', async () => {
    const doc = buildInvoiceTablePdf(customer, await loadPdfTools(), TODAY)
    const raw = doc.output()
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    expect(raw.match(/Pending Amount/g)?.length).toBe(doc.getNumberOfPages())
    expect(raw).toContain('Isha Agro Developer Pvt.Ltd \\(Label & Pouch\\)')
    for (const r of rows) expect(raw).toContain(`(${r.invoice_no})`)
    expect(raw).toContain('(Total)')
    expect(raw).toContain(`(${customer.outstanding.toFixed(2)})`)
    expect(raw).toContain('(Total Overdue)')
    expect(raw).toContain(`(${customer.overdue.toFixed(2)})`)
  })

  it('is named for the customer, with nothing a file name cannot hold', () => {
    const [odd] = groupCustomers([invoice('1', 10, 10, '2026-10-01', '2026-10-01', { name: 'A/B: C*D' })], TODAY)
    expect(invoicePdfFileName(odd, TODAY)).toBe('Invoices - A B C D - 2026-11-21.pdf')
  })

  it('is mentioned in the WhatsApp message only when it goes with it', () => {
    const context = { customerName: 'Mine', amount: 100, dueDate: '2026-10-01', daysOverdue: 10, coordinatorName: 'Diya' }
    expect(renderMessage('overdue_reminder', { ...context, invoiceTable: '[Invoice table]' }).whatsappBody).toContain(WHATSAPP_PDF_NOTE)
    expect(renderMessage('overdue_reminder', context).whatsappBody).not.toContain(WHATSAPP_PDF_NOTE)
  })
})

describe('placing the table in an email', () => {
  const table = 'Name\nRef No. | Date\n1 | 2'

  it('goes above the sign-off, once', () => {
    const body = 'Dear Sir,\n\nPlease pay.\n\nWarm regards,\nDiya\nAccounts Team'
    const out = withInvoiceTable(body, table)
    expect(out).toBe(`Dear Sir,\n\nPlease pay.\n\n${table}\n\nWarm regards,\nDiya\nAccounts Team`)
    expect(withInvoiceTable(out, table)).toBe(out)
    expect(withoutInvoiceTable(out, table)).toBe(body)
  })

  it('goes at the end when there is no sign-off', () => {
    expect(withInvoiceTable('Dear Sir,', table)).toBe(`Dear Sir,\n\n${table}`)
  })

  it('knows how long a link each mail program can take', () => {
    expect(emailLinkFits('default', 'x'.repeat(1900))).toBe(true)
    expect(emailLinkFits('default', 'x'.repeat(1901))).toBe(false)
    expect(emailLinkFits('gmail', 'x'.repeat(6000))).toBe(true)
    expect(emailLinkFits('outlook', 'x'.repeat(6001))).toBe(false)
  })

  it('is in the reminder emails above the sign-off, not in a thank-you or WhatsApp', () => {
    const context = { customerName: 'Mine', amount: 100, dueDate: '2026-10-01', daysOverdue: 10, coordinatorName: 'Diya', invoiceTable: table }
    for (const key of ['gentle_reminder', 'due_today', 'overdue_reminder', 'final_notice'] as const) {
      const message = renderMessage(key, context)
      expect(message.emailBody).toContain(table)
      expect(message.emailBody.indexOf(table)).toBeLessThan(message.emailBody.search(/(Warm regards|Regards),/))
      expect(message.whatsappBody).not.toContain(table)
    }
    expect(renderMessage('payment_thanks', context).emailBody).not.toContain(table)
    const without = renderMessage('overdue_reminder', { ...context, invoiceTable: null }).emailBody
    expect(without).not.toContain('{{')
    expect(without).not.toMatch(/\n{3,}/)
  })

  it('goes into Robi’s draft by code or by name', () => {
    const all = [invoice('1', 10, 10, '2026-10-01', '2026-10-01')]
    const byCode = parseDraft('Code: C0001\nTo: Some other spelling\nSubject: Hi\n\nDear Sir,\n\nWarm regards,\nDiya')
    expect(byCode.code).toBe('C0001')
    expect(draftWithTable(byCode, all).body).toContain('Ref No. | Date')
    const byName = parseDraft('To: Isha Agro Developer Pvt.Ltd\nSubject: Hi\n\nDear Sir,')
    expect(draftWithTable(byName, all).table).toContain('Total |')
    const nobody = parseDraft('To: Unknown\nSubject: Hi\n\nDear Sir,')
    expect(draftWithTable(nobody, all)).toEqual({ body: 'Dear Sir,', table: '', html: '' })
  })
})

describe('one invoice number used on two dates', () => {
  const row = (no: string | null, date: string | null, due: string, amount: number, code = 'C0945') =>
    ({ _originalIndex: 0, _raw: {}, company_name: 'Mine', sap_bp_code: code, coordinator_name: 'P', coordinator_id: null, coordinator_input: 'P', invoice_no: no, payment_terms: '', total_amount: amount, invoice_date: date, due_date: due, contact_person: null, contact_number: null, email: null, module: null, remarks: null, status: 'current' }) as unknown as MappedCompanyRow

  it('stays two invoices, the oldest keeping the plain number', () => {
    const rows = separateReusedInvoiceNumbers([row('22', '2026-09-16', '2026-12-15', 11139), row('22', '2026-01-13', '2026-04-13', 30444)])
    expect(rows.map((r) => r.invoice_no)).toEqual(['22 (16-Sep-2026)', '22'])
    const grouped = groupImportRows(rows)
    expect(grouped.map((r) => [r.total_amount, r.due_date]).sort()).toEqual([[11139, '2026-12-15'], [30444, '2026-04-13']])
  })

  it('leaves alone lines of one date, other customers, and rows with no number or date', () => {
    const same = [row('5', '2026-01-01', '2026-02-01', 10), row('5', '2026-01-01', '2026-03-01', 20)]
    expect(separateReusedInvoiceNumbers(same).map((r) => r.invoice_no)).toEqual(['5', '5'])
    expect(groupImportRows(separateReusedInvoiceNumbers(same))).toHaveLength(1)
    const others = [row('5', '2026-01-01', '2026-02-01', 10), row('5', '2026-06-01', '2026-07-01', 20, 'C0001')]
    expect(separateReusedInvoiceNumbers(others).map((r) => r.invoice_no)).toEqual(['5', '5'])
    const blanks = [row(null, '2026-01-01', '2026-02-01', 10), row('6', null, '2026-02-01', 10), row('6', '2026-01-01', '2026-02-01', 10)]
    expect(separateReusedInvoiceNumbers(blanks).map((r) => r.invoice_no)).toEqual([null, '6', '6'])
  })
})
