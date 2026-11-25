/**
 * Quotations → Do not Send (24 Nov 2026): SAP's DO_NOT_SEND.rpt costing report
 * for one Flexo Rate Sheet, worked out the way the report works it out. Every
 * formula below is the report's, in its order, with the report's numbers; the
 * report's own names are kept in the comments (spelling mistakes included:
 * "Materail Rate", "Valuadition Rate", "Diapcth Rate").
 *
 * Crystal Reports behaviour kept on purpose (section 7 of the user's notes):
 *   - "Convert Database NULL Values to Default" is on: an empty number is 0,
 *     a rate the LEFT JOIN cannot find is 0, an empty text is "".
 *   - An if-chain with no final else gives 0 (Print Speed, Changeover Time and
 *     Wastage Meters for a Job Level that is not "Level 1/2/3").
 *   - Dividing by zero, or ToNumber on an empty Length or Width, stops the
 *     report. Here it stops only that line, and says which formula failed.
 *   - Text is compared exactly ("Sleeve", "Label", "Level 1", "None", ...).
 *   - Ar Gap is ToNumber(ToText(x, 2)): the only place the report rounds, to
 *     two decimals, half away from zero. Nothing else is rounded.
 *
 * Pure, relative imports only.
 */

import type { FlexoRateLine, FlexoRateSheet } from './flexo-rate-sheet'
import { DEFAULT_NUMBERS, DEFAULT_QUOTATION_CONFIG, reportTextOf, type QuotationConfig, type QuotationNumbers } from './quotation-config'

/** Rates from the rate table (SAP's @RATED), by Type. */
export type RateTable = Readonly<Record<string, number>>

/** A cell's background, as the report's Back_Color formulas give it. */
export type BackColor = 'red' | 'yellow' | null

class CrystalError extends Error {}

const div = (a: number, b: number, formula: string): number => {
  if (b === 0) throw new CrystalError(`Division by zero in ${formula}`)
  return a / b
}

/** Crystal's ToNumber on a text column: an empty one is an error (the report stops). */
const toNumber = (v: number | null | undefined, field: string, formula: string): number => {
  if (v === null || v === undefined || !Number.isFinite(v)) throw new CrystalError(`${field} is empty, so ${formula} cannot be worked out`)
  return v
}

/** A number column with NULL converted to the default. */
const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? 0 : v)

/** ToNumber(ToText(x, 2)): two decimals, half away from zero. */
function twoDecimals(x: number): number {
  const sign = x < 0 ? -1 : 1
  // The small nudge keeps a value like 2.675 (stored as 2.67499999...) rounding as written.
  return (sign * Math.round(Math.abs(x) * 100 + 1e-9)) / 100
}

/** Every figure the report works out for one line. The hidden ones are worked out but not printed. */
export interface DoNotSendFigures {
  circumference: number
  arGap: number
  acGape: number
  width: number
  sqmPerLabel: number
  lWaste: number
  wWaste: number
  runningMeters: number
  printSpeed: number
  changeoverTime: number
  lPlusS: number
  conversionCost: number
  sqmConversion: number
  coatingCost: number
  materialCost: number
  valueAddCost: number
  wastageMeters: number
  inkCost: number
  wastageCost: number
  freightCost: number
  packingCost: number
  totalCost: number
  profitCost: number
  paymentPenBen: number
  calculatedRate: number
  finalRate: number
  totalValue: number
  factor: number
  pricePerSqm: number
  rmPricePerSqm: number
  consPricePerSqm: number
  /** The four rates the SQL joins in. */
  coatingRate: number
  materailRate: number
  valuaditionRate: number
  diapcthRate: number
}

export interface DoNotSendLine {
  line: FlexoRateLine
  /** Null when the line cannot be worked out (the report would stop with this error). */
  figures: DoNotSendFigures | null
  error: string | null
  dispatchLocation: string
  colors: {
    set: BackColor
    arGap: BackColor
    width: BackColor
    jobLevel: BackColor
    valueAddArea: BackColor
    profitOverhead: BackColor
    totalValue: BackColor
  }
}

/** @Dispatch Location (#19). */
export function dispatchLocation(zone: string): string {
  if (zone === 'North India') return 'North India (Delhi, Himachal, Etc.)'
  if (zone === 'Central India') return 'Central India (M.P, etc.)'
  if (zone === 'East India') return 'East India (Guwahati, Assam)'
  return zone
}

const rateOf = (rates: RateTable, type: string) => num(rates[type])

