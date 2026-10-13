import { describe, expect, it } from 'vitest'

import { followupCount, nextQuotationNo, quotationsFromSheet, sheetDate } from './quotations'

describe('the old Quotation List', () => {
  it('reads text dates as MM-DD-YYYY and swaps the dates Excel misread', () => {
    expect(sheetDate('12-30-2025')).toBe('2025-12-30')
    expect(sheetDate('3/16/2026')).toBe('2026-03-16')
    // Shown by Excel as 12 Jan 2025; the sheet meant 1 Dec 2025.
    expect(sheetDate(new Date(2025, 0, 12))).toBe('2025-12-01')
    // Day above 12 cannot be a month: kept.
    expect(sheetDate(new Date(2026, 5, 23))).toBe('2026-06-23')
    expect(sheetDate('')).toBeNull()
  })

  it('turns rows into quotations for the right coordinator, skipping junk', () => {
    const owners: Record<string, string> = { pragati: 'coord-1', devyani: 'coord-3' }
    const { quotations, skipped } = quotationsFromSheet(
      [
        {
          'MM/DD/YYYY': '12/30/2025', 'Coordinator Name': 'Pragati', 'Customer Name': 'Midas', 'Concern person': 'Shail sir',
          'Source of inquiry': 'sleeve', 'Quotation Dt.': '12-30-2025', 'Sales Employee': 'Shail Sir', 'Quotation No.': 4485,
          'No of Followup': 1, 'Closing Dt.': null, Status: 'Closed', 'Customer Type': 'Existing', AMOUNT: '18000',
        },
        { 'Coordinator Name': 'Pragati / Devyani', 'Customer Name': 'UPL', Status: 'Lost', 'Lost Remarks': 'rate high', 'Concern person': '-' },
        { 'Coordinator Name': '4/29/2026', 'Customer Name': '4/29/2026', Status: '4/29/2026' },
      ],
      (name) => owners[name.toLowerCase()] ?? null,
      '2026-10-13T00:00:00Z',
      'system'
    )
    expect(skipped).toBe(1)
    expect(quotations[0]).toMatchObject({
      coordinator_id: 'coord-1', customer_name: 'Midas', source: 'Sleeve', quotation_date: '2025-12-30', status: 'closed',
      customer_type: 'existing', amount: 18000, earlier_followups: 1,
    })
    expect(quotations[1]).toMatchObject({ coordinator_id: 'coord-3', status: 'lost', lost_remark: 'rate high', concern_person: null })
    expect(followupCount({ earlier_followups: 2, followups: [{ at: 'x', by: 'y', note: 'z' }] })).toBe(3)
  })

  it('suggests the next quotation number', () => {
    expect(nextQuotationNo([{ quotation_no: 'F-4510' }, { quotation_no: '4485' }, { quotation_no: 'F - 5292' }])).toBe('F-5293')
  })
})
