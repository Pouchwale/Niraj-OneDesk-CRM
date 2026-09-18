import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseFile } from './file-parser'
import {
  autoMapCompanyColumns,
  mapCompanyRows,
  parsePaymentTermDays,
  deriveDueDate,
  deriveCompanyStatus,
  validateCompanyRows,
  groupImportRows,
  type MappedCompanyRow,
} from './companies-upload'

/** Wraps a workbook on disk in the File shape parseFile expects. */
function loadWorkbook(name: string): File {
  const buffer = readFileSync(resolve(__dirname, '__fixtures__', name))
  return {
    name,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as unknown as File
}

describe('parsePaymentTermDays', () => {
  it('reads the credit period out of free-text terms', () => {
    expect(parsePaymentTermDays('60 Days')).toBe(60)
    expect(parsePaymentTermDays('Net 30')).toBe(30)
    expect(parsePaymentTermDays('45 days from invoice date')).toBe(45)
    expect(parsePaymentTermDays('90')).toBe(90)
  })

  it('treats immediate-payment terms as zero days', () => {
    expect(parsePaymentTermDays('Immediate')).toBe(0)
    expect(parsePaymentTermDays('Advance')).toBe(0)
    expect(parsePaymentTermDays('COD')).toBe(0)
  })

  it('returns null when there is nothing to read', () => {
    expect(parsePaymentTermDays('')).toBeNull()
    expect(parsePaymentTermDays(null)).toBeNull()
    expect(parsePaymentTermDays('to be agreed')).toBeNull()
  })
})

describe('deriveDueDate', () => {
  it('prefers an explicit due date', () => {
    expect(deriveDueDate('2025-01-01', '2025-03-03', '60 Days')).toBe('2025-03-03')
  })

  it('computes invoice date + credit period when due date is absent', () => {
    expect(deriveDueDate('2025-01-01', null, '60 Days')).toBe('2025-03-02')
    expect(deriveDueDate('2025-01-01', null, 'Net 30')).toBe('2025-01-31')
    expect(deriveDueDate('2025-01-01', null, 'Immediate')).toBe('2025-01-01')
  })

  it('returns null when it cannot compute one', () => {
    expect(deriveDueDate(null, null, '60 Days')).toBeNull()
    expect(deriveDueDate('2025-01-01', null, 'unclear')).toBeNull()
  })
})

describe('deriveCompanyStatus', () => {
  const today = new Date('2025-06-15T00:00:00')

  it('classifies by how far past due the invoice is', () => {
    expect(deriveCompanyStatus('2025-01-01', 1000, today)).toBe('critical') // >60 days late
    expect(deriveCompanyStatus('2025-06-01', 1000, today)).toBe('overdue')
    expect(deriveCompanyStatus('2025-06-18', 1000, today)).toBe('upcoming') // within 7 days
    expect(deriveCompanyStatus('2025-09-01', 1000, today)).toBe('current')
  })

  it('marks a settled balance as paid', () => {
    expect(deriveCompanyStatus('2025-01-01', 0, today)).toBe('paid')
  })
})

describe('company upload extraction (end to end)', () => {
  it('extracts the required fields from a messy real-world workbook', async () => {
    const parsed = await parseFile(loadWorkbook('company_sample.xlsx'))

    // Header row sits below two title rows and a blank row.
    expect(parsed.headers).toContain('Customer Name')
    expect(parsed.headers).toContain('Payment Term Total Amount')
    expect(parsed.rows.length).toBe(6)

    const mapping = autoMapCompanyColumns(parsed.headers)

    // Every field the business asked for must auto-map with no manual help.
    expect(mapping.company_name).toBe('Customer Name')
    expect(mapping.payment_terms).toBe('Payment Terms')
    expect(mapping.invoice_date).toBe('Invoice Date')
    expect(mapping.total_amount).toBe('Payment Term Total Amount')
    expect(mapping.coordinator_name).toBe('Co-ordinator Name')
    expect(mapping.sap_bp_code).toBe('Cust. Code')
    expect(mapping.contact_person).toBe('Contact Person')
    expect(mapping.contact_number).toBe('Mobile No')
    expect(mapping.email).toBe('Email ID')

    const rows = mapCompanyRows(parsed.rows, mapping)

    const balaji = rows[0]
    expect(balaji.company_name).toBe('Balaji Print Pack')
    expect(balaji.payment_terms).toBe('60 Days')
    expect(balaji.invoice_date).toBe('2025-05-10')
    expect(balaji.total_amount).toBe(550000)
    expect(balaji.coordinator_name).toBe('Pragati')
    expect(balaji.due_date).toBe('2025-07-09') // derived: invoice + 60 days

    // Indian-format currency and dd/mm/yyyy dates must survive.
    const vardhman = rows[1]
    expect(vardhman.total_amount).toBe(275000)
    expect(vardhman.invoice_date).toBe('2025-06-15')
    expect(vardhman.due_date).toBe('2025-07-15')

    const anand = rows[2]
    expect(anand.total_amount).toBe(120500) // "₹ 1,20,500"
    expect(anand.due_date).toBe('2025-09-15') // 2025-08-01 + 45

    // "Remark" and "Division" auto-map onto real fields...
    expect(anand.remarks).toBe('Disputed 5k')
    expect(anand.module).toBe('Sleeves')

    // ...while genuinely unrecognised columns are kept rather than dropped.
    expect(anand.extra_fields).toHaveProperty('Internal Ref', 'REF-03')
  })
})

describe('amounts that cannot be read', () => {
  const mapping = {
    company_name: 'Company',
    coordinator_name: 'Coordinator',
    payment_terms: 'Terms',
    total_amount: 'Amount',
    invoice_date: 'Invoice Date',
  }
  const raw = (amount: unknown) => ({
    Company: 'Ganga Foods',
    Coordinator: 'Krupa Patel',
    Terms: '30 days',
    Amount: amount,
    'Invoice Date': '2026-08-14',
  })

  it('refuses a blank amount instead of importing the account as paid', async () => {
    // This once became total_amount 0, status "paid", and sailed through.
    const rows = mapCompanyRows([raw('')], mapping)
    expect(Number.isNaN(rows[0].total_amount)).toBe(true)
    const result = await validateCompanyRows(rows)
    expect(result.valid).toHaveLength(0)
    expect(result.errors[0]).toContain('Total Amount is missing or unreadable')
  })

  it('refuses text where a number should be', async () => {
    const result = await validateCompanyRows(mapCompanyRows([raw('abc')], mapping))
    expect(result.errors[0]).toContain('Total Amount is missing or unreadable')
  })

  it('refuses a zero amount, which is not a receivable', async () => {
    const result = await validateCompanyRows(mapCompanyRows([raw('0')], mapping))
    expect(result.errors[0]).toContain('Total Amount must be greater than zero')
  })

  it('still accepts a real figure in Indian formatting', async () => {
    const result = await validateCompanyRows(mapCompanyRows([raw('₹ 1,20,500')], mapping))
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].total_amount).toBe(120500)
  })
})

