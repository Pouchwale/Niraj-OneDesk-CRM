/**
 * Quotations → Quotation Sheet → Sales Quotation (24 Nov 2026): SAP's
 * Sales_Quotation.rpt for one sheet, worked out the way that report works it
 * out. It differs from Do not Send (do-not-send.ts) in ways that change the
 * result, and those are kept:
 *
 *   - Final Rate ("Unit Price") is Calculated Rate, or twice it when Set? is
 *     Yes. None of Do not Send's zero checks (value addition, paper width,
 *     job level) apply.
 *   - "Convert Database NULL Values to Default" is OFF, with Exceptions for
 *     Nulls: an empty value the price needs, or a Type with no rate in the
 *     rate table (the LEFT JOIN finds nothing), leaves the Unit Price blank
 *     instead of counting 0. Other Effects (@Effects) is the exception: an
 *     empty Value Addition prints as empty text.
 *   - Dividing by zero stops the report; here it stops that line and says why.
 *   - Length, Ar Gap and the other Do not Send figures are not used.
 *
 * Every formula is the report's, in its order, with its numbers. Pure,
 * relative imports only.
 */

import type { FlexoRateLine, FlexoRateSheet } from './flexo-rate-sheet'
import type { RateTable } from './do-not-send'
import { DEFAULT_NUMBERS, DEFAULT_QUOTATION_CONFIG, DEFAULT_TEXTS, reportTextOf, type QuotationConfig, type QuotationNumbers } from './quotation-config'

/** The letterhead and the fixed texts of the report, byte for byte. */
/**
 * The report's fixed texts as SAP has them (the administrator can change them:
 * quotation-config.ts). Page Header c prints Delivery Location as the text
 * "Gujarat", not the sheet's field.
 */
export const SALES_QUOTATION_TEXT = { ...DEFAULT_TEXTS, continued: 'Cont..' } as const

/**
 * The column headings as the printed quotation shows them, left to right (the
 * user's sample, 24 Nov 2026: Material before No. of Colors, Lay Flat Width
 * empty). Each is split into its printed lines.
 */
export const SALES_QUOTATION_HEADINGS: readonly (readonly string[])[] = [
  ['SR', 'No'],
  ['Item Name'],
  ['Set ?'],
  ['Net', 'Content'],
  ['Length', '(mm)'],
  ['Width', '(mm)'],
  ['Lay Flat', 'Width', '(mm)'],
  ['Material'],
  ['No. of', 'Colors'],
  ['Coating'],
  ['Other Effects'],
  ['Minimum', 'Order Qty'],
  ['Unit Price'],
]

/** Two decimals, half away from zero (Crystal's default number format, as the sample prints 4.17). */
export function twoDecimalText(n: number): string {
  const sign = n < 0 ? -1 : 1
  return ((sign * Math.round(Math.abs(n) * 100 + 1e-9)) / 100).toFixed(2)
}

