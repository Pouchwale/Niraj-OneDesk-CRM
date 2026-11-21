/**
 * The customer's invoice table as a PDF for WhatsApp (21 Nov 2026). A WhatsApp
 * link can carry only typed text, so "Send on WhatsApp" downloads this and
 * opens the chat for the coordinator to attach it. Same lines, columns and
 * figures as the table in the email; the header repeats on every page.
 */

import type { jsPDF as JsPdf } from 'jspdf'
import type autoTableFn from 'jspdf-autotable'
import type { RowInput } from 'jspdf-autotable'

import type { CustomerAccount } from './customer-accounts'
import { invoiceTableRows, invoiceTableTitle, statementAmount } from './customer-statement'
import { todayISO } from './utils'

export interface PdfTools {
  jsPDF: typeof JsPdf
  autoTable: typeof autoTableFn
}

/** Loaded when the reminder opens, so the download can happen inside the click. */
export async function loadPdfTools(): Promise<PdfTools> {
  const [{ jsPDF }, table] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable: table.default }
}

export function invoicePdfFileName(customer: CustomerAccount, today: string = todayISO()): string {
  const name = customer.name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70)
  return `Invoices - ${name} - ${today}.pdf`
}

export function buildInvoiceTablePdf(customer: CustomerAccount, tools: PdfTools, today: string = todayISO()): JsPdf {
  const doc = new tools.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const black: [number, number, number] = [0, 0, 0]
  const white: [number, number, number] = [255, 255, 255]
  const total = { fontStyle: 'bold' as const }
  const totalAmount = { fontStyle: 'bold' as const, halign: 'right' as const }
  const body: RowInput[] = [
    ...invoiceTableRows(customer, today),
    [
      { content: 'Total', colSpan: 4, styles: total },
      { content: statementAmount(customer.totalAmount), styles: totalAmount },
      { content: statementAmount(customer.outstanding), styles: totalAmount },
    ],
    ...(customer.overdue > 0
      ? [[
          { content: 'Total Overdue', colSpan: 5, styles: total },
          { content: statementAmount(customer.overdue), styles: totalAmount },
        ]]
      : []),
  ]
  tools.autoTable(doc, {
    startY: 12,
    margin: { top: 12, right: 12, bottom: 12, left: 12 },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    head: [
      [{ content: invoiceTableTitle(customer.name), colSpan: 6, styles: { halign: 'center', fontSize: 11 } }],
      ['Ref No.', 'Date', 'Due on', 'Overdue\nby days', 'Gross Amount', 'Pending Amount'],
    ],
    body,
    styles: { font: 'helvetica', fontSize: 9.5, textColor: black, fillColor: white, lineColor: black, lineWidth: 0.2, cellPadding: 1.2, valign: 'top' },
    headStyles: { fillColor: white, textColor: black, fontStyle: 'normal', lineColor: black, lineWidth: 0.2 },
    columnStyles: { 1: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  })
  return doc
}