/** The line's figures, formula by formula (#0 to #37). Throws a CrystalError where the report would stop. */
export function figuresOf(line: FlexoRateLine, rates: RateTable, n: QuotationNumbers = DEFAULT_NUMBERS): DoNotSendFigures {
  const itemType = line.itemType ?? ''
  const jobLevel = line.jobLevel ?? ''
  const valueAddition = line.valueAddition ?? ''
  const set = line.set ?? ''
  const teeth = num(line.teeth)
  const acrossUp = num(line.acrossUps)
  const aroundUp = num(line.aroundUps)
  const acrossGap = num(line.acrossGap)
  const moq = num(line.moq)
  const inkCoverage = num(line.inkCoverageArea)
  const valueAddCoverage = num(line.valueAddCoverageArea)
  const profitOverhead = num(line.profitOverhead)

  // The SQL's LEFT JOINs on @RATED by Type.
  const coatingRate = rateOf(rates, line.coatingType ?? '')
  const materailRate = rateOf(rates, line.material ?? '')
  const valuaditionRate = rateOf(rates, valueAddition)
  const diapcthRate = rateOf(rates, line.deliveryZone ?? '')

  // #0 ({Command.U_Teeth}*3.175)/1000
  const circumference = (teeth * n.teethPitch) / 1000
  // #1 Tonumber(ToText((({@Circumference}-((tonumber({Command.U_CutLength})/1000)*{Command.U_AroundUP}))/{Command.U_AroundUP})*1000,2))
  const cut = toNumber(line.cutLength, 'Length/Cut Length', 'Ar Gap')
  const arGap = twoDecimals(div(circumference - (cut / 1000) * aroundUp, aroundUp, 'Ar Gap (Around Ups is 0)') * 1000)
  // #3 ToNumber({Command.U_AcrossGAP})
  const acGape = acrossGap
  // #5 (tonumber({Command.U_CutLength})+{@Ar Gap})/1000
  const lWaste = (cut + arGap) / 1000
  // #6 (tonumber({Command.U_Width})+tonumber({Command.U_AcrossGAP}))/1000
  const w = toNumber(line.width, 'Width/Open Size', 'W + Waste')
  const wWaste = (w + acrossGap) / 1000
  // #7 ((tonumber({Command.U_MOQ})*{@Circumference})/tonumber({Command.U_AroundUP}))/tonumber({Command.U_AcrossUP})
  const runningMeters = div(div(moq * circumference, aroundUp, 'Running Meters (Around Ups is 0)'), acrossUp, 'Running Meters (Across Ups is 0)')
  // #8, #9: no final else, so anything else is 0
  const printSpeed = jobLevel === 'Level 1' ? n.printSpeedL1 : jobLevel === 'Level 2' ? n.printSpeedL2 : jobLevel === 'Level 3' ? n.printSpeedL3 : 0
  const changeoverTime = jobLevel === 'Level 1' ? n.changeoverL1 : jobLevel === 'Level 2' ? n.changeoverL2 : jobLevel === 'Level 3' ? n.changeoverL3 : 0
  // #10
  const lPlusS = itemType === 'Label' ? n.labelLS : n.otherLS
  // #16 (by the changeover time, as the report compares it)
  const wastageMeters =
    jobLevel === '' ? 0 : changeoverTime === n.changeoverL1 ? n.wastageMetersL1 : changeoverTime === n.changeoverL2 ? n.wastageMetersL2 : changeoverTime === n.changeoverL3 ? n.wastageMetersL3 : 0
  // #24 every line but 0.00 is commented out
  const paymentPenBen = 0.0
  // #36
  const rmPricePerSqm = materailRate
  // #2
  const width =
    itemType === 'Sleeve'
      ? (n.sleeveMargin + w * acrossUp + (acrossUp - 1) * acGape) / 1000
      : (n.labelMargin + w * acrossUp + (acrossUp - 1) * acGape) / 1000
  // #4 (({@Width})*({@Circumference}))/(tonumber({Command.U_AcrossUP})*tonumber({Command.U_AroundUP}))
  const sqmPerLabel = div(width * circumference, acrossUp * aroundUp, 'SQM Per Label (Across Ups or Around Ups is 0)')
  // #11 (((({@Changeover Time (Hrs)}+({@Running Meters}/{@Print Speed})/60))*2000)/{Command.U_MOQ})+(({@SQM Per Label})*{@L+S})
  const conversionCost =
    div((changeoverTime + div(runningMeters, printSpeed, 'Conversion Cost (Job Level is not Level 1, 2 or 3)') / 60) * n.conversionPerHour, moq, 'Conversion Cost (MOQ is 0)') +
    sqmPerLabel * lPlusS
  // #12 ({@Conversion Cost})/({@L + Waste}*{@W + Waste})
  const sqmConversion = div(conversionCost, lWaste * wWaste, 'SQM Conversion')
  // #13, #14
  const coatingCost = sqmPerLabel * coatingRate
  const materialCost = sqmPerLabel * materailRate
  // #15 (({@SQM Per Label})*{Command.Valuadition Rate})*({Command.U_ValueAddCoverageArea}/100)
  const valueAddCost = sqmPerLabel * valuaditionRate * (valueAddCoverage / 100)
  // #17 ({@SQM Per Label}*3.5*{Command.U_InkCoverageArea})/100
  const inkCost = (sqmPerLabel * n.inkRate * inkCoverage) / 100
  // #18 ((((({@Wastage Meters}+(({@Running Meters}/2000)*50))*{@Width})*{Command.Materail Rate})*2)/{Command.U_MOQ})*1.05
  const wastageCost = div((wastageMeters + (runningMeters / n.wastageRunPer) * n.wastageRunAdd) * width * materailRate * n.wastageFactor, moq, 'Wastage Cost (MOQ is 0)') * n.wastageUplift
  // #20, #23
  const freightCost = ((sqmPerLabel * n.weightFactor) / 1000) * diapcthRate
  const packingCost = ((sqmPerLabel * n.weightFactor) / 1000) * n.packingRate
  // #21
  const totalCost = conversionCost + coatingCost + materialCost + valueAddCost + wastageCost + inkCost + freightCost + packingCost
  // #22 (({Command.U_ProfitOverhead}/100)*{@Total Cost})
  const profitCost = (profitOverhead / 100) * totalCost
  // #25
  const calculatedRate = itemType === 'Label' ? totalCost + profitCost + 0 : totalCost + profitCost + 0 + n.sleeveAddOn
  // #26 first match wins
  let finalRate: number
  if (valueAddition !== 'None' && valueAddCoverage === 0) finalRate = 0
  else if (width < n.minPaperWidth) finalRate = 0
  else if (width > n.maxPaperWidth) finalRate = 0
  else if (valueAddition === 'Rotary Screen' && jobLevel !== 'Level 3') finalRate = 0
  else if (valueAddition !== 'Rotary Screen' && valueAddition !== 'Gold Foil' && valueAddition !== 'Silver Foil' && valueAddition !== 'None' && jobLevel !== 'Level 2') finalRate = 0
  else if (valueAddition === 'Gold Foil' && jobLevel !== 'Level 3' && jobLevel !== 'Level 2') finalRate = 0
  else if (valueAddition === 'Silver Foil' && jobLevel !== 'Level 3' && jobLevel !== 'Level 2') finalRate = 0
  else if (set === 'Yes') finalRate = calculatedRate * n.setMultiplier
  else finalRate = calculatedRate
  // #27 uses Calculated Rate, not Final Rate
  const totalValue = set === 'Yes' ? calculatedRate * moq * n.setMultiplier : calculatedRate * moq
  // #28 {@Final Rate}/({@SQM Per Label}*1550)
  const factor = div(finalRate, sqmPerLabel * n.factorDivisor, 'Factor')
  // #35 no else: 0 when SQM Per Label is 0
  const pricePerSqm = sqmPerLabel !== 0 ? finalRate / sqmPerLabel : 0
  // #37
  const consPricePerSqm = pricePerSqm - rmPricePerSqm

  return {
    circumference, arGap, acGape, width, sqmPerLabel, lWaste, wWaste, runningMeters, printSpeed, changeoverTime, lPlusS,
    conversionCost, sqmConversion, coatingCost, materialCost, valueAddCost, wastageMeters, inkCost, wastageCost, freightCost,
    packingCost, totalCost, profitCost, paymentPenBen, calculatedRate, finalRate, totalValue, factor, pricePerSqm,
    rmPricePerSqm, consPricePerSqm, coatingRate, materailRate, valuaditionRate, diapcthRate,
  }
}

