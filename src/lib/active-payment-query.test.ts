import { describe, expect, it } from 'vitest'
import { autoMapCompanyColumns, mapCompanyRows } from './companies-upload'
import { staleImportRefusal } from '../../server/modules/data/operations'

// The Active Payment query's columns since 28 Nov 2026 (CRM ACTIVE PAYMENT sheet).
const HEADERS = ['BP Code', 'Company Name', 'Coordinator', 'Contact Person', 'Contact Phone', 'Contact Email', 'Payment Terms', 'Transaction Type', 'Ref No', 'Date', 'Due On', 'Overdue By Days', 'Basic Amount', 'TDS Amount', 'Gross Amount', 'Pending Amount', 'Payment Status', 'Customer Total Pending', 'Customer Overdue Bills', 'Customer Unadjusted Credits']

describe('the Active Payment query of 28 Nov 2026', () => {
  it('reads the invoice number from Ref No and the amount from Pending Amount', () => {
    const m = autoMapCompanyColumns(HEADERS)
    expect(m.invoice_no).toBe('Ref No')
    expect(m.total_amount).toBe('Pending Amount')
    expect(m.invoice_date).toBe('Date')
    expect(m.due_date).toBe('Due On')
    expect(m.sap_bp_code).toBe('BP Code')
  })
  it('turns Sapiens Labs invoice 1511 into the right row', () => {
    const raw = Object.fromEntries(HEADERS.map((h, i) => [h, ['C1801', 'Sapiens Labs', 'Disha Acharya', 'Sapiens Labs', '9888020755', 'karan@sapienslabs.in', 'Net-30', 'AR Invoice', '1511', 46210, 46240, 114, 819717.6, 0, 967267, 406204, 'Partially Paid', 516016, 588820, -72804][i]]))
    const [row] = mapCompanyRows([raw], autoMapCompanyColumns(HEADERS))
    expect([row.invoice_no, row.total_amount, row.invoice_date, row.due_date]).toEqual(['1511', 406204, '2026-07-07', '2026-08-06'])
    expect(row.extra_fields['Ref No']).toBeUndefined()
  })
  it('the server refuses a row a screen on older code read (Ref No left unused)', () => {
    expect(staleImportRefusal('upsertCompany', [{ invoice_no: '588820', extra_fields: { 'Ref No': '1511' } }])).toMatch(/older version/)
    expect(staleImportRefusal('upsertCompany', [{ invoice_no: '1511', extra_fields: { 'Gross Amount': '967267' } }])).toBeNull()
    expect(staleImportRefusal('addFollowup', [{}])).toBeNull()
  })
})
