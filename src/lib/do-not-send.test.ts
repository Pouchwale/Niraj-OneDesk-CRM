import { describe, expect, it } from 'vitest'

import { dispatchLocation, doNotSendLine, doNotSendReport, figuresOf } from './do-not-send'
import { blankFlexoLine, nextDocEntry, rateTypes, type FlexoRateLine, type FlexoRateSheet } from './flexo-rate-sheet'

/*
 * Expected values come from a separate calculation (Python, written from the
 * report's plain-maths table), not from this code.
 */
const rates = { 'Gloss UV': 10, 'PP White': 30, Gujarat: 2, 'Cast and Cure': 25 }
const line = (o: Partial<FlexoRateLine>): FlexoRateLine => ({ ...blankFlexoLine('l1'), ...o })

const labelA = line({
  teeth: 96, cutLength: 50, width: 60, acrossUps: 4, aroundUps: 6, acrossGap: 3, moq: 10000, jobLevel: 'Level 1', itemType: 'Label',
  valueAddition: 'None', valueAddCoverageArea: 0, coatingType: 'Gloss UV', material: 'PP White', deliveryZone: 'Gujarat',
  inkCoverageArea: 50, profitOverhead: 25, set: 'No',
})
const sleeveB = line({
  teeth: 90, cutLength: 280, width: 100, acrossUps: 2, aroundUps: 1, acrossGap: 4, moq: 5000, jobLevel: 'Level 2', itemType: 'Sleeve',
  valueAddition: 'Cast and Cure', valueAddCoverageArea: 40, coatingType: 'Gloss UV', material: 'PP White', deliveryZone: 'Gujarat',
  inkCoverageArea: 60, profitOverhead: 15, set: 'Yes',
})