/** dd/MM/yyyy, as the sample prints the Quotation Date. */
export function quotationDateText(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** One row as printed, under the headings above. */
export function salesRowCells(r: SalesQuotationRow): string[] {
  const plain = (n: number | null) => (n === null ? '' : String(n))
  return [
    String(r.srNo),
    r.line.jobName,
    r.line.set,
    r.line.netContent,
    plain(r.line.cutLength),
    plain(r.line.width),
    '',
    r.line.material,
    plain(r.line.colors),
    r.line.coatingType,
    r.effects,
    plain(r.line.moq),
    r.error ? 'Error' : r.unitPrice === null ? '' : twoDecimalText(r.unitPrice),
  ]
}

/* ── Pages, measured from the sample (A4 landscape, points) ── */

export const SQ_PAGE = {
  rowHeight: 17.15,
  /** Where the rows start: page 1 (after the quotation details), later pages, and a last page after page 1 (no headings there). */
  rowsTopFirst: 227.1,
  rowsTopNext: 145.4,
  rowsTopLastNoHeadings: 106.9,
  /** The page footer (the corporate office strip) starts here. */
  footerTop: 501.2,
  /** Payment Terms, Other Charges, Remarks, the declaration and the closing line. */
  closingHeight: 158.6,
} as const

export interface SalesQuotationPage {
  number: number
  rows: SalesQuotationRow[]
  rowsTop: number
  /** Page Header c (number, date, validity, lead time, currency): page 1 only. */
  details: boolean
  /** Page Header f (column headings): hidden on the last page when it is not page 1 (@Section_Visibility). */
  headings: boolean
  /** The Report Footer (charges, declaration): last page only. */
  closing: boolean
}

/** Splits the rows over pages the way the report's sections fall. */
export function paginate(rows: SalesQuotationRow[]): SalesQuotationPage[] {
  const P = SQ_PAGE
  const fit = (top: number, withClosing: boolean) => Math.max(0, Math.floor((P.footerTop - top - (withClosing ? P.closingHeight : 0)) / P.rowHeight + 1e-9))
  const pages: SalesQuotationPage[] = []
  let left = rows.slice()
  // Page 1.
  if (left.length <= fit(P.rowsTopFirst, true)) return [{ number: 1, rows: left, rowsTop: P.rowsTopFirst, details: true, headings: true, closing: true }]
  const first = Math.max(1, fit(P.rowsTopFirst, false))
  pages.push({ number: 1, rows: left.slice(0, first), rowsTop: P.rowsTopFirst, details: true, headings: true, closing: false })
  left = left.slice(first)
  for (;;) {
    if (left.length <= fit(P.rowsTopLastNoHeadings, true)) {
      pages.push({ number: pages.length + 1, rows: left, rowsTop: P.rowsTopLastNoHeadings, details: false, headings: false, closing: true })
      return pages
    }
    const take = Math.max(1, Math.min(left.length, fit(P.rowsTopNext, false)))
    pages.push({ number: pages.length + 1, rows: left.slice(0, take), rowsTop: P.rowsTopNext, details: false, headings: true, closing: false })
    left = left.slice(take)
  }
}

class CrystalStop extends Error {}
/** A value the formula needs is NULL: the formula, and every formula after it, is NULL (Exceptions for Nulls). */
class Null extends Error {}

const div = (a: number, b: number, formula: string) => {
  if (b === 0) throw new CrystalStop(`Division by zero in ${formula}`)
  return a / b
}
/** A number column read as it is: NULL stays NULL. */
const need = (v: number | null | undefined): number => {
  if (v === null || v === undefined || !Number.isFinite(v)) throw new Null()
  return v
}
/** A text column: an empty one is NULL in SAP. */
const needText = (v: string | null | undefined): string => {
  if (!v) throw new Null()
  return v
}
/** A rate from the LEFT JOIN: a Type with no row, or an empty Type, is NULL. */
const needRate = (rates: RateTable, type: string | null | undefined): number => {
  if (!type || !(type in rates) || !Number.isFinite(rates[type])) throw new Null()
  return rates[type]
}

/**
 * The Unit Price (@Final Rate) of one line: a number, null when a value it
 * needs is empty (printed blank), or a CrystalStop error.
 */
export function salesUnitPrice(line: FlexoRateLine, rates: RateTable, n: QuotationNumbers = DEFAULT_NUMBERS): number | null {
  try {
    const teeth = need(line.teeth)
    // #27 ({Command.U_Teeth}*3.175)/1000
    const circumference = (teeth * n.teethPitch) / 1000
    // #28 ((tonumber({Command.U_MOQ})*{@Circumference})/tonumber({Command.U_AroundUP}))/tonumber({Command.U_AcrossUP})
    const moq = need(line.moq)
    const aroundUp = need(line.aroundUps)
    const acrossUp = need(line.acrossUps)
    const runningMeters = div(div(moq * circumference, aroundUp, 'Running Meters (Around Ups is 0)'), acrossUp, 'Running Meters (Across Ups is 0)')
    // #29 ToNumber({Command.U_AcrossGAP})
    const acGape = need(line.acrossGap)
    // #35
    const itemType = needText(line.itemType)
    const lPlusS = itemType === 'Label' ? n.labelLS : n.otherLS
    // #36, #41: no final else, so anything else is 0
    const jobLevel = needText(line.jobLevel)
    const changeoverTime = jobLevel === 'Level 1' ? n.changeoverL1 : jobLevel === 'Level 2' ? n.changeoverL2 : jobLevel === 'Level 3' ? n.changeoverL3 : 0
    const printSpeed = jobLevel === 'Level 1' ? n.printSpeedL1 : jobLevel === 'Level 2' ? n.printSpeedL2 : jobLevel === 'Level 3' ? n.printSpeedL3 : 0
    // #46
    const wastageMeters = changeoverTime === n.changeoverL1 ? n.wastageMetersL1 : changeoverTime === n.changeoverL2 ? n.wastageMetersL2 : changeoverTime === n.changeoverL3 ? n.wastageMetersL3 : 0
    // #21
    const w = need(line.width)
    const width = itemType === 'Sleeve' ? (n.sleeveMargin + w * acrossUp + (acrossUp - 1) * acGape) / 1000 : (n.labelMargin + w * acrossUp + (acrossUp - 1) * acGape) / 1000
    // #31
    const sqmPerLabel = div(width * circumference, acrossUp * aroundUp, 'SQM Per Label (Across Ups or Around Ups is 0)')
    // #33, #37, #38, #39, #40 (rates by the LEFT JOINs: no row is NULL)
    const coatingCost = sqmPerLabel * needRate(rates, line.coatingType)
    const freightCost = ((sqmPerLabel * n.weightFactor) / 1000) * needRate(rates, line.deliveryZone)
    const inkCost = (sqmPerLabel * n.inkRate * need(line.inkCoverageArea)) / 100
    const materailRate = needRate(rates, line.material)
    const materialCost = sqmPerLabel * materailRate
    const packingCost = ((sqmPerLabel * n.weightFactor) / 1000) * n.packingRate
    // #42
    const conversionCost =
      div((changeoverTime + div(runningMeters, printSpeed, 'Conversion Cost (Job Level is not Level 1, 2 or 3)') / 60) * n.conversionPerHour, moq, 'Conversion Cost (MOQ is 0)') +
      sqmPerLabel * lPlusS
    // #45
    const valueAddCost = sqmPerLabel * needRate(rates, line.valueAddition) * (need(line.valueAddCoverageArea) / 100)
    // #48
    const wastageCost = div((wastageMeters + (runningMeters / n.wastageRunPer) * n.wastageRunAdd) * width * materailRate * n.wastageFactor, moq, 'Wastage Cost (MOQ is 0)') * n.wastageUplift
    // #47
    const totalCost = conversionCost + coatingCost + materialCost + valueAddCost + wastageCost + inkCost + freightCost + packingCost
    // #49
    const profitCost = (need(line.profitOverhead) / 100) * totalCost
    // #50
    const calculatedRate = itemType === 'Label' ? totalCost + profitCost + 0 : totalCost + profitCost + 0 + n.sleeveAddOn
    // #26
    const set = needText(line.set)
    return set === 'Yes' ? calculatedRate * n.setMultiplier : calculatedRate
  } catch (err) {
    if (err instanceof Null) return null
    throw err
  }
}

export interface SalesQuotationRow {
  srNo: number
  line: FlexoRateLine
  /** Null: printed blank (a value it needs is empty). */
  unitPrice: number | null
  /** Set when the report would stop on this line. */
  error: string | null
  /** @Effects: the Value Addition, empty text when it is empty. */
  effects: string
}

export interface SalesQuotationDoc {
  sheet: FlexoRateSheet
  /** "Sales Quotation - {Item Type} For {Customer}", from the first line, as a page header reads the first record. */
  title: string
  /** "{DocEntry} - {Year}". */
  quotationNo: string
  /** The letterhead, quotation details and declaration texts in force. */
  texts: QuotationConfig['texts']
  rows: SalesQuotationRow[]
  footer: { freight: string; paymentTerms: string; plateCharge: string; dieCharge: string; proofingCharge: string; gst: string }
}

export function salesQuotation(sheet: FlexoRateSheet, rates: RateTable, cfg: QuotationConfig = DEFAULT_QUOTATION_CONFIG): SalesQuotationDoc {
  const rows = sheet.lines.map((line, i) => {
    let unitPrice: number | null = null
    let error: string | null = null
    try {
      unitPrice = salesUnitPrice(line, rates, cfg.numbers)
    } catch (err) {
      if (!(err instanceof CrystalStop)) throw err
      error = err.message
    }
    return { srNo: i + 1, line, unitPrice, error, effects: line.valueAddition ?? '' }
  })
  // #25 year({Command.U_Date}): an empty date prints nothing after the dash.
  const year = sheet.date && /^\d{4}/.test(sheet.date) ? sheet.date.slice(0, 4) : ''
  return {
    sheet,
    title: `Sales Quotation - ${sheet.lines[0]?.itemType ?? ''} For ${sheet.customer ?? ''}`,
    quotationNo: `${sheet.docEntry} - ${year}`,
    texts: cfg.texts,
    rows,
    footer: {
      freight: reportTextOf(cfg.lists.freights, sheet.freight),
      paymentTerms: ` ${sheet.paymentTerms ?? ''}`,
      plateCharge: reportTextOf(cfg.lists.plateCharges, sheet.plateCharge),
      dieCharge: reportTextOf(cfg.lists.dieCharges, sheet.dieCharge),
      proofingCharge: reportTextOf(cfg.lists.proofingCharges, sheet.proofingCharge),
      gst: sheet.gst ?? '',
    },
  }
}
