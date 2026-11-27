/**
 * Do not Send → Download PDF (27 Nov 2026): SAP's DO_NOT_SEND print, laid out
 * from the user's own SAP file (5382-Shree_ganesh_bakery_nandani_pvt_DO_NOT_SEND.pdf).
 * One wide landscape page, 1899 × 612 pt, as SAP's. Every position, size and
 * colour below was measured from that file (text baselines, right edges for
 * numbers, left edges for text, centres for the four centred columns).
 *
 * Measured from SAP's file: all text, the frame and its two lines, the yellow
 * Paper Width box, the green Factor box and the yellow Remarks bar. Not shown
 * in that file, so sized from the column headings: the red/yellow boxes of
 * Set ?, Ar Gap, Job Level, Value Add Area, Profit + Overhead, Total Value,
 * Plate Charge and Die Charge.
 *
 * Fonts: Arial is printed as Helvetica (the same letter widths); SAP's Calibri
 * Bold footer labels and Tahoma Ac Ups are printed in Helvetica, the labels
 * squeezed to Calibri's measured widths.
 *
 * Layout is a pure function (doNotSendPdfPages) so it can be checked against
 * SAP's positions; drawing is a thin jsPDF loop.
 */

import { DNS_DECIMALS, dnsFixed, pmtDays, type BackColor, type DoNotSendLine, type DoNotSendReport } from '@/lib/do-not-send'
import { quotationDateText } from '@/lib/sales-quotation'

export const DNS_PAGE = { width: 1899, height: 612 } as const

type RGB = [number, number, number]
export type PdfOp =
  | { kind: 'text'; text: string; x: number; y: number; size: number; bold: boolean; align: 'left' | 'right' | 'center'; hScale?: number }
  | { kind: 'fill'; x: number; y: number; w: number; h: number; rgb: RGB }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'frame'; x: number; y: number; w: number; h: number }

/** Crystal's colour constants. */
const CR: Record<'red' | 'yellow' | 'lime', RGB> = { red: [255, 0, 0], yellow: [255, 255, 0], lime: [0, 255, 0] }

/** Detail rows: 21.3 pt apart, the first one's Arial baseline at 95.05. */
const ROW = { pitch: 21.3, base: 95.05, smallBase: 94.15, tinyBase: 94.95, boxTop: 86.9, boxH: 14.1, sectionTop: 84.9 }
/** SAP prints at most this many lines on a page with the footer; more go on following pages. */
export const DNS_ROWS_PER_PAGE = 20

/* Helvetica's letter widths (per 1000), to fit text in its column as Crystal clips it. */
const HELV_WIDTHS =
  '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584'
    .split(',')
    .map(Number)
const HELVB_WIDTHS =
  '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584'
    .split(',')
    .map(Number)
export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? HELVB_WIDTHS : HELV_WIDTHS
  let w = 0
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    w += c >= 32 && c <= 126 ? table[c - 32] : 556
  }
  return (w * size) / 1000
}
/** Crystal cuts a field at its box: drop letters until it fits. */
function fit(text: string, size: number, room: number, bold = false): string {
  let t = text
  while (t.length > 0 && textWidth(t, size, bold) > room) t = t.slice(0, -1)
  return t
}

type Col = {
  /** Anchor: left edge (left), right edge (right) or centre (center). */
  x: number
  align: 'left' | 'right' | 'center'
  size?: number
  /** Which baseline: 'small' = Arial 7.15 (Ac Gap, Ar Gap, Paper Width), 'tiny' = SAP's Tahoma 6.6 (Ac Ups). */
  font?: 'small' | 'tiny'
  /** Room for text columns (Crystal clips there). */
  room?: number
  /** Background box [left, right]. */
  box?: [number, number]
  value: (r: DoNotSendLine, pmt: number) => string
  color?: (r: DoNotSendLine) => BackColor | 'lime'
}

const str = (v: string | null | undefined) => v ?? ''
const int = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '0' : String(v))
const plain = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(v))
const fig = (r: DoNotSendLine, key: keyof typeof DNS_DECIMALS) => dnsFixed(r.figures?.[key], DNS_DECIMALS[key])