/** One line of the report, with its cell colours (#31 to #41). */
export function doNotSendLine(line: FlexoRateLine, rates: RateTable, n: QuotationNumbers = DEFAULT_NUMBERS): DoNotSendLine {
  let figures: DoNotSendFigures | null = null
  let error: string | null = null
  try {
    figures = figuresOf(line, rates, n)
  } catch (err) {
    if (!(err instanceof CrystalError)) throw err
    error = err.message
  }
  const itemType = line.itemType ?? ''
  const jobLevel = line.jobLevel ?? ''
  const valueAddition = line.valueAddition ?? ''
  const valueAddCoverage = num(line.valueAddCoverageArea)
  const colors: DoNotSendLine['colors'] = {
    // #33
    set: line.set === 'Yes' ? 'red' : null,
    // #34
    arGap: !figures
      ? null
      : itemType !== 'Sleeve' && (figures.arGap < n.labelArGapMin || figures.arGap > n.labelArGapMax)
        ? 'red'
        : itemType === 'Sleeve' && (figures.arGap > n.sleeveArGapMax || figures.arGap < n.sleeveArGapMin)
          ? 'red'
          : null,
    // #40
    width: !figures
      ? null
      : figures.width < n.minPaperWidth || figures.width > n.maxPaperWidth
        ? 'red'
        : figures.runningMeters > n.runningMetersHigh || figures.runningMeters < n.runningMetersLow
          ? 'yellow'
          : null,
    // #31 (not the same exceptions as Final Rate: the report's own rule)
    jobLevel:
      valueAddition === 'Rotary Screen' && jobLevel !== 'Level 3'
        ? 'red'
        : valueAddition !== 'Rotary Screen' && valueAddition !== 'None' && jobLevel !== 'Level 2'
          ? 'red'
          : null,
    // #38
    valueAddArea: valueAddition !== 'None' && valueAddCoverage === 0 ? 'red' : null,
    // #32
    profitOverhead: num(line.profitOverhead) < n.profitWarning ? 'yellow' : null,
    // #41
    totalValue: !figures ? null : itemType === 'Sleeve' && figures.totalValue < n.sleeveTotalValueRed ? 'red' : figures.totalValue < n.totalValueYellow ? 'yellow' : null,
  }
  return { line, figures, error, dispatchLocation: dispatchLocation(line.deliveryZone ?? ''), colors }
}

