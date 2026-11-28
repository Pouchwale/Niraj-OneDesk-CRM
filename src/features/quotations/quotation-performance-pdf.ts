/**
 * Quotation Follow-up → Performance as one PDF (28 Nov 2026, the user: "everything
 * downloadable — quotation won, converted, which coordinator, which customer and
 * everything about the performance"). For the filters on screen:
 *
 *   1. Conversions and score — the three tiles and a line per coordinator
 *   2. Performance — win rate, value won, average order, days to close, …, and
 *      a line per coordinator (quotations, won, lost, open, win rate, value…)
 *   3. Month by month — quotations by status and value won
 *   4. Won (converted) — every deal: coordinator, customer, quotation, type, dates, value
 *   5. Lost — every lost quotation with its remark
 *   6. Open — every quotation still waiting
 *   7. Customer by customer — who handles them, open / won / lost, value won,
 *      follow-ups and the last time (and what) they were talked to
 *
 * It is handed the same numbers the screen shows (src/lib/quotation-stats.ts),
 * so the two cannot disagree. A4 landscape, in the house letterhead.
 */

import { minusFixed } from '@/lib/minus-score'
import type { ConversionSummary, QuotationPerformance } from '@/lib/quotation-stats'
import type { Quotation } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { loadLogo } from '@/features/companies/overview-report-pdf'
import { conversionCells, conversionTiles, drawLetterhead, drawPageChrome, pdfText, PDF_COLOURS } from './quotation-conversions-pdf'

const { BRAND, BLUSH, BLUSH_LINE, INK, MUTED, RULE } = PDF_COLOURS
const TITLE = 'Quotation Performance'

export interface PerformancePdfInput {
  period: string
  who: string
  filters: string[]
  generatedBy: string
  today: string
  conversions: { team: ConversionSummary; people: { name: string; summary: ConversionSummary }[] }
  performance: { team: QuotationPerformance; people: { name: string; performance: QuotationPerformance }[] }
  months: { month: string; open: number; closed: number; lost: number; valueWon: number }[]
  won: Quotation[]
  lost: Quotation[]
  open: Quotation[]
  /** Whose quotation it is, as the list shows it. */
  nameOf: (q: Quotation) => string
}

