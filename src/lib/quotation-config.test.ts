import { describe, expect, it } from 'vitest'

import { doNotSendReport, figuresOf } from './do-not-send'
import { blankFlexoLine, type FlexoRateLine, type FlexoRateSheet } from './flexo-rate-sheet'
import { DEFAULT_NUMBERS, DEFAULT_QUOTATION_CONFIG, LIST_FIELDS, NUMBER_FIELDS, quotationConfigProblem, resolveQuotationConfig } from './quotation-config'
import { DO_NOT_SEND_FORMULAS, SALES_QUOTATION_FORMULAS, SHEET_FIELDS } from './quotation-formula-index'
import { salesQuotation, salesUnitPrice } from './sales-quotation'

const rates = { 'Gloss UV': 10, 'PP White': 30, Gujarat: 2, None: 0 }
const labelA: FlexoRateLine = {
  ...blankFlexoLine('l1'), teeth: 96, cutLength: 50, width: 60, acrossUps: 4, aroundUps: 6, acrossGap: 3, moq: 10000, jobLevel: 'Level 1', itemType: 'Label',
  valueAddition: 'None', valueAddCoverageArea: 0, coatingType: 'Gloss UV', material: 'PP White', deliveryZone: 'Gujarat', inkCoverageArea: 50, profitOverhead: 25, set: 'No',
}

describe('Quotation Sheet settings', () => {
  it('with nothing saved, are SAP’s values and give SAP’s results', () => {
    const cfg = resolveQuotationConfig(null)
    expect(cfg.numbers).toEqual(DEFAULT_NUMBERS)
    expect(figuresOf(labelA, rates, cfg.numbers).finalRate).toBeCloseTo(0.9766013122083333, 12)
    expect(salesUnitPrice(labelA, rates, cfg.numbers)).toBeCloseTo(0.9766013122083333, 12)
    expect(quotationConfigProblem(cfg)).toBeNull()
  })

  it('a changed number changes both reports', () => {
    const cfg = resolveQuotationConfig({ numbers: { ...DEFAULT_NUMBERS, conversionPerHour: 2500, printSpeedL1: 100 } })
    const dns = figuresOf(labelA, rates, cfg.numbers)
    // Conversion cost from the formula with 2500 an hour and Print Speed 100 (Running Meters 127).
    const conversion = ((1 + 127 / 100 / 60) * 2500) / 10000 + dns.sqmPerLabel * 4
    expect(dns.conversionCost).toBeCloseTo(conversion, 12)
    expect(salesUnitPrice(labelA, rates, cfg.numbers)).toBeCloseTo(dns.calculatedRate, 12)
    expect(dns.finalRate).not.toBeCloseTo(0.9766013122083333, 6)
  })

  it('a changed paper width limit changes the Do not Send zero check and colour', () => {
    const narrow = { ...labelA, width: 10, acrossUps: 1 }
    expect(figuresOf(narrow, rates).finalRate).toBe(0)
    const cfg = resolveQuotationConfig({ numbers: { ...DEFAULT_NUMBERS, minPaperWidth: 0.01 } })
    expect(figuresOf(narrow, rates, cfg.numbers).finalRate).toBeGreaterThan(0)
  })

  it('keeps codes a formula needs and refuses a broken list', () => {
    const cfg = resolveQuotationConfig({ lists: { valueAdditions: [{ code: 'Cast and Cure', description: 'Cast and Cure' }] } })
    expect(cfg.lists.valueAdditions.map((v) => v.code)).toEqual(['Cast and Cure', 'None', 'Rotary Screen', 'Gold Foil', 'Silver Foil'])
    const broken = resolveQuotationConfig(null)
    broken.lists.materials = [...broken.lists.materials, { code: 'PE Clear', description: 'again' }]
    expect(quotationConfigProblem(broken)).toMatch(/twice/)
    const removed = resolveQuotationConfig(null)
    removed.lists.coatingTypes = removed.lists.coatingTypes.filter((c) => c.code !== 'None')
    expect(quotationConfigProblem(removed)).toMatch(/cannot be removed/)
  })

  it('prints the report text from the lists, and the texts from the settings', () => {
    const cfg = resolveQuotationConfig(null)
    cfg.lists.plateCharges = [...cfg.lists.plateCharges, { code: 'Extra@2500', description: 'Extra @2500 per colour', reportText: 'Extra @2500 per colour' }]
    cfg.texts.validity = '45 Days'
    const sheet = { docEntry: 3, date: '2026-11-24', customer: 'X', plateCharge: 'Extra@2500', dieCharge: 'None', proofingCharge: 'None', freight: 'To-PayB', gst: '', paymentTerms: '', lines: [labelA] } as unknown as FlexoRateSheet
    expect(doNotSendReport(sheet, rates, cfg).footer.plateCharge).toBe('Extra @2500 per colour')
    const doc = salesQuotation(sheet, rates, cfg)
    expect(doc.footer.plateCharge).toBe('Extra @2500 per colour')
    expect(doc.texts.validity).toBe('45 Days')
    // SAP's own lists: a plate charge of None prints nothing, as the SQL CASE has no None.
    expect(doNotSendReport({ ...sheet, plateCharge: 'None' }, rates, DEFAULT_QUOTATION_CONFIG).footer.plateCharge).toBe('')
  })

  it('indexes every field and formula, and every changeable number is named in a formula', () => {
    expect(SHEET_FIELDS).toHaveLength(35)
    expect(DO_NOT_SEND_FORMULAS.map((f) => f.no)).toEqual(expect.arrayContaining(['#0', '#26', '#28', '#37', '#41']))
    expect(SALES_QUOTATION_FORMULAS.map((f) => f.no)).toEqual(expect.arrayContaining(['#18', '#26', '#50', '#22']))
    const named = new Set([...DO_NOT_SEND_FORMULAS, ...SALES_QUOTATION_FORMULAS].flatMap((f) => f.numbers))
    for (const n of NUMBER_FIELDS) expect(named.has(n.key), n.key).toBe(true)
    expect(LIST_FIELDS).toHaveLength(11)
  })
})
