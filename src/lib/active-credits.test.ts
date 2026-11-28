import { describe, expect, it } from 'vitest'
import { billLines, billTotals, creditRowsOf, creditsFor } from './active-credits'
import { autoMapCompanyColumns, mapCompanyRows } from './companies-upload'
import { demoCompanyStore } from './demo-companies'
import { invoiceValue } from './customer-accounts'
import type { Company } from './types'

// Sapiens Labs in the Active Payment query, 28 Nov 2026 (SAP Bill Wise Details: Gross 11,50,498, Pending 5,16,016).
const HEADERS = ['BP Code', 'Company Name', 'Coordinator', 'Contact Person', 'Contact Phone', 'Contact Email', 'Payment Terms', 'Transaction Type', 'Ref No', 'Date', 'Due On', 'Overdue By Days', 'Basic Amount', 'TDS Amount', 'Gross Amount', 'Pending Amount', 'Payment Status', 'Customer Total Pending', 'Customer Overdue Bills', 'Customer Unadjusted Credits']
const line = (type: string, ref: string, date: number, due: number | null, basic: number, tds: number, gross: number, pending: number) =>
  Object.fromEntries(HEADERS.map((h, i) => [h, ['C1801', 'Sapiens Labs', 'Disha Acharya', 'Sapiens Labs', '9888020755', 'karan@sapienslabs.in', 'Net-30', type, ref, date, due, null, basic, tds, gross, pending, '', 516016, 588820, -72804][i]]))
const FILE = [
  line('AR Invoice', '683', 45784, 45784, 62381.31, 62.38, 73610, 191),
  line('AR Invoice', '23', 46101, 46101, 61698.36, 61.7, 72804, 72804),
  line('AR Invoice', '1511', 46210, 46240, 819717.83, 819.72, 967267, 406204),
  line('AR Invoice', '1512', 46210, 46240, 85555.1, 85.56, 100955, 100955),
  line('Incoming Payment', '1590', 46228, null, -71570, 0, -71570, -71570),
  line('Journal Entry', '31523', 46228, null, -1234, 0, -1234, -1234),
  line('AR Invoice', '2047', 46243, 46273, 7344.08, 7.34, 8666, 8666),
]

describe('a customer’s bills the way SAP adds them up (28 Nov 2026)', () => {
  const rows = mapCompanyRows(FILE, autoMapCompanyColumns(HEADERS))
  const credits = creditRowsOf(rows)
  const invoices = rows
    .filter((r) => r.total_amount > 0)
    .map((r, i) => ({ id: `c${i}`, sap_bp_code: r.sap_bp_code, name: r.company_name, invoice_no: r.invoice_no, invoice_date: r.invoice_date, due_date: r.due_date, total_amount: r.total_amount, extra_fields: r.extra_fields, status: 'critical' }) as unknown as Company)

  it('keeps the payment and the journal entry as credit lines', () => {
    expect(credits.map((c) => [c.type, c.ref_no, c.pending])).toEqual([
      ['Incoming Payment', '1590', -71570],
      ['Journal Entry', '31523', -1234],
    ])
  })
  it('totals like SAP: Gross 11,50,498, Pending 5,16,016, credits -72,804', () => {
    const lines = billLines(invoices, creditsFor({ code: 'C1801', name: 'Sapiens Labs' }, credits))
    expect(lines.map((l) => l.refNo)).toEqual(['683', '23', '1511', '1512', '1590', '31523', '2047'])
    expect(billTotals(lines)).toEqual({ gross: 1150498, pending: 516016, credits: -72804 })
  })
  it('an invoice’s full value is its Gross Amount, so Total Amount differs from Outstanding (Sapiens 12,23,302 vs 5,88,820)', () => {
    expect(invoices.map(invoiceValue)).toEqual([73610, 72804, 967267, 100955, 8666])
    expect(invoices.reduce((a, i) => a + invoiceValue(i), 0)).toBe(1223302)
    expect(invoiceValue({ total_amount: 500, extra_fields: { 'Invoice Total': '800' } } as unknown as Company)).toBe(800)
    expect(invoiceValue({ total_amount: 500, extra_fields: {} } as unknown as Company)).toBe(500)
  })
  it('another customer’s credits are not counted', () => {
    expect(creditsFor({ code: 'C0001', name: 'Other' }, credits)).toEqual([])
  })
  it('the store keeps only minus lines, replaced whole on each sync', () => {
    demoCompanyStore.replaceActiveCredits([...credits, { ...credits[0], pending: 5 }])
    expect(demoCompanyStore.getActiveCredits()).toHaveLength(2)
    demoCompanyStore.replaceActiveCredits([])
    expect(demoCompanyStore.getActiveCredits()).toHaveLength(0)
  })
})