/* ── The SQL's CASE columns for the footer (no ELSE: anything else is blank) ── */

export function reportPlateCharge(code: string): string {
  const map: Record<string, string> = {
    'Extra@2000': 'Extra @2000 per colour',
    'Extra@1800': 'Extra @1800 per colour',
    'Extra@1500': 'Extra @1500 per colour',
    'Extra@1200': 'Extra @1200 per colour',
    'Extra@1000': 'Extra @1000 per colour',
    'Extra@800': 'Extra @800 per colour',
    'Extra@600': 'Extra @600 per colour',
    Included: 'Included in Rate',
  }
  return map[code] ?? ''
}

export function reportDieCharge(code: string): string {
  const map: Record<string, string> = {
    'Extra@15000': 'Extra @15000 per size',
    'Extra@10000': 'Extra @10000 per size',
    'Extra@2500': 'Extra @2500 per size',
    'Extra@2000': 'Extra @2000 per size',
    'Extra@1500': 'Extra @1500 per size',
    Included: 'Included in rate',
    None: 'None',
  }
  return map[code] ?? ''
}

export function reportProofingCharge(code: string): string {
  const map: Record<string, string> = {
    'Extra@15000': 'Extra @15,000 per artwork',
    'Extra@12000': 'Extra @12,000 per artwork',
    'Extra@10000': 'Extra @10,000 per artwork',
    'Extra@8000': 'Extra @8000 per artwork',
  }
  return map[code] ?? ''
}

export function reportFreight(code: string): string {
  const map: Record<string, string> = {
    'Inclu RoadT': 'Included in Rate (Road Transport)',
    'Inclu RTrain': 'Included in Rate (Train)',
    'To-PayB': 'To-Pay Basis',
  }
  return map[code] ?? ''
}

export interface DoNotSendReport {
  sheet: FlexoRateSheet
  lines: DoNotSendLine[]
  footer: {
    freight: string
    plateCharge: string
    /** #29 */
    plateChargeColor: BackColor
    dieCharge: string
    /** #30 */
    dieChargeColor: BackColor
    proofingCharge: string
    gst: string
  }
}

/** The whole report for one sheet: one row per line (the SQL's inner join), no totals. */
export function doNotSendReport(sheet: FlexoRateSheet, rates: RateTable, cfg: QuotationConfig = DEFAULT_QUOTATION_CONFIG): DoNotSendReport {
  const dieCharge = reportTextOf(cfg.lists.dieCharges, sheet.dieCharge)
  return {
    sheet,
    lines: sheet.lines.map((l) => doNotSendLine(l, rates, cfg.numbers)),
    footer: {
      freight: reportTextOf(cfg.lists.freights, sheet.freight),
      plateCharge: reportTextOf(cfg.lists.plateCharges, sheet.plateCharge),
      plateChargeColor: sheet.plateCharge === 'Included' ? 'red' : null,
      dieCharge,
      // #30 compares the printed text with "Included in rate": that is the "Included" code.
      dieChargeColor: sheet.dieCharge === 'Included' && dieCharge !== '' ? 'red' : null,
      proofingCharge: reportTextOf(cfg.lists.proofingCharges, sheet.proofingCharge),
      gst: sheet.gst ?? '',
    },
  }
}