describe('a file with one row per invoice', () => {
  const invoiceRow = (
    bp: string,
    amount: number,
    due: string,
    index: number,
    invoiceNo: string | null = null
  ): MappedCompanyRow => ({
    _originalIndex: index,
    _raw: {},
    company_name: `Customer ${bp}`,
    sap_bp_code: bp,
    invoice_no: invoiceNo,
    coordinator_name: 'Pragati',
    coordinator_id: 'coord-1',
    coordinator_input: 'Pragati',
    payment_terms: '30 days',
    total_amount: amount,
    invoice_date: null,
    due_date: due,
    contact_person: null,
    contact_number: null,
    email: null,
    module: null,
    remarks: null,
    status: 'overdue',
    extra_fields: {},
  })

  it('keeps each numbered invoice as its own record', () => {
    /*
     * The whole point. These used to become a single row of ₹86,76,177 with
     * one due date standing in for three, so two of the three invoices had the
     * wrong status and nobody could tell which one was actually late.
     */
    const rows = groupImportRows([
      invoiceRow('C0287', 24918, '2026-08-01', 0, 'INV-1'),
      invoiceRow('C0287', 500000, '2026-05-10', 1, 'INV-2'),
      invoiceRow('C0287', 8151259, '2026-06-15', 2, 'INV-3'),
    ])

    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.invoice_no)).toEqual(['INV-1', 'INV-2', 'INV-3'])
    expect(rows.map((r) => r.due_date)).toEqual(['2026-08-01', '2026-05-10', '2026-06-15'])
    expect(rows.reduce((sum, r) => sum + r.total_amount, 0)).toBe(24918 + 500000 + 8151259)
  })

  it('does not merge two customers who reuse an invoice number', () => {
    // 26 numbers in the live file are reused by different customers: invoice
    // "27" belongs to both C0155 and C0004. Keyed on the number alone these
    // would become one record, and one of the two debts would vanish.
    const rows = groupImportRows([
      invoiceRow('C0155', 100, '2026-05-10', 0, '27'),
      invoiceRow('C0004', 200, '2026-05-10', 1, '27'),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.reduce((sum, r) => sum + r.total_amount, 0)).toBe(300)
  })

  it('still collapses a repeat of the same invoice', () => {
    // The same invoice twice in one file is a duplicate row, not two debts.
    const rows = groupImportRows([
      invoiceRow('C1', 100, '2026-05-10', 0, 'INV-9'),
      invoiceRow('C1', 100, '2026-05-10', 1, 'INV-9'),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].total_amount).toBe(200)
  })

  it("adds a customer's rows up when the file numbers nothing", () => {
    // The fallback, and the failure that made it necessary: without a number
    // to tell the rows apart they overwrite each other, and the account shows
    // whichever invoice happened to be last.
    const merged = groupImportRows([
      invoiceRow('C0287', 24918, '2026-08-01', 0),
      invoiceRow('C0287', 500000, '2026-05-10', 1),
      invoiceRow('C0287', 8151259, '2026-06-15', 2),
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].total_amount).toBe(24918 + 500000 + 8151259)
  })

  it('takes the earliest open due date when it does merge, which is the money waiting longest', () => {
    const merged = groupImportRows([
      invoiceRow('C0287', 100, '2026-08-01', 0),
      invoiceRow('C0287', 100, '2026-05-10', 1),
    ])
    expect(merged[0].due_date).toBe('2026-05-10')
  })

  it('records how many invoices are behind a merged figure', () => {
    const merged = groupImportRows([
      invoiceRow('C1', 100, '2026-05-10', 0),
      invoiceRow('C1', 100, '2026-06-10', 1),
    ])
    expect(merged[0].extra_fields['Open invoices']).toBe(2)
  })

  it('keeps different customers apart', () => {
    const merged = groupImportRows([
      invoiceRow('C1', 100, '2026-05-10', 0),
      invoiceRow('C2', 200, '2026-05-10', 1),
      invoiceRow('C1', 300, '2026-06-10', 2),
    ])
    expect(merged).toHaveLength(2)
    expect(merged.find((r) => r.sap_bp_code === 'C1')?.total_amount).toBe(400)
    expect(merged.find((r) => r.sap_bp_code === 'C2')?.total_amount).toBe(200)
  })

  it('leaves a file that already has one row per customer alone', () => {
    const rows = [invoiceRow('C1', 100, '2026-05-10', 0), invoiceRow('C2', 200, '2026-06-10', 1)]
    const merged = groupImportRows(rows)
    expect(merged).toEqual(rows)
  })


  it('falls back to the name when a row carries no BP code', () => {
    const noCode = { ...invoiceRow('', 100, '2026-05-10', 0), sap_bp_code: null }
    const merged = groupImportRows([noCode, { ...noCode, _originalIndex: 1, total_amount: 250 }])
    expect(merged).toHaveLength(1)
    expect(merged[0].total_amount).toBe(350)
  })
})
