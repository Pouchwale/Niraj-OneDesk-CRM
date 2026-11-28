/**
 * Quotations → Performance → Conversions and score as an A4 landscape PDF, in
 * the house letterhead (see overview-report-pdf.ts). It is handed the same
 * summaries the screen shows, so the two cannot disagree. Amounts are written
 * in full, with "Rs" because the PDF's built-in fonts have no rupee sign.
 */

import { minusFixed } from '@/lib/minus-score'
import { QUOTATION_SCORE, type ConversionSummary } from '@/lib/quotation-stats'
import { formatCurrency } from '@/lib/utils'
import { loadLogo } from '@/features/companies/overview-report-pdf'

type RGB = [number, number, number]
const BRAND: RGB = [127, 61, 63]
const BLUSH: RGB = [251, 241, 245]
const BLUSH_LINE: RGB = [238, 216, 225]
const INK: RGB = [33, 33, 38]
const MUTED: RGB = [110, 110, 120]
const RULE: RGB = [226, 226, 232]

export interface ConversionsPdfInput {
  /** "24 Oct 2026 – 31 Oct 2026 · by quotation date", or "All dates". */
  period: string
  /** Whose quotations: "Whole team" or one person's name. */
  who: string
  /** Any other filter applied, in words. */
  filters: string[]
  team: ConversionSummary
  /** One line per coordinator; empty when the screen shows no table. */
  people: { name: string; summary: ConversionSummary }[]
  generatedBy: string
  /** yyyy-mm-dd, for the file name. */
  today: string
}

/** The screen's text in the PDF's built-in font: Rs for the rupee sign, a plain dash. */
export const pdfText = (text: string) => text.replace(/₹\s?/g, 'Rs ').replace(/[–—]/g, '-')
const n = (v: number) => v.toLocaleString('en-IN')
const money = (v: number) => (v ? pdfText(formatCurrency(v)) : '-')
const avg = (v: number | null) => pdfText(minusFixed(v, 2))

/** A table line, in the screen's column order. */
export const conversionCells = (name: string, s: ConversionSummary): string[] => [
  name,
  n(s.quotations),
  n(s.conversions),
  n(s.newConversions),
  n(s.existingConversions),
  money(s.amount),
  n(s.score),
  n(s.customers),
  avg(s.averageScore),
]

/** The three summary tiles, as on the screen. */
export function conversionTiles(t: ConversionSummary) {
  return [
    { label: 'Total quotations', total: n(t.quotations), hint: '', split: [['New', n(t.newQuotations)], ['Existing', n(t.existingQuotations)]] },
    {
      label: 'Total conversion',
      total: n(t.conversions),
      hint: [t.conversionRate === null ? null : `${t.conversionRate}% of quotations`, t.amount ? `${money(t.amount)} total amount` : null].filter(Boolean).join('  ·  '),
      split: [['New', n(t.newConversions)], ['Existing', n(t.existingConversions)]],
    },
    { label: 'Avg score (per customer)', total: avg(t.averageScore), hint: '', split: [['Total points', n(t.score)], ['Count of customer', n(t.customers)]] },
  ]
}

export async function downloadConversionsPdf(input: ConversionsPdfInput): Promise<void> {
  const doc = await renderConversionsPdf(input, await loadLogo())
  doc.save(`Quotation Conversions and Score ${input.today}.pdf`)
}

/* The house look, shared with the Performance report (28 Nov 2026). */
export const PDF_COLOURS = { BRAND, BLUSH, BLUSH_LINE, INK, MUTED, RULE }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any

/** The letterhead: logo, title, whose, the period, who made it. Returns where the page's content starts. */
export function drawLetterhead(doc: Doc, o: { title: string; who: string; period: string; generatedBy: string; generatedAt: string; logo?: string | null }): number {
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  const [dates, basis] = pdfText(o.period).split(' · ')
  const top = 12
  if (o.logo) {
    try {
      doc.addImage(o.logo, 'PNG', M, top, 16, 16)
    } catch {
      /* drawn without the logo */
    }
  }
  const tx = o.logo ? M + 20 : M
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND)
  doc.text('ONEDESK CRM  ·  QUOTATIONS', tx, top + 3.5, { charSpace: 0.4 })
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text(o.title, tx, top + 11.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(pdfText(o.who), tx, top + 16.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND)
  const periodLabel = 'REPORT PERIOD'
  doc.text(periodLabel, W - M - doc.getTextWidth(periodLabel) - 0.4 * (periodLabel.length - 1), top + 3.5, { charSpace: 0.4 })
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(dates, W - M, top + 9.5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  if (basis) doc.text(basis.replace(/^by /, 'By '), W - M, top + 13.5, { align: 'right' })
  doc.text(`Generated ${o.generatedAt} by ${pdfText(o.generatedBy)}`, W - M, top + 17.5, { align: 'right' })
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(M, top + 22, W - M, top + 22)
  return top + 28
}

/** The running header (pages 2+) and the footer (every page). */
export function drawPageChrome(doc: Doc, title: string, period: string, generatedAt: string): void {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const [dates] = pdfText(period).split(' · ')
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...INK)
      doc.text(title, M, 10.3)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text(dates, W - M, 10.3, { align: 'right' })
      doc.setDrawColor(...BRAND)
      doc.setLineWidth(0.3)
      doc.line(M, 13.5, W - M, 13.5)
    }
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(M, H - 10, W - M, H - 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(`OneDesk CRM  ·  Quotations  ·  Generated ${generatedAt}  ·  Internal, for management use`, M, H - 6)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 6, { align: 'right' })
  }
}