const n = (v: number) => v.toLocaleString('en-IN')
const money = (v: number | null | undefined) => (v ? pdfText(formatCurrency(v)) : '-')
const day = (d: string | null | undefined) => (d ? formatDate(d) : '-')
const typeOf = (q: Quotation) => (q.customer_type === 'new' ? 'New' : q.customer_type === 'existing' ? 'Existing' : '-')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`

/** A coordinator line of the performance table, in the screen's column order. */
export const performanceCells = (name: string, p: QuotationPerformance): string[] => [
  name,
  n(p.quotations),
  n(p.closed),
  n(p.lost),
  n(p.open),
  p.winRate === null ? '-' : `${p.winRate}%`,
  money(p.valueWon),
  money(p.averageOrder),
  p.averageDaysToClose === null ? '-' : `${p.averageDaysToClose} d`,
]

/** One customer's line (28 Nov 2026, the user: "which customer open, closed, talked … customer wise, with which coordinator"). */
export interface CustomerLine {
  customer: string
  coordinators: string
  quotations: number
  open: number
  won: number
  lost: number
  valueWon: number
  followups: number
  lastTalked: string | null
  lastNote: string | null
  /** Each quotation: number and where it stands. */
  list: string
}

const STATUS_WORD: Record<Quotation['status'], string> = { open: 'open', closed: 'won', lost: 'lost' }
const customerKey = (name: string) => name.toLowerCase().replace(/\bprivate\b/g, 'pvt').replace(/\blimited\b/g, 'ltd').replace(/[^a-z0-9]/g, '')

/** Every customer in the report, with their coordinators, counts, value won and the last time they were talked to. */
export function customerLines(quotations: readonly Quotation[], nameOf: (q: Quotation) => string): CustomerLine[] {
  const groups = new Map<string, Quotation[]>()
  for (const q of quotations) {
    const key = customerKey(q.customer_name) || q.customer_name
    groups.set(key, [...(groups.get(key) ?? []), q])
  }
  return [...groups.values()]
    .map((qs) => {
      const followups = qs.flatMap((q) => q.followups ?? []).sort((a, b) => a.at.localeCompare(b.at))
      const last = followups[followups.length - 1] ?? null
      return {
        customer: qs[0].customer_name,
        coordinators: [...new Set(qs.map(nameOf))].sort().join(', '),
        quotations: qs.length,
        open: qs.filter((q) => q.status === 'open').length,
        won: qs.filter((q) => q.status === 'closed').length,
        lost: qs.filter((q) => q.status === 'lost').length,
        valueWon: qs.filter((q) => q.status === 'closed').reduce((a, q) => a + (q.amount ?? 0), 0),
        followups: followups.length + qs.reduce((a, q) => a + (q.earlier_followups ?? 0), 0),
        lastTalked: last ? last.at.slice(0, 10) : null,
        lastNote: last?.note?.trim() || null,
        list: qs.map((q) => `${q.quotation_no ?? '-'} ${STATUS_WORD[q.status]}`).join(', '),
      }
    })
    .sort((a, b) => a.coordinators.localeCompare(b.coordinators) || b.valueWon - a.valueWon || a.customer.localeCompare(b.customer))
}

export async function downloadPerformancePdf(input: PerformancePdfInput): Promise<void> {
  const doc = await renderPerformancePdf(input, await loadLogo())
  doc.save(`Quotation Performance ${input.today}.pdf`)
}

export async function renderPerformancePdf(input: PerformancePdfInput, logo?: string | null) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const generatedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  let y = drawLetterhead(doc, { title: TITLE, who: input.who, period: input.period, generatedBy: input.generatedBy, generatedAt, logo })

  if (input.filters.length) {
    doc.setFontSize(8.5)
    doc.setTextColor(...INK)
    const lines = doc.splitTextToSize(`Filters applied: ${input.filters.map(pdfText).join('  ·  ')}`, W - 2 * M) as string[]
    doc.text(lines, M, y)
    y += lines.length * 3.8 + 1.5
  }

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  /** A section heading; starts a new page when there is too little room left. */
  const section = (title: string, note?: string, room = 30) => {
    if (y + room > H - 14) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...BRAND)
    doc.text(pdfText(title), M, y)
    if (note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      doc.setTextColor(...MUTED)
      doc.text(pdfText(note), M, y + 4)
    }
    y += note ? 7 : 4
  }
  const table = (head: string[], body: string[][], options: { foot?: string[]; leftCols?: number[]; widths?: Record<number, number>; empty?: string } = {}) => {
    if (!body.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
      doc.text(pdfText(options.empty ?? 'Nothing here for these filters.'), M, y + 3)
      y += 9
      return
    }
    const columnStyles: Record<number, Record<string, unknown>> = {}
    for (const c of options.leftCols ?? [0]) columnStyles[c] = { halign: 'left' }
    for (const [c, w] of Object.entries(options.widths ?? {})) columnStyles[Number(c)] = { ...(columnStyles[Number(c)] ?? {}), cellWidth: w }
    autoTable(doc, {
      startY: y,
      head: [head.map((content, i) => ({ content: pdfText(content), styles: { halign: (options.leftCols ?? [0]).includes(i) ? ('left' as const) : ('right' as const) } }))],
      body: body.map((r) => r.map(pdfText)),
      ...(options.foot ? { foot: [options.foot.map(pdfText)] } : {}),
      margin: { left: M, right: M, top: 18, bottom: 16 },
      theme: 'grid',
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: INK, lineColor: RULE, lineWidth: 0.15, halign: 'right', valign: 'middle' },
      headStyles: { fillColor: BLUSH, textColor: BRAND, fontStyle: 'bold', fontSize: 7.8, lineColor: BLUSH_LINE },
      footStyles: { fillColor: BLUSH, textColor: INK, fontStyle: 'bold', lineColor: BLUSH_LINE },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles,
      showHead: 'everyPage',
      showFoot: 'lastPage',
    })
    y = lastY() + 7
  }

  /* ----- 1. Conversions and score ----- */
  section('Conversions and score', undefined, 50)
  const gap = 4
  const tileW = (W - 2 * M - gap * 2) / 3
  const tileH = 30
  conversionTiles(input.conversions.team).forEach((tile, i) => {
    const x = M + i * (tileW + gap)
    doc.setFillColor(...BLUSH)
    doc.setDrawColor(...BLUSH_LINE)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, tileW, tileH, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.6)
    doc.setTextColor(...MUTED)
    doc.text(tile.label.toUpperCase(), x + 4, y + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...BRAND)
    doc.text(tile.total, x + 4, y + 11.5)
    if (tile.hint) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.4)
      doc.setTextColor(...MUTED)
      doc.text(tile.hint, x + 4, y + 15.5)
    }
    tile.split.forEach(([name, value], k) => {
      const sx = x + 4 + (k * (tileW - 8)) / 2
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.4)
      doc.setTextColor(...MUTED)
      doc.text(name, sx, y + 21)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(...INK)
      doc.text(value, sx, y + 26)
    })
  })
  y += tileH + 5
  if (input.conversions.people.length) {
    table(
      ['Coordinator', 'Total quotations', 'Conversions', 'New', 'Existing', 'Total amount', 'Points', 'Customers', 'Avg score'],
      input.conversions.people.map((p) => conversionCells(p.name, p.summary)),
      { foot: conversionCells('Team', input.conversions.team), widths: { 0: 48 } }
    )
  }

  /* ----- 2. Performance ----- */
  const t = input.performance.team
  section('Performance', 'Win rate = won out of decided (won + lost). Value won = order value of won quotations.', 40)
  table(
    ['Win rate', 'Won', 'Lost', 'Open', 'Value won', 'Orders with a value', 'Average order', 'Days to close (sent to won)', 'Follow-ups per quotation', 'New customers'],
    [[t.winRate === null ? '-' : `${t.winRate}%`, n(t.closed), n(t.lost), n(t.open), money(t.valueWon), n(t.valued), money(t.averageOrder), t.averageDaysToClose === null ? '-' : `${t.averageDaysToClose} days`, t.averageFollowups === null ? '-' : String(t.averageFollowups), `${n(t.newCustomers)} of ${n(t.quotations)}`]],
    { leftCols: [] }
  )
  if (input.performance.people.length) {
    table(
      ['Coordinator', 'Quotations', 'Won', 'Lost', 'Open', 'Win rate', 'Value won', 'Avg order', 'Days to close'],
      input.performance.people.map((p) => performanceCells(p.name, p.performance)),
      { foot: performanceCells('Team', t), widths: { 0: 48 } }
    )
  }

  /* ----- 3. Month by month ----- */
  section('Month by month', 'Open ones by quotation date; won and lost ones by closing date. Older quotations with no date are not in this table (as on the screen\'s chart).')
  table(
    ['Month', 'Won', 'Open', 'Lost', 'Total', 'Value won'],
    input.months.map((m) => [monthName(m.month), n(m.closed), n(m.open), n(m.lost), n(m.closed + m.open + m.lost), money(m.valueWon)]),
    {
      foot: ['Total', ...(['closed', 'open', 'lost'] as const).map((k) => n(input.months.reduce((a, m) => a + m[k], 0))), n(input.months.reduce((a, m) => a + m.closed + m.open + m.lost, 0)), money(input.months.reduce((a, m) => a + m.valueWon, 0))],
    }
  )

  /* ----- 4. Won (converted) ----- */
  const wonValue = input.won.reduce((a, q) => a + (q.amount ?? 0), 0)
  section(`Won (converted): ${input.won.length} ${input.won.length === 1 ? 'deal' : 'deals'} · ${pdfText(formatCurrency(wonValue))}`)
  table(
    ['Coordinator', 'Customer', 'Quotation no.', 'Customer type', 'Quoted on', 'Closed on', 'Follow-ups', 'Order value'],
    input.won.map((q) => [input.nameOf(q), q.customer_name, q.quotation_no ?? '-', typeOf(q), day(q.quotation_date), day(q.closing_date), String((q.followups?.length ?? 0) + (q.earlier_followups ?? 0)), money(q.amount)]),
    { leftCols: [0, 1, 2, 3], widths: { 0: 36, 1: 70 }, foot: ['Total', `${input.won.length} deals`, '', '', '', '', '', money(wonValue)], empty: 'No quotation won with these filters.' }
  )

  /* ----- 5. Lost ----- */
  section(`Lost: ${input.lost.length}`)
  table(
    ['Coordinator', 'Customer', 'Quotation no.', 'Customer type', 'Quoted on', 'Lost on', 'Remark'],
    input.lost.map((q) => [input.nameOf(q), q.customer_name, q.quotation_no ?? '-', typeOf(q), day(q.quotation_date), day(q.closing_date), q.lost_remark ?? '-']),
    { leftCols: [0, 1, 2, 3, 6], widths: { 0: 34, 1: 62, 6: 70 }, empty: 'No quotation lost with these filters.' }
  )

  /* ----- 6. Open ----- */
  section(`Open (waiting on the customer): ${input.open.length}`)
  table(
    ['Coordinator', 'Customer', 'Quotation no.', 'Customer type', 'Enquiry', 'Quoted on', 'Follow-ups', 'Days open'],
    input.open.map((q) => {
      const since = q.quotation_date ? Math.max(0, Math.round((Date.now() - new Date(`${q.quotation_date}T00:00:00`).getTime()) / 86_400_000)) : null
      return [input.nameOf(q), q.customer_name, q.quotation_no ?? '-', typeOf(q), day(q.inquiry_date), day(q.quotation_date), String((q.followups?.length ?? 0) + (q.earlier_followups ?? 0)), since === null ? '-' : String(since)]
    }),
    { leftCols: [0, 1, 2, 3], widths: { 0: 36, 1: 76 }, empty: 'No open quotation with these filters.' }
  )

  /* ----- 7. Customer by customer ----- */
  const customers = customerLines([...input.won, ...input.lost, ...input.open], input.nameOf)
  section(`Customer by customer: ${customers.length}`, 'Every customer in this report: who handles them, where their quotations stand, and the last time they were followed up.')
  table(
    ['Customer', 'Coordinator', 'Quotations', 'Open', 'Won', 'Lost', 'Value won', 'Follow-ups', 'Last talked', 'Last follow-up note', 'Quotation no. and status'],
    customers.map((c) => [c.customer, c.coordinators, n(c.quotations), n(c.open), n(c.won), n(c.lost), money(c.valueWon), n(c.followups), day(c.lastTalked), c.lastNote ?? '-', c.list]),
    {
      leftCols: [0, 1, 8, 9, 10],
      widths: { 0: 44, 1: 28, 2: 14, 3: 10, 4: 10, 5: 10, 6: 24, 7: 14, 8: 18, 9: 44 },
      foot: ['Total', `${customers.length} customers`, n(customers.reduce((a, c) => a + c.quotations, 0)), n(customers.reduce((a, c) => a + c.open, 0)), n(customers.reduce((a, c) => a + c.won, 0)), n(customers.reduce((a, c) => a + c.lost, 0)), money(customers.reduce((a, c) => a + c.valueWon, 0)), n(customers.reduce((a, c) => a + c.followups, 0)), '', '', ''],
      empty: 'No customer in this report.',
    }
  )

  /* ----- how it is counted ----- */
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.4)
  const note = doc.splitTextToSize(
    `Counted like the page: total quotations are those quoted in the dates; won (converted), lost and their values are those closed or lost in the dates. Points: Closed + New customer = 100, Closed + Existing = 50, else 0; Avg score = points / different customers quoted, shown in minus scoring (0 is full marks; ${minusFixed(85, 0)} means 85). Amounts in Rs.`,
    W - 2 * M
  ) as string[]
  if (y + note.length * 3.2 > H - 13) {
    doc.addPage()
    y = 20
  }
  doc.setTextColor(...MUTED)
  doc.text(note, M, y)

  drawPageChrome(doc, TITLE, input.period, generatedAt)
  return doc
}
