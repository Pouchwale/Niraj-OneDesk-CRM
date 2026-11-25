import { describe, expect, it } from 'vitest'

import { figuresOf } from './do-not-send'
import { blankFlexoLine, type FlexoRateLine, type FlexoRateSheet } from './flexo-rate-sheet'
import { SALES_QUOTATION_TEXT, SQ_PAGE, paginate, quotationDateText, salesQuotation, salesRowCells, salesUnitPrice, twoDecimalText } from './sales-quotation'

// Same lines as the Do not Send tests; expected values from the separate Python calculation.
const rates = { 'Gloss UV': 10, 'PP White': 30, Gujarat: 2, 'Cast and Cure': 25, None: 0 }
const line = (o: Partial<FlexoRateLine>): FlexoRateLine => ({ ...blankFlexoLine('l1'), ...o })
const labelA = line({
  jobName: 'Mango', teeth: 96, cutLength: 50, width: 60, acrossUps: 4, aroundUps: 6, acrossGap: 3, moq: 10000, jobLevel: 'Level 1', itemType: 'Label',
  valueAddition: 'None', valueAddCoverageArea: 0, coatingType: 'Gloss UV', material: 'PP White', deliveryZone: 'Gujarat', inkCoverageArea: 50, profitOverhead: 25, set: 'No',
})
const sleeveB = line({
  jobName: 'Shampoo', teeth: 90, cutLength: 280, width: 100, acrossUps: 2, aroundUps: 1, acrossGap: 4, moq: 5000, jobLevel: 'Level 2', itemType: 'Sleeve',
  valueAddition: 'Cast and Cure', valueAddCoverageArea: 40, coatingType: 'Gloss UV', material: 'PP White', deliveryZone: 'Gujarat', inkCoverageArea: 60, profitOverhead: 15, set: 'Yes',
})

describe('Sales Quotation Unit Price', () => {
  it('is Calculated Rate, twice it for a set', () => {
    expect(salesUnitPrice(labelA, rates)).toBeCloseTo(0.9766013122083333, 12)
    expect(salesUnitPrice(sleeveB, rates)).toBeCloseTo(7.9905892852000004, 9)
  })

  it('has none of Do not Send’s zero checks', () => {
    const narrow = { ...labelA, width: 10, acrossUps: 1 } // paper width under 0.090: Do not Send gives 0
    expect(figuresOf(narrow, rates).finalRate).toBe(0)
    expect(salesUnitPrice(narrow, rates)).toBeGreaterThan(0)
    const rotary = { ...labelA, valueAddition: 'Cast and Cure', valueAddCoverageArea: 10, jobLevel: 'Level 1' }
    expect(figuresOf(rotary, rates).finalRate).toBe(0)
    expect(salesUnitPrice(rotary, rates)).toBeGreaterThan(0)
  })

  it('is blank (not 0) when a rate or a needed value is empty, as with NULL handling off', () => {
    const noNone = { 'Gloss UV': 10, 'PP White': 30, Gujarat: 2 }
    expect(salesUnitPrice(labelA, noNone)).toBeNull() // "None" has no row in the rate table
    expect(salesUnitPrice({ ...labelA, deliveryZone: 'Export' }, rates)).toBeNull()
    expect(salesUnitPrice({ ...labelA, inkCoverageArea: null }, rates)).toBeNull()
    expect(salesUnitPrice({ ...labelA, set: '' }, rates)).toBeNull()
    // Length is not used here, so an empty one does not matter.
    expect(salesUnitPrice({ ...labelA, cutLength: null }, rates)).toBeCloseTo(0.9766013122083333, 12)
  })

  it('stops a line where the report would stop', () => {
    expect(() => salesUnitPrice({ ...labelA, moq: 0 }, rates)).toThrow(/Division by zero/)
    const doc = salesQuotation({ docEntry: 7, date: '2026-11-24', customer: 'Acme', lines: [{ ...labelA, moq: 0 }, sleeveB] } as unknown as FlexoRateSheet, rates)
    expect(doc.rows[0].error).toMatch(/MOQ is 0/)
    expect(doc.rows[1].unitPrice).toBeCloseTo(7.9905892852000004, 9)
  })
})