/** The 28 detail columns, in SAP's order. */
export const DNS_PDF_COLUMNS: (Col & { heading: string })[] = [
  { heading: 'Job Name', x: 13.95, align: 'left', room: 222, value: (r) => str(r.line.jobName) },
  { heading: 'Net Content', x: 252.25, align: 'center', room: 30, value: (r) => str(r.line.netContent) },
  { heading: 'Set ?', x: 287.18, align: 'center', box: [275.6, 298.8], value: (r) => str(r.line.set), color: (r) => r.colors.set },
  { heading: 'Length', x: 317.06, align: 'center', value: (r) => plain(r.line.cutLength) },
  { heading: 'Width', x: 349.84, align: 'center', value: (r) => plain(r.line.width) },
  { heading: 'MOQ', x: 414.47, align: 'right', value: (r) => int(r.line.moq) },
  { heading: 'Teeth', x: 436.06, align: 'right', value: (r) => int(r.line.teeth) },
  { heading: 'Ac Ups', x: 460.47, align: 'right', font: 'tiny', value: (r) => int(r.line.acrossUps) },
  { heading: 'Ac Gap', x: 488.16, align: 'right', font: 'small', value: (r) => int(r.line.acrossGap) },
  { heading: 'Ar Gap', x: 523.7, align: 'right', font: 'small', box: [495.0, 523.8], value: (r) => fig(r, 'arGap'), color: (r) => r.colors.arGap },
  { heading: 'Paper Width', x: 569.58, align: 'right', font: 'small', box: [533.5, 569.7], value: (r) => fig(r, 'width'), color: (r) => r.colors.width },
  { heading: 'Running Meters', x: 615.72, align: 'right', value: (r) => fig(r, 'runningMeters') },
  { heading: 'Colors', x: 638.11, align: 'right', value: (r) => int(r.line.colors) },
  { heading: 'Job Level', x: 656.7, align: 'left', room: 46, box: [655.9, 702.0], value: (r) => str(r.line.jobLevel), color: (r) => r.colors.jobLevel },
  { heading: 'CoatingType', x: 705.7, align: 'left', room: 150, value: (r) => str(r.line.coatingType) },
  { heading: 'Value Add Area', x: 902.71, align: 'right', box: [856.0, 902.8], value: (r) => int(r.line.valueAddCoverageArea), color: (r) => r.colors.valueAddArea },
  { heading: 'Value Addition', x: 944.2, align: 'left', room: 125, value: (r) => str(r.line.valueAddition) },
  { heading: 'Material Type', x: 1073.7, align: 'left', room: 135, value: (r) => str(r.line.material) },
  { heading: 'Ink Coverage', x: 1248.71, align: 'right', value: (r) => int(r.line.inkCoverageArea) },
  { heading: 'Dispatch Location', x: 1266.95, align: 'left', room: 170, value: (r) => r.dispatchLocation },
  { heading: 'Profit + Overhead', x: 1472.81, align: 'right', box: [1440.0, 1472.9], value: (r) => int(r.line.profitOverhead), color: (r) => r.colors.profitOverhead },
  { heading: 'Pmt Days', x: 1528.71, align: 'right', value: (_, pmt) => String(pmt) },
  { heading: 'Final Rate', x: 1590.47, align: 'right', value: (r) => fig(r, 'finalRate') },
  { heading: 'Total Value', x: 1649.97, align: 'right', box: [1597.0, 1650.0], value: (r) => fig(r, 'totalValue'), color: (r) => r.colors.totalValue },
  // SAP's Factor box is always green (a fixed colour in the report, not a rule).
  { heading: 'Factor', x: 1712.52, align: 'right', box: [1655.7, 1712.4], value: (r) => fig(r, 'factor'), color: () => 'lime' },
  { heading: 'Price/SQM', x: 1774.32, align: 'right', value: (r) => fig(r, 'pricePerSqm') },
  { heading: 'RM Price/SQM', x: 1828.32, align: 'right', value: (r) => fig(r, 'rmPricePerSqm') },
  { heading: 'Cons Price/SQM', x: 1880.07, align: 'right', value: (r) => fig(r, 'consPricePerSqm') },
]

