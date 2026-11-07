/**
 * The OTIF week as a PDF report (7 Nov 2026: the user asked for a clear PDF
 * report in place of the Excel download). A4 landscape in the house
 * letterhead style of the Overview report (companies/overview-report-pdf.ts):
 * logo and title, the week (Saturday to Friday) and what places an order in
 * it, the filters and the source file, the four figures, then delay buckets,
 * departments, Relation Managers and the last 8 weeks, and finally every
 * order with the team's fields. Tables repeat their header across pages;
 * every page carries a footer with its number.
 *
 * The figures are the ones on screen, handed over as they are: nothing is
 * worked out again here.
 */

import type { RowInput } from 'jspdf-autotable'

import { loadLogo } from '@/features/companies/overview-report-pdf'
import type { OtifSummary } from '@/lib/demo-data'
import { OTIF_LIVE_COLUMNS, type ManagerLine, type OtifLiveRow } from '@/lib/otif-live'

export interface OtifReportInput {
  /** The Saturday that starts the week, and the Friday that ends it (yyyy-mm-dd). */
  weekStart: string
  weekEnd: string
  /** Which date places an order in the week: "PO Closed Date", "PO Due Date" or "SO Date". */
  basisLabel: string
  filters: { department: string | null; relationManager: string | null; bucket: string | null }
  file: { name: string; sheet: string; savedAt: string | null; orders: number }
  /** The week's orders with the filters applied, in the screen's order. */
  rows: readonly OtifLiveRow[]
  summary: OtifSummary
  buckets: readonly { bucket: string; count: number; percentage: number }[]
  managers: readonly ManagerLine[]
  trend: readonly { start: string; total: number; yes: number; pct: number | null }[]
  generatedBy: string
}