describe('the Sales Quotation document', () => {
  const sheet = {
    docEntry: 125, date: '2026-11-24', customer: 'Rehearsal Foods', freight: 'Inclu RoadT', paymentTerms: '30 Days', plateCharge: 'Extra@600',
    dieCharge: 'None', proofingCharge: 'None', gst: 'Extra @ 12%', lines: [labelA, { ...sleeveB, valueAddition: '' }],
  } as unknown as FlexoRateSheet
  const doc = salesQuotation(sheet, rates)

  it('writes the number, title and footer as the report does', () => {
    expect(doc.quotationNo).toBe('125 - 2026')
    expect(doc.title).toBe('Sales Quotation - Label For Rehearsal Foods')
    expect(doc.footer).toEqual({ freight: 'Included in Rate (Road Transport)', paymentTerms: ' 30 Days', plateCharge: 'Extra @600 per colour', dieCharge: 'None', proofingCharge: '', gst: 'Extra @ 12%' })
    expect(doc.rows.map((r) => [r.srNo, r.effects])).toEqual([[1, 'None'], [2, '']])
  })

  it('keeps the fixed texts byte for byte', () => {
    expect(SALES_QUOTATION_TEXT.computerGenerated).toBe('This is a Computer Generated Document  It Does Not Require a Signature.')
    expect(SALES_QUOTATION_TEXT.letterhead[3]).toBe('GSTIN : 24AAACG7781P1Z1, IEC CODE : 0894007882 , PAN : AAACG7781P ,')
    expect([SALES_QUOTATION_TEXT.validity, SALES_QUOTATION_TEXT.leadTime, SALES_QUOTATION_TEXT.currency]).toEqual(['30 Days', '12 Days', 'INR'])
  })

  it('leaves the year off an undated sheet', () => {
    expect(salesQuotation({ ...sheet, date: null }, rates).quotationNo).toBe('125 - ')
  })
})

describe('the printed quotation, as the sample', () => {
  it('writes numbers and dates as the sample does', () => {
    expect(twoDecimalText(4.1666)).toBe('4.17')
    expect(twoDecimalText(3.615)).toBe('3.62')
    expect(twoDecimalText(0.9766013122083333)).toBe('0.98')
    expect(quotationDateText('2026-11-24')).toBe('24/11/2026')
  })

  it('puts each value under its heading, Material before No. of Colors and Lay Flat Width empty', () => {
    const doc = salesQuotation({ docEntry: 5381, date: '2026-11-24', customer: 'Elite chemical', lines: [{ ...sleeveB, jobName: 'Shrink Sleeves', netContent: '-', set: 'No' }] } as unknown as FlexoRateSheet, rates)
    const cells = salesRowCells(doc.rows[0])
    expect(cells.slice(0, 12)).toEqual(['1', 'Shrink Sleeves', 'No', '-', '280', '100', '', 'PP White', '', 'Gloss UV', 'Cast and Cure', '5000'])
    expect(cells[12]).toMatch(/^\d+\.\d{2}$/)
  })

  it('fits up to 6 lines on one page and spreads more the way the report’s sections fall', () => {
    const rows = (n: number) => salesQuotation({ docEntry: 1, date: null, customer: 'X', lines: Array.from({ length: n }, (_, i) => ({ ...labelA, id: `l${i}` })) } as unknown as FlexoRateSheet, rates).rows
    expect(paginate(rows(6)).map((p) => [p.rows.length, p.details, p.headings, p.closing])).toEqual([[6, true, true, true]])
    const two = paginate(rows(20))
    expect(two.map((p) => p.rows.length)).toEqual([15, 5])
    expect(two.map((p) => [p.details, p.headings, p.closing])).toEqual([[true, true, false], [false, false, true]])
    const three = paginate(rows(40))
    expect(three.reduce((a, p) => a + p.rows.length, 0)).toBe(40)
    expect(three[1].headings && !three[1].details && !three[1].closing).toBe(true)
    for (const p of three) expect(p.rowsTop + p.rows.length * SQ_PAGE.rowHeight + (p.closing ? SQ_PAGE.closingHeight : 0)).toBeLessThanOrEqual(SQ_PAGE.footerTop + 1e-6)
  })
})