/** Column headings exactly as SAP prints them: [text, left x, baseline, size]. */
const HEADINGS: [string, number, number, number][] = [
  ['Job Name', 13.95, 67.2, 7.8],
  ['Net ', 245.85, 67.2, 7.8], ['Content', 237.45, 78.45, 7.8],
  ['Set ?', 277.65, 67.2, 7.8],
  ['Length ', 301.95, 67.2, 7.8],
  ['Width', 339.05, 67.2, 7.8],
  ['MOQ', 395.85, 67.2, 7.8],
  ['Teeth', 422.7, 67.2, 7.8],
  ['Ac ', 452.55, 67.2, 7.8], ['Ups', 450.2, 78.45, 7.8],
  ['Ac ', 480.2, 67.2, 7.8], ['Gap', 477.65, 78.45, 7.8],
  ['Ar ', 511.45, 67.2, 7.8], ['Gap', 508.25, 78.45, 7.8],
  ['Paper', 548.0, 67.2, 7.8], [' Width', 546.0, 78.45, 7.8],
  ['Running', 584.15, 67.2, 7.8], ['Meters', 590.5, 78.45, 7.8],
  ['Colors', 622.4, 67.2, 7.8],
  ['Job Level', 656.7, 67.2, 7.8],
  ['CoatingType', 705.7, 67.2, 7.8],
  ['Value Add', 865.3, 67.2, 7.8], ['Area', 885.3, 78.45, 7.8],
  ['Value Addition', 944.2, 67.2, 7.8],
  ['Material Type', 1073.7, 67.2, 7.8],
  ['Ink', 1237.5, 67.2, 7.8], ['Coverage', 1213.15, 78.45, 7.8],
  ['Dispatch Location', 1267.0, 67.2, 7.8],
  ['Profit + ', 1450.5, 67.95, 8.75], ['Overhead', 1445.6, 79.95, 8.75],
  ['Pmt ', 1517.9, 67.2, 7.8], ['Days', 1515.95, 78.45, 7.8],
  ['Final', 1572.3, 67.2, 7.8], ['Rate', 1573.5, 78.45, 7.8],
  ['Total', 1631.9, 67.2, 7.8], ['Value', 1629.6, 78.45, 7.8],
  ['Factor', 1688.6, 67.2, 7.8],
  ['Price/SQM', 1725.4, 67.95, 8.75],
  ['RM ', 1799.2, 67.2, 7.8], ['Price/SQM', 1785.8, 78.45, 7.8],
  ['Cons ', 1847.3, 67.2, 7.8], ['Price/SQM', 1837.55, 78.45, 7.8],
]

/** Footer b: label (Calibri Bold 7.35 in SAP, with its measured width), colon and value baselines. */
const FOOTER: { label: string; width: number; labelY: number; colonY: number; valueY: number; key: keyof DoNotSendReport['footer']; color?: keyof DoNotSendReport['footer'] }[] = [
  { label: 'Freight', width: 21.37, labelY: 179.15, colonY: 180.65, valueY: 179.0, key: 'freight' },
  { label: 'Plate Charge', width: 38.1, labelY: 190.95, colonY: 192.45, valueY: 190.8, key: 'plateCharge', color: 'plateChargeColor' },
  { label: 'Die Charge', width: 32.85, labelY: 202.15, colonY: 203.65, valueY: 202.0, key: 'dieCharge', color: 'dieChargeColor' },
  { label: 'Proofing Charge', width: 48.91, labelY: 213.55, colonY: 215.05, valueY: 213.4, key: 'proofingCharge' },
  { label: 'GST Charge (Extra)', width: 56.34, labelY: 226.3, colonY: 227.8, valueY: 226.15, key: 'gst' },
]

const bg = (c: BackColor | 'lime' | undefined): RGB | null => (c === 'red' ? CR.red : c === 'yellow' ? CR.yellow : c === 'lime' ? CR.lime : null)

/** Document No. as SAP prints it: thousands with a comma ("5,382"). */
const docNo = (n: number) => n.toLocaleString('en-US')