export async function renderConversionsPdf(input: ConversionsPdfInput, logo?: string | null) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const [dates, basis] = pdfText(input.period).split(' · ')
  const generatedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  /* ----- letterhead ----- */
  const top = 12
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', M, top, 16, 16)
    } catch {
      /* drawn without the logo */
    }
  }
  const tx = logo ? M + 20 : M
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND)
  doc.text('ONEDESK CRM  ·  QUOTATIONS', tx, top + 3.5, { charSpace: 0.4 })
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text('Conversions and Score', tx, top + 11.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(pdfText(input.who), tx, top + 16.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND)
  // Spaced letters are placed from the left: right-aligning them would run past the margin.
  const periodLabel = 'REPORT PERIOD'
  doc.text(periodLabel, W - M - doc.getTextWidth(periodLabel) - 0.4 * (periodLabel.length - 1), top + 3.5, { charSpace: 0.4 })
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(dates, W - M, top + 9.5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  if (basis) doc.text(basis.replace(/^by /, 'By '), W - M, top + 13.5, { align: 'right' })
  doc.text(`Generated ${generatedAt} by ${pdfText(input.generatedBy)}`, W - M, top + 17.5, { align: 'right' })

  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(M, top + 22, W - M, top + 22)

  let y = top + 28
  if (input.filters.length) {
    doc.setFontSize(8.5)
    doc.setTextColor(...INK)
    const lines = doc.splitTextToSize(`Filters applied: ${input.filters.map(pdfText).join('  ·  ')}`, W - 2 * M) as string[]
    doc.text(lines, M, y)
    y += lines.length * 3.8 + 1.5
  }

  /* ----- the three summary tiles ----- */
  const gap = 4
  const tileW = (W - 2 * M - gap * 2) / 3
  const tileH = 34
  conversionTiles(input.team).forEach((tile, i) => {
    const x = M + i * (tileW + gap)
    doc.setFillColor(...BLUSH)
    doc.setDrawColor(...BLUSH_LINE)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, tileW, tileH, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(tile.label.toUpperCase(), x + 4, y + 5.5, { charSpace: 0.2 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...BRAND)
    doc.text(tile.total, x + 4, y + 13)
    if (tile.hint) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      doc.setTextColor(...MUTED)
      doc.text(tile.hint, x + 4, y + 17.5)
    }
    doc.setDrawColor(...BLUSH_LINE)
    doc.line(x + 4, y + 20, x + tileW - 4, y + 20)
    tile.split.forEach(([name, value], k) => {
      const sx = x + 4 + (k * (tileW - 8)) / 2
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      doc.setTextColor(...MUTED)
      doc.text(name, sx, y + 24.5)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      doc.text(value, sx, y + 29.5)
    })
  })
  y += tileH + 6

  /* ----- one line per coordinator, with the Team total ----- */
  if (input.people.length) {
    const center = { halign: 'center' as const }
    const low = { halign: 'right' as const, valign: 'bottom' as const }
    autoTable(doc, {
      startY: y,
      head: [
        [
          { content: 'Coordinator', rowSpan: 2, styles: { halign: 'left', valign: 'bottom' } },
          { content: 'Total quotations', rowSpan: 2, styles: low },
          { content: 'Conversion', colSpan: 3, styles: center },
          { content: 'Total amount', rowSpan: 2, styles: low },
          { content: 'Score', colSpan: 3, styles: center },
        ],
        ['Total', 'New', 'Existing', 'Points', 'Customers', 'Avg'].map((content) => ({ content, styles: { halign: 'right' as const } })),
      ],
      body: input.people.map((p) => conversionCells(pdfText(p.name), p.summary)),
      foot: [conversionCells('Team', input.team).map((content, i) => (i ? content : { content, styles: { halign: 'left' as const } }))],
      margin: { left: M, right: M, top: 18, bottom: 16 },
      theme: 'grid',
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.9, textColor: INK, lineColor: RULE, lineWidth: 0.15, halign: 'right', valign: 'middle' },
      headStyles: { fillColor: BLUSH, textColor: BRAND, fontStyle: 'bold', fontSize: 8, lineColor: BLUSH_LINE },
      footStyles: { fillColor: BLUSH, textColor: INK, fontStyle: 'bold', lineColor: BLUSH_LINE },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 48 }, 5: { cellWidth: 34 }, 8: { fontStyle: 'bold' } },
      showHead: 'everyPage',
      showFoot: 'lastPage',
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5
  }

  /* ----- how it is counted ----- */
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  const note = doc.splitTextToSize(
    `Conversion = a Closed quotation; Total amount = the order value of the conversions. Points per quotation: Closed + New customer = ${QUOTATION_SCORE.closedNew}, Closed + Existing customer = ${QUOTATION_SCORE.closedExisting}, Open or Lost = 0. Count of customer = different customers quoted in the period; Avg score = total points / count of customer, in minus scoring: the gap from 100, so 0 is full marks and 85 shows as -15 (above 100 shows with a +).`,
    W - 2 * M
  ) as string[]
  if (y + note.length * 3.3 > H - 13) {
    doc.addPage()
    y = 20
  }
  doc.setTextColor(...MUTED)
  doc.text(note, M, y + 2)

  /* ----- running header (pages 2+) and footer (every page) ----- */
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...INK)
      doc.text('Conversions and Score', M, 10.3)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text(dates, W - M, 10.3, { align: 'right' })
      doc.setDrawColor(...BRAND)
      doc.setLineWidth(0.3)
      doc.line(M, 13.5, W - M, 13.5)
    }
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(M, H - 10, W - M, H - 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(`OneDesk CRM  ·  Quotations  ·  Generated ${generatedAt}  ·  Internal, for management use`, M, H - 6)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 6, { align: 'right' })
  }

  return doc
}
