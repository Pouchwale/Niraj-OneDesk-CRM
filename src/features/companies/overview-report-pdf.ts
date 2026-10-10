/**
 * Draws the Overview report (overview-report.ts) as an A4 landscape PDF:
 * a title band with the period, the headline figures, then one section per
 * part of the Overview, each table repeating its header across pages, and
 * page numbers in the footer.
 */

import type { OverviewReport } from './overview-report'

const INK: [number, number, number] = [23, 34, 31]
const MUTED: [number, number, number] = [91, 103, 99]
const ACCENT: [number, number, number] = [31, 107, 82]
const SOFT: [number, number, number] = [229, 240, 235]
const STRIPE: [number, number, number] = [246, 248, 247]

const pretty = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export async function downloadOverviewPdf(report: OverviewReport, generatedBy: string): Promise<void> {
  const doc = await renderOverviewPdf(report, generatedBy)
  doc.save(`OneDesk Overview Report ${report.from} to ${report.to}.pdf`)
}

/** The report as a jsPDF document, not yet saved. */
export async function renderOverviewPdf(report: OverviewReport, generatedBy: string) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  const period = report.from === report.to ? pretty(report.from) : `${pretty(report.from)} to ${pretty(report.to)}`

  /* ----- title band ----- */
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, W, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('OneDesk CRM - Overview Report', M, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Period: ${period}`, M, 19)
  const stamp = `Generated ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} by ${generatedBy}`
  doc.text(stamp, W - M, 19, { align: 'right' })

  /* ----- headline figures: two rows of four ----- */
  let y = 32
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('At a glance', M, y)
  y += 3
  const cols = 4
  const gap = 4
  const boxW = (W - 2 * M - gap * (cols - 1)) / cols
  const boxH = 15
  report.kpis.forEach((k, i) => {
    const x = M + (i % cols) * (boxW + gap)
    const top = y + Math.floor(i / cols) * (boxH + gap)
    doc.setFillColor(...SOFT)
    doc.roundedRect(x, top, boxW, boxH, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(k.label.toUpperCase(), x + 3, top + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(...INK)
    doc.text(doc.splitTextToSize(k.value, boxW - 6)[0], x + 3, top + 11.5)
  })
  y += Math.ceil(report.kpis.length / cols) * (boxH + gap) + 2

  /* ----- sections ----- */
  for (const table of report.tables) {
    // Keep a heading with at least a few rows of its table.
    if (y > H - 40) {
      doc.addPage()
      y = 16
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...ACCENT)
    doc.text(table.title, M, y)
    doc.setDrawColor(...ACCENT)
    doc.setLineWidth(0.4)
    doc.line(M, y + 1.5, W - M, y + 1.5)
    y += 5
    if (table.note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      const lines = doc.splitTextToSize(table.note, W - 2 * M)
      doc.text(lines, M, y + 1)
      y += lines.length * 3.4 + 1
    }

    if (table.rows.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...MUTED)
      doc.text('Nothing in this period.', M, y + 3)
      y += 11
      continue
    }

    const align: Record<number, { halign?: 'right'; cellWidth?: number }> = {}
    for (const i of table.numeric ?? []) align[i] = { halign: 'right' }
    for (const [i, w] of Object.entries(table.widths ?? {})) align[Number(i)] = { ...align[Number(i)], cellWidth: w }
    autoTable(doc, {
      startY: y,
      head: [table.head],
      body: table.rows.map((r) => r.map((c) => String(c))),
      margin: { left: M, right: M, top: 16, bottom: 14 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, textColor: INK, lineColor: [221, 226, 223], lineWidth: 0.1, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: STRIPE },
      columnStyles: align,
      showHead: 'everyPage',
      didDrawPage: () => {
        // A slim running header on continuation pages.
        if (doc.getCurrentPageInfo().pageNumber > 1) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(...MUTED)
          doc.text(`OneDesk CRM - Overview Report - ${period}`, M, 9)
        }
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9
  }

  /* ----- footers ----- */
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(221, 226, 223)
    doc.setLineWidth(0.2)
    doc.line(M, H - 9, W - M, H - 9)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text('Internal - for management use. Figures as recorded in OneDesk CRM.', M, H - 5)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 5, { align: 'right' })
  }

  return doc
}