type RGB = [number, number, number]
// The Overview report's palette: the logo's maroon and blush.
const BRAND: RGB = [127, 61, 63]
const BLUSH: RGB = [251, 241, 245]
const BLUSH_LINE: RGB = [238, 216, 225]
const INK: RGB = [33, 33, 38]
const MUTED: RGB = [110, 110, 120]
const RULE: RGB = [226, 226, 232]
const LABEL_BG: RGB = [248, 248, 250]
const GOOD: RGB = [5, 150, 105]
const WARN: RGB = [217, 119, 6]
const BAD: RGB = [225, 29, 72]
const BAR_BG: RGB = [238, 238, 242]
/** The delay buckets in the on-screen chart's colours (DelayBucketChart). */
const BUCKET_COLOURS: Record<string, RGB> = {
  'On-Time / Early': [52, 211, 153],
  '1-3 Days Late': [251, 191, 36],
  '4-7 Days Late': [251, 146, 60],
  '8-10 Days Late': [248, 113, 113],
  '10+ Days Late': [225, 29, 72],
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "06 Nov 2026" from yyyy-mm-dd; "-" when there is none. */
export const pdfDate = (day: string | null) => (day ? `${day.slice(8, 10)} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}` : '-')

/** "74.2%" */
export const pdfPct = (v: number | null) => (v === null ? '-' : `${v.toFixed(1)}%`)

/** The OTIF score's colour, as on screen: above 85% green, above 70% amber, else red. */
export const pctColour = (v: number | null): RGB => (v === null ? MUTED : v > 85 ? GOOD : v > 70 ? WARN : BAD)

/** One order as the report's table row, in the team's column order. */
export function orderCells(r: OtifLiveRow): string[] {
  return [
    r.poNo,
    r.soNo ?? '-',
    pdfDate(r.soDate),
    pdfDate(r.poDueDate),
    r.poClosedDate ? pdfDate(r.poClosedDate) : 'Open',
    r.delayDays === null ? '-' : r.delayDays > 0 ? `+${r.delayDays}` : String(r.delayDays),
    r.dayCommitted === null ? '-' : String(r.dayCommitted),
    r.customerName ?? '-',
    r.openOrderQty === null ? '-' : r.openOrderQty.toLocaleString('en-IN'),
    r.otifScore ?? '-',
    r.relationManager ?? '-',
    r.department ?? '-',
  ]
}

/** "OTIF report 2026-10-31 to 2026-11-06.pdf" */
export const otifReportFileName = (weekStart: string, weekEnd: string) => `OTIF report ${weekStart} to ${weekEnd}.pdf`

/** The report details, as label / value pairs. */
export function reportDetails(input: Pick<OtifReportInput, 'weekStart' | 'weekEnd' | 'basisLabel' | 'filters' | 'file'>): [string, string][] {
  const saved = input.file.savedAt
    ? new Date(input.file.savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'unknown'
  return [
    ['Week (Saturday to Friday)', `${pdfDate(input.weekStart)} to ${pdfDate(input.weekEnd)}`],
    ['Orders counted by', input.basisLabel],
    ['Department', input.filters.department ?? 'All departments'],
    ['Relation Manager', input.filters.relationManager ?? 'Everyone'],
    ['Delay', input.filters.bucket ?? 'All orders'],
    ['Source file', `${input.file.name} (sheet ${input.file.sheet}), saved ${saved}`],
  ]
}

export async function downloadOtifPdf(input: OtifReportInput): Promise<void> {
  const doc = await renderOtifPdf(input, await loadLogo())
  doc.save(otifReportFileName(input.weekStart, input.weekEnd))
}

/** The report as a jsPDF document, not yet saved. */
export async function renderOtifPdf(input: OtifReportInput, logo?: string | null) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const GAP = 9
  const COL = (W - 2 * M - GAP) / 2
  const week = `${pdfDate(input.weekStart)} to ${pdfDate(input.weekEnd)}`
  const generatedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const s = input.summary

  /** A small uppercase maroon label with a hairline under it, across `width` from `x`. */
  const sectionLabel = (text: string, x: number, y: number, width = W - 2 * M) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...BRAND)
    doc.text(text.toUpperCase(), x, y, { charSpace: 0.35 })
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(x, y + 1.8, x + width, y + 1.8)
  }
  const tableStyle = {
    theme: 'grid' as const,
    styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.9, textColor: INK, lineColor: RULE, lineWidth: 0.15, overflow: 'linebreak' as const, valign: 'middle' as const },
    headStyles: { fillColor: BLUSH, textColor: BRAND, fontStyle: 'bold' as const, fontSize: 7.6, lineColor: BLUSH_LINE },
    alternateRowStyles: { fillColor: [252, 252, 253] as RGB },
  }
  /** A bar in a table cell, `share` of its width (0-100), in `colour`. */
  const bar = (cell: { x: number; y: number; width: number; height: number }, share: number, colour: RGB) => {
    const w = cell.width - 4
    const h = 2.4
    const x = cell.x + 2
    const y = cell.y + (cell.height - h) / 2
    doc.setFillColor(...BAR_BG)
    doc.rect(x, y, w, h, 'F')
    if (share > 0) {
      doc.setFillColor(...colour)
      doc.rect(x, y, (w * Math.min(100, share)) / 100, h, 'F')
    }
  }

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
  doc.text('ONEDESK CRM  ·  OTIF ANALYTICS', tx, top + 3.5, { charSpace: 0.4 })
  doc.setFontSize(21)
  doc.setTextColor(...INK)
  doc.text('OTIF Delivery Report', tx, top + 11.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text('On-time in-full delivery for one week, Saturday to Friday, from the OTIF-SCORE file', tx, top + 16.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND)
  doc.text('REPORT WEEK', W - M, top + 3.5, { align: 'right', charSpace: 0.4 })
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(week, W - M, top + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`Generated ${generatedAt}`, W - M, top + 14.5, { align: 'right' })
  doc.text(`by ${input.generatedBy}`, W - M, top + 18.5, { align: 'right' })

  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(M, top + 22, W - M, top + 22)

  /* ----- report details ----- */
  let y = top + 30
  sectionLabel('Report details', M, y)
  const details = reportDetails(input)
  const detailRows: string[][] = []
  for (let i = 0; i < details.length; i += 2) detailRows.push([details[i][0], details[i][1], details[i + 1]?.[0] ?? '', details[i + 1]?.[1] ?? ''])
  autoTable(doc, {
    startY: y + 4,
    body: detailRows,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: RULE, lineWidth: 0.15 },
    columnStyles: {
      0: { fillColor: LABEL_BG, textColor: MUTED, cellWidth: 44 },
      1: { fontStyle: 'bold' },
      2: { fillColor: LABEL_BG, textColor: MUTED, cellWidth: 44 },
      3: { fontStyle: 'bold' },
    },
  })
  y = lastY() + 9

  /* ----- at a glance ----- */
  sectionLabel('At a glance', M, y)
  y += 5
  const tiles: { label: string; value: string; colour: RGB }[] = [
    { label: 'OTIF score', value: pdfPct(s.totalPOs ? s.otifPercentage : null), colour: pctColour(s.totalPOs ? s.otifPercentage : null) },
    { label: 'Total POs', value: s.totalPOs.toLocaleString('en-IN'), colour: BRAND },
    { label: 'On time and in full (OTIF YES)', value: s.onTimeCount.toLocaleString('en-IN'), colour: GOOD },
    { label: 'Not OTIF (OTIF NO)', value: s.lateCount.toLocaleString('en-IN'), colour: BAD },
  ]
  const boxW = (W - 2 * M - 3 * 4) / 4
  tiles.forEach((t, i) => {
    const x = M + i * (boxW + 4)
    doc.setFillColor(...BLUSH)
    doc.setDrawColor(...BLUSH_LINE)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, boxW, 17, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(t.label.toUpperCase(), x + 3.5, y + 5.5, { charSpace: 0.2 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...t.colour)
    doc.text(t.value, x + 3.5, y + 13.2)
  })
  y += 17 + 4.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  doc.setTextColor(...MUTED)
  doc.text('OTIF % = orders the sheet marks OTIF Score YES / all orders in the week. Late = the orders marked NO.', M, y)
  y += 8

  /** Two tables side by side under their labels; returns the y below the taller one. */
  const pair = (
    left: { title: string; head: string[]; body: RowInput[]; draw?: (col: number, row: number, cell: { x: number; y: number; width: number; height: number }) => void; paint?: (col: number, row: number) => RGB | null; widths?: Record<number, number> },
    right: typeof left,
    startY: number
  ) => {
    let y0 = startY
    // Keep the two tables together: a pair that would not fit below goes to the next page whole.
    const rowsTall = Math.max(left.body.length, right.body.length, 1)
    const needed = 4 + 7.5 + rowsTall * 6.9
    if (y0 + needed > H - 16 && y0 > 30) {
      doc.addPage()
      y0 = 22
    }
    const ends: number[] = []
    ;[left, right].forEach((t, i) => {
      const x = i === 0 ? M : M + COL + GAP
      sectionLabel(t.title, x, y0, COL)
      const columnStyles: Record<number, { halign?: 'right'; cellWidth?: number }> = {}
      t.head.forEach((_, c) => {
        if (c > 0) columnStyles[c] = { halign: 'right' }
      })
      for (const [c, w] of Object.entries(t.widths ?? {})) columnStyles[Number(c)] = { ...columnStyles[Number(c)], cellWidth: w }
      autoTable(doc, {
        ...tableStyle,
        startY: y0 + 4,
        head: [t.head],
        body: t.body.length ? t.body : [[{ content: 'Nothing in this week.', colSpan: t.head.length, styles: { textColor: MUTED, fontStyle: 'italic', halign: 'left' } }]],
        margin: { left: x, right: i === 0 ? W - M - COL : M, top: 22, bottom: 16 },
        tableWidth: COL,
        columnStyles,
        didParseCell: (data) => {
          if (data.section !== 'body' || !t.paint || !t.body.length) return
          const colour = t.paint(data.column.index, data.row.index)
          if (colour) {
            data.cell.styles.textColor = colour
            data.cell.styles.fontStyle = 'bold'
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && t.draw && t.body.length) t.draw(data.column.index, data.row.index, data.cell)
        },
      })
      ends.push(lastY())
    })
    return Math.max(...ends) + 9
  }

  /* ----- delay buckets and departments ----- */
  const departments = Object.entries(s.byCategory).sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
  y = pair(
    {
      title: 'Delay buckets',
      head: ['Delay', 'Orders', 'Share', ''],
      body: input.buckets.map((b) => [b.bucket, b.count.toLocaleString('en-IN'), pdfPct(s.totalPOs ? b.percentage : null), '']),
      widths: { 3: 40 },
      draw: (col, row, cell) => {
        if (col === 3) bar(cell, input.buckets[row].percentage, BUCKET_COLOURS[input.buckets[row].bucket] ?? MUTED)
      },
    },
    {
      title: 'Departments',
      head: ['Department', 'Orders', 'OTIF YES', 'OTIF NO', 'OTIF %'],
      body: departments.map(([name, d]) => [name, String(d.total), String(d.onTime), String(d.total - d.onTime), pdfPct(d.pct)]),
      paint: (col, row) => (col === 4 ? pctColour(departments[row][1].pct) : null),
    },
    y
  )

  /* ----- Relation Managers and the last 8 weeks ----- */
  y = pair(
    {
      title: 'By Relation Manager',
      head: ['Relation Manager', 'Orders', 'OTIF YES', 'OTIF NO', 'OTIF %'],
      body: input.managers.map((m) => [m.name, String(m.total), String(m.yes), String(m.no), pdfPct(m.pct)]),
      paint: (col, row) => (col === 4 ? pctColour(input.managers[row].pct) : null),
    },
    {
      title: `Last ${input.trend.length} weeks (by ${input.basisLabel})`,
      head: ['Week (Saturday to Friday)', 'Orders', 'OTIF YES', 'OTIF %', ''],
      body: input.trend.map((t) => {
        const end = new Date(Date.parse(`${t.start}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10)
        return [`${pdfDate(t.start)} to ${pdfDate(end)}`, String(t.total), String(t.yes), pdfPct(t.pct), '']
      }),
      widths: { 0: 52, 4: 26 },
      paint: (col, row) => (col === 3 ? pctColour(input.trend[row].pct) : null),
      draw: (col, row, cell) => {
        if (col === 4) bar(cell, input.trend[row].pct ?? 0, pctColour(input.trend[row].pct))
      },
    },
    y
  )

  /* ----- every order: right below the summary when there is room for a good part of a page, else on a page of its own ----- */
  if (y > H - 16 - 55) {
    doc.addPage()
    y = 22
  }
  sectionLabel(`Orders in the week (${input.rows.length.toLocaleString('en-IN')})`, M, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  doc.setTextColor(...MUTED)
  doc.text(`Placed in the week by ${input.basisLabel}. Delay Day: negative is early. PO Closed Date "Open": the order is not closed yet.`, M, y + 5.5)
  const widths = [16, 15, 21, 21, 23, 14, 16, 0, 19, 15, 27, 25]
  const orderStyles: Record<number, { cellWidth?: number; halign?: 'right' | 'center' }> = {}
  widths.forEach((w, i) => {
    if (w) orderStyles[i] = { cellWidth: w }
  })
  for (const i of [5, 6, 8]) orderStyles[i] = { ...orderStyles[i], halign: 'right' }
  orderStyles[9] = { ...orderStyles[9], halign: 'center' }
  autoTable(doc, {
    ...tableStyle,
    styles: { ...tableStyle.styles, fontSize: 7.3, cellPadding: 1.6, valign: 'top' },
    headStyles: { ...tableStyle.headStyles, fontSize: 7.2 },
    startY: y + 9,
    head: [OTIF_LIVE_COLUMNS.map((c) => c.label)],
    body: input.rows.length ? input.rows.map(orderCells) : [[{ content: 'No orders in this week.', colSpan: 12, styles: { textColor: MUTED, fontStyle: 'italic' } }]],
    margin: { left: M, right: M, top: 22, bottom: 16 },
    columnStyles: orderStyles,
    showHead: 'everyPage',
    didParseCell: (data) => {
      if (data.section !== 'body' || !input.rows.length) return
      const r = input.rows[data.row.index]
      if (data.column.index === 9 && r.otifScore) {
        data.cell.styles.textColor = r.otifScore === 'YES' ? GOOD : BAD
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index === 5 && r.delayDays !== null) {
        data.cell.styles.textColor = r.delayDays <= 0 ? GOOD : r.delayDays <= 7 ? WARN : BAD
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index === 4 && !r.poClosedDate) data.cell.styles.textColor = WARN
    },
  })

  /* ----- running header (pages 2+) and footer (every page) ----- */
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) {
      if (logo) {
        try {
          doc.addImage(logo, 'PNG', M, 6, 6, 6)
        } catch {
          /* no logo */
        }
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...INK)
      doc.text('OTIF Delivery Report', logo ? M + 8 : M, 10.3)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text(`Week ${week}  ·  by ${input.basisLabel}`, W - M, 10.3, { align: 'right' })
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
    doc.text(`OneDesk CRM  ·  OTIF report  ·  Week ${week}  ·  Generated ${generatedAt}  ·  Internal, for management use`, M, H - 6)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 6, { align: 'right' })
  }

  return doc
}
