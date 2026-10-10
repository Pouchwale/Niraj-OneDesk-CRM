/**
 * Draws the Overview report (overview-report.ts) as an A4 landscape PDF in
 * the house letterhead style: logo and title on white, maroon brand accents,
 * a details grid, a highlighted "needs attention" box, then one section per
 * part of the Overview. Tables repeat their header across pages; every page
 * carries a footer with its number.
 */

import type { OverviewReport } from './overview-report'

type RGB = [number, number, number]
// Brand: the logo's maroon and blush.
const BRAND: RGB = [127, 61, 63]
const BLUSH: RGB = [251, 241, 245]
const BLUSH_LINE: RGB = [238, 216, 225]
const INK: RGB = [33, 33, 38]
const MUTED: RGB = [110, 110, 120]
const RULE: RGB = [226, 226, 232]
const LABEL_BG: RGB = [248, 248, 250]
const NOTE_BG: RGB = [255, 248, 225]
const NOTE_LINE: RGB = [240, 214, 140]
const NOTE_INK: RGB = [138, 96, 0]

const pretty = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** The logo as a data URL, read from the site; the report is drawn without it if it can't be loaded. */
export async function loadLogo(url = '/favicon-192.png'): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function downloadOverviewPdf(report: OverviewReport, generatedBy: string): Promise<void> {
  const doc = await renderOverviewPdf(report, generatedBy, await loadLogo())
  doc.save(`OneDesk Overview Report ${report.from} to ${report.to}.pdf`)
}

/** The report as a jsPDF document, not yet saved. */
export async function renderOverviewPdf(report: OverviewReport, generatedBy: string, logo?: string | null) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const period = report.from === report.to ? pretty(report.from) : `${pretty(report.from)} - ${pretty(report.to)}`
  const generatedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  /** A small uppercase maroon label, letter-spaced, with a hairline under it. */
  const sectionLabel = (text: string, y: number) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...BRAND)
    doc.text(text.toUpperCase(), M, y, { charSpace: 0.35 })
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(M, y + 1.8, W - M, y + 1.8)
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
  doc.text('ONEDESK CRM  ·  COLLECTIONS', tx, top + 3.5, { charSpace: 0.4 })
  doc.setFontSize(21)
  doc.setTextColor(...INK)
  doc.text('Overview Report', tx, top + 11.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text('Coordinator activity, Robi tasks, scores and approvals', tx, top + 16.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND)
  doc.text('REPORT PERIOD', W - M, top + 3.5, { align: 'right', charSpace: 0.4 })
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(period, W - M, top + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`Generated ${generatedAt}`, W - M, top + 14.5, { align: 'right' })
  doc.text(`by ${generatedBy}`, W - M, top + 18.5, { align: 'right' })

  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(M, top + 22, W - M, top + 22)

  /* ----- report details: label / value pairs in a grid ----- */
  let y = top + 30
  sectionLabel('Report details', y)
  const pairs = report.details
  const rows: string[][] = []
  for (let i = 0; i < pairs.length; i += 2) {
    rows.push([pairs[i].label, pairs[i].value, pairs[i + 1]?.label ?? '', pairs[i + 1]?.value ?? ''])
  }
  autoTable(doc, {
    startY: y + 4,
    body: rows,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: RULE, lineWidth: 0.15 },
    columnStyles: {
      0: { fillColor: LABEL_BG, textColor: MUTED, cellWidth: 48 },
      1: { fontStyle: 'bold' },
      2: { fillColor: LABEL_BG, textColor: MUTED, cellWidth: 48 },
      3: { fontStyle: 'bold' },
    },
  })
  y = lastY() + 9

  /* ----- at a glance: blush tiles ----- */
  sectionLabel('At a glance', y)
  y += 5
  const cols = 4
  const gap = 4
  const boxW = (W - 2 * M - gap * (cols - 1)) / cols
  const boxH = 16
  report.kpis.forEach((k, i) => {
    const x = M + (i % cols) * (boxW + gap)
    const t = y + Math.floor(i / cols) * (boxH + gap)
    doc.setFillColor(...BLUSH)
    doc.setDrawColor(...BLUSH_LINE)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, t, boxW, boxH, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(k.label.toUpperCase(), x + 3.5, t + 5.5, { charSpace: 0.2 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...BRAND)
    doc.text(doc.splitTextToSize(k.value, boxW - 7)[0], x + 3.5, t + 12)
  })
  y += Math.ceil(report.kpis.length / cols) * (boxH + gap) + 5

  /* ----- needs attention: the highlighted box ----- */
  if (report.alerts.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const lines = report.alerts.flatMap((a) => doc.splitTextToSize(`-  ${a}`, W - 2 * M - 10) as string[])
    const boxH2 = lines.length * 3.6 + 5.5
    if (y + boxH2 + 6 > H - 16) {
      doc.addPage()
      y = 20
    }
    sectionLabel('Needs attention', y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setFillColor(...NOTE_BG)
    doc.setDrawColor(...NOTE_LINE)
    doc.setLineWidth(0.3)
    doc.roundedRect(M, y, W - 2 * M, boxH2, 1.5, 1.5, 'FD')
    doc.setTextColor(...NOTE_INK)
    doc.text(lines, M + 5, y + 5.5)
    y += boxH2 + 9
  }

  /* ----- sections ----- */
  for (const table of report.tables) {
    // Keep a heading with at least a few rows of its table.
    if (y > H - 42) {
      doc.addPage()
      y = 20
    }
    sectionLabel(table.title, y)
    y += 4
    if (table.note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      doc.setTextColor(...MUTED)
      const lines = doc.splitTextToSize(table.note, W - 2 * M)
      doc.text(lines, M, y + 2.5)
      y += lines.length * 3.4 + 1.5
    }

    if (table.rows.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
      doc.text('Nothing recorded in this period.', M, y + 4)
      y += 13
      continue
    }

    const styles: Record<number, { halign?: 'right'; cellWidth?: number }> = {}
    for (const i of table.numeric ?? []) styles[i] = { halign: 'right' }
    for (const [i, w] of Object.entries(table.widths ?? {})) styles[Number(i)] = { ...styles[Number(i)], cellWidth: w }
    autoTable(doc, {
      startY: y + 1,
      head: [table.head],
      body: table.rows.map((r) => r.map((c) => String(c))),
      margin: { left: M, right: M, top: 18, bottom: 16 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, textColor: INK, lineColor: RULE, lineWidth: 0.15, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: BLUSH, textColor: BRAND, fontStyle: 'bold', fontSize: 7.5, lineColor: BLUSH_LINE },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: styles,
      showHead: 'everyPage',
    })
    y = lastY() + 10
  }

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
      doc.text('Overview Report', logo ? M + 8 : M, 10.3)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text(period, W - M, 10.3, { align: 'right' })
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
    doc.text(`OneDesk CRM  ·  Overview report  ·  Generated ${generatedAt}  ·  Internal, for management use`, M, H - 6)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 6, { align: 'right' })
  }

  return doc
}