describe('Do not Send formulas', () => {
  it('works a label out as the report does', () => {
    const f = figuresOf(labelA, rates)
    expect(f.arGap).toBe(0.8)
    expect(f.width).toBeCloseTo(0.263, 12)
    expect(f.sqmPerLabel).toBeCloseTo(0.0033401, 12)
    expect(f.runningMeters).toBeCloseTo(127, 9)
    expect(f.conversionCost).toBeCloseTo(0.21865206666666664, 12)
    expect(f.sqmConversion).toBeCloseTo(68.32023080448276, 9)
    expect(f.wastageCost).toBeCloseTo(0.41948565750000005, 12)
    expect(f.totalCost).toBeCloseTo(0.7812810497666667, 12)
    expect(f.profitCost).toBeCloseTo(0.19532026244166667, 12)
    expect(f.calculatedRate).toBeCloseTo(0.9766013122083333, 12)
    expect(f.finalRate).toBeCloseTo(0.9766013122083333, 12)
    expect(f.totalValue).toBeCloseTo(9766.013122083334, 8)
    expect(f.factor).toBeCloseTo(0.18863667636150228, 12)
    expect(f.pricePerSqm).toBeCloseTo(292.38684836032854, 9)
    expect(f.consPricePerSqm).toBeCloseTo(262.38684836032854, 9)
    expect(f.paymentPenBen).toBe(0)
  })

  it('works a sleeve set with a value addition out (20 mm margin, +0.025, Final Rate x2, Total Value from Calculated Rate)', () => {
    const f = figuresOf(sleeveB, rates)
    expect(f.arGap).toBe(5.75)
    expect(f.width).toBeCloseTo(0.224, 12)
    expect(f.sqmPerLabel).toBeCloseTo(0.032004, 12)
    expect(f.runningMeters).toBeCloseTo(714.375, 9)
    expect(f.totalCost).toBeCloseTo(3.452430124, 9)
    expect(f.calculatedRate).toBeCloseTo(3.9952946426000002, 9)
    expect(f.finalRate).toBeCloseTo(7.9905892852000004, 9)
    expect(f.totalValue).toBeCloseTo(39952.946426, 6)
    expect(f.factor).toBeCloseTo(0.16108045537049806, 12)
  })

  it('gives a Final Rate of 0 in the report’s cases, in its order', () => {
    expect(figuresOf({ ...labelA, valueAddition: 'Gold Foil', valueAddCoverageArea: 0 }, rates).finalRate).toBe(0)
    expect(figuresOf({ ...labelA, width: 10, acrossUps: 1 }, rates).finalRate).toBe(0) // paper width under 0.090
    expect(figuresOf({ ...labelA, width: 200, acrossUps: 3 }, rates).finalRate).toBe(0) // over 0.440
    expect(figuresOf({ ...labelA, valueAddition: 'Rotary Screen', valueAddCoverageArea: 10, jobLevel: 'Level 2' }, rates).finalRate).toBe(0)
    expect(figuresOf({ ...labelA, valueAddition: 'Rotary Screen', valueAddCoverageArea: 10, jobLevel: 'Level 3' }, rates).finalRate).toBeGreaterThan(0)
    expect(figuresOf({ ...labelA, valueAddition: 'Cast and Cure', valueAddCoverageArea: 10, jobLevel: 'Level 1' }, rates).finalRate).toBe(0)
    expect(figuresOf({ ...labelA, valueAddition: 'Gold Foil', valueAddCoverageArea: 10, jobLevel: 'Level 1' }, rates).finalRate).toBe(0)
    expect(figuresOf({ ...labelA, valueAddition: 'Silver Foil', valueAddCoverageArea: 10, jobLevel: 'Level 3' }, rates).finalRate).toBeGreaterThan(0)
    // An empty Value Addition is not "None": with no coverage it gives 0, as in SAP.
    expect(figuresOf({ ...labelA, valueAddition: '' }, rates).finalRate).toBe(0)
  })

  it('counts a missing rate as 0 and keeps one rate per Type', () => {
    const none = figuresOf({ ...labelA, coatingType: 'None', deliveryZone: 'Export' }, rates)
    expect(none.coatingRate).toBe(0)
    expect(none.diapcthRate).toBe(0)
    expect(rateTypes().find((t) => t.type === 'Texture (Drip Off)')?.usedFor).toEqual(['Coating Type', 'Value Addition'])
    expect(rateTypes().find((t) => t.type === 'None')?.usedFor).toEqual(['Coating Type', 'Value Addition'])
  })

  it('stops a line where the report would stop, saying why', () => {
    expect(doNotSendLine({ ...labelA, jobLevel: '' }, rates).error).toMatch(/Job Level/)
    expect(doNotSendLine({ ...labelA, cutLength: null }, rates).error).toMatch(/Length\/Cut Length is empty/)
    expect(doNotSendLine({ ...labelA, moq: 0 }, rates).error).toMatch(/Division by zero/)
    expect(doNotSendLine({ ...labelA, aroundUps: 0 }, rates).error).toMatch(/Around Ups/)
    expect(doNotSendLine(labelA, rates).error).toBeNull()
  })

  it('colours the cells as the report does', () => {
    const a = doNotSendLine(labelA, rates).colors
    expect(a).toEqual({ set: null, arGap: 'red', width: 'yellow', jobLevel: null, valueAddArea: null, profitOverhead: null, totalValue: null })
    const b = doNotSendLine(sleeveB, rates).colors
    // Sleeve: Ar Gap above 1 is red; Cast and Cure with Level 2 is fine; Total Value 39,952 is over 15,000.
    expect(b).toEqual({ set: 'red', arGap: 'red', width: 'yellow', jobLevel: null, valueAddArea: null, profitOverhead: 'yellow', totalValue: null })
    expect(doNotSendLine({ ...labelA, moq: 1000, material: 'PE Clear' }, rates).colors.totalValue).toBe('yellow')
    expect(doNotSendLine({ ...labelA, valueAddition: 'Gold Foil', valueAddCoverageArea: 10, jobLevel: 'Level 3' }, rates).colors.jobLevel).toBe('red')
  })

  it('writes the footer and the dispatch location as the report’s SQL does', () => {
    const sheet = {
      plateCharge: 'Included', dieCharge: 'Included', proofingCharge: 'Extra@8000', freight: 'To-PayB', gst: 'Extra @ 18%', lines: [labelA],
    } as unknown as FlexoRateSheet
    expect(doNotSendReport(sheet, rates).footer).toEqual({
      freight: 'To-Pay Basis', plateCharge: 'Included in Rate', plateChargeColor: 'red', dieCharge: 'Included in rate', dieChargeColor: 'red',
      proofingCharge: 'Extra @8000 per artwork', gst: 'Extra @ 18%',
    })
    const blanks = doNotSendReport({ ...sheet, plateCharge: 'None', proofingCharge: 'None', dieCharge: 'None' }, rates).footer
    expect([blanks.plateCharge, blanks.proofingCharge, blanks.dieCharge, blanks.dieChargeColor]).toEqual(['', '', 'None', null])
    expect(dispatchLocation('East India')).toBe('East India (Guwahati, Assam)')
    expect(dispatchLocation('Gujarat')).toBe('Gujarat')
  })

  it('numbers sheets one after the highest', () => {
    expect(nextDocEntry([])).toBe(1)
    expect(nextDocEntry([{ docEntry: 4 }, { docEntry: 9 }])).toBe(10)
  })
})