/** The PDF, page by page, as drawing steps. */
export function doNotSendPdfPages(report: DoNotSendReport): PdfOp[][] {
  const sheet = report.sheet
  const pmt = pmtDays(sheet.paymentTerms)
  const chunks: DoNotSendLine[][] = []
  for (let i = 0; i < report.lines.length; i += DNS_ROWS_PER_PAGE) chunks.push(report.lines.slice(i, i + DNS_ROWS_PER_PAGE))
  if (chunks.length === 0) chunks.push([])

  return chunks.map((rows, pageIndex) => {
    const ops: PdfOp[] = []
    const text = (t: string, x: number, y: number, size: number, bold: boolean, align: 'left' | 'right' | 'center' = 'left', hScale?: number) => {
      if (t !== '') ops.push({ kind: 'text', text: t, x, y, size, bold, align, ...(hScale ? { hScale } : {}) })
    }
    const n = rows.length
    const shift = (n - 3) * ROW.pitch

    // Report header (SAP: Document No., Date, Marketing Person, customer).
    text('Document No.', 1189.45, 25.95, 8.75, true)
    text(sheet.docEntry ? docNo(sheet.docEntry) : '', 1286.58, 25.15, 8.95, false, 'right')
    text('Document Date', 1449.45, 25.95, 8.75, true)
    text(quotationDateText(sheet.date), 1527.7, 25.15, 8.95, false)
    text('Marketing Person', 1617.45, 25.95, 8.75, true)
    text(fit(str(sheet.marketingPerson), 8.95, 170), 1709.7, 25.15, 8.95, false)
    text(fit(str(sheet.customer), 12.25, 430, true), 1718.3, 45.85, 12.25, true, 'center')

    // Page header: the column headings.
    for (const [t, x, y, size] of HEADINGS) text(t, x, y, size, true)

    // Frame round header and lines, and its two rules.
    ops.push({ kind: 'frame', x: 10.2, y: 10.9, w: 1886.0 - 10.2, h: ROW.sectionTop + n * ROW.pitch - 1.0 - 10.9 })
    ops.push({ kind: 'line', x1: 11.7, y1: 54.2, x2: 1886.0, y2: 54.2 })
    ops.push({ kind: 'line', x1: 10.9, y1: 84.9, x2: 1886.0, y2: 84.9 })

    rows.forEach((r, i) => {
      const dy = i * ROW.pitch
      for (const c of DNS_PDF_COLUMNS) {
        const rgb = c.box && c.color ? bg(c.color(r)) : null
        if (rgb && c.box) ops.push({ kind: 'fill', x: c.box[0], y: ROW.boxTop + dy, w: c.box[1] - c.box[0], h: ROW.boxH, rgb })
      }
      for (const c of DNS_PDF_COLUMNS) {
        const size = c.font === 'small' ? 7.15 : c.font === 'tiny' ? 6.6 : 8.1
        const base = c.font === 'small' ? ROW.smallBase : c.font === 'tiny' ? ROW.tinyBase : ROW.base
        const v = c.room ? fit(c.value(r, pmt), size, c.room) : c.value(r, pmt)
        text(v, c.x, base + dy, size, false, c.align)
      }
    })

    if (pageIndex === chunks.length - 1) {
      // Report footer a: the remarks, right-aligned in a yellow bar (a fixed colour in SAP).
      ops.push({ kind: 'fill', x: 690.5, y: 148.9 + shift, w: 1877.8 - 690.5, h: 13.7, rgb: CR.yellow })
      const remark = str(sheet.remark).replace(/\s+/g, ' ').trim()
      text(fit(remark, 9.85, 1180), 1877.68, 158.7 + shift, 9.85, false, 'right')

      // Report footer b: Freight, Plate, Die, Proofing, GST.
      for (const f of FOOTER) {
        const value = String(report.footer[f.key] ?? '')
        const rgb = f.color ? bg(report.footer[f.color] as BackColor) : null
        if (rgb && value) ops.push({ kind: 'fill', x: 1500.0, y: f.valueY + shift - 7.35, w: textWidth(value, 8.1) + 0.5, h: 9.2, rgb })
        text(f.label, 1420.95, f.labelY + shift, 7.35, true, 'left', f.width / textWidth(f.label, 7.35, true))
        text(':', 1494.2, f.colonY + shift, 8.75, true)
        text(value, 1500.0, f.valueY + shift, 8.1, false)
      }
    }
    return ops
  })
}

/** SAP's file name: "5382-Shree_ganesh_bakery_nandani_pvt_DO_NOT_SEND.pdf". */
export function doNotSendFileName(report: DoNotSendReport): string {
  const name = str(report.sheet.customer).trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
  return `${report.sheet.docEntry}-${name}_DO_NOT_SEND.pdf`
}

export async function renderDoNotSendPdf(report: DoNotSendReport) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [DNS_PAGE.width, DNS_PAGE.height] })
  doc.setProperties({ title: doNotSendFileName(report).replace(/\.pdf$/, '') })
  doNotSendPdfPages(report).forEach((ops, i) => {
    if (i > 0) doc.addPage([DNS_PAGE.width, DNS_PAGE.height], 'landscape')
    doc.setTextColor(0, 0, 0)
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0)
    // Boxes first, then lines and text over them, as Crystal draws them.
    for (const op of ops) {
      if (op.kind !== 'fill') continue
      doc.setFillColor(...op.rgb)
      doc.rect(op.x, op.y, op.w, op.h, 'F')
    }
    for (const op of ops) {
      if (op.kind === 'frame') doc.rect(op.x, op.y, op.w, op.h, 'S')
      else if (op.kind === 'line') doc.line(op.x1, op.y1, op.x2, op.y2)
      else if (op.kind === 'text') {
        doc.setFont('helvetica', op.bold ? 'bold' : 'normal')
        doc.setFontSize(op.size)
        // jsPDF keeps a squeeze for the texts after it, so every text sets its own (1 = none).
        doc.text(op.text, op.x, op.y, { align: op.align, baseline: 'alphabetic', horizontalScale: op.hScale ?? 1 })
      }
    }
  })
  return doc
}

export async function downloadDoNotSendPdf(report: DoNotSendReport): Promise<void> {
  const doc = await renderDoNotSendPdf(report)
  doc.save(doNotSendFileName(report))
}
