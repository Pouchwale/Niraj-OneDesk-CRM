/**
 * The Sales Quotation pages, drawn to the user's sample (Sales_Quotation.pdf,
 * 24 Nov 2026): A4 landscape, every box, line, font size and position taken
 * from that PDF, in points. Fonts are the sample's: Arial Bold for the company
 * name and the charge colons, Calibri for the rest (on the office PCs).
 * Inline styles only, so the same markup prints on its own (printSalesQuotation).
 */

import type { CSSProperties, ReactNode } from 'react'

import {
  SALES_QUOTATION_HEADINGS, SALES_QUOTATION_TEXT, SQ_PAGE, paginate, quotationDateText, salesRowCells,
  type SalesQuotationDoc, type SalesQuotationPage,
} from '@/lib/sales-quotation'

const GREY = 'rgb(128,128,128)'
const PINK = 'rgb(255,242,255)'
const CALIBRI = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif"
const ARIAL = 'Arial, Helvetica, sans-serif'
const LEFT = 18.5
const RIGHT = 823.8
const TABLE_RIGHT = 822.8
/** Column edges, from the sample's lines. */
const COLS = [LEFT, 37.1, 185.2, 211.4, 255.5, 301.0, 347.2, 376.8, 490.2, 515.8, 596.2, 690.5, 763.8, TABLE_RIGHT]
/** How each column's values sit, and their inner padding (from the sample). */
const ALIGN: { align: 'left' | 'center' | 'right'; pad: number }[] = [
  { align: 'center', pad: 0 }, { align: 'left', pad: 2.9 }, { align: 'center', pad: 0 }, { align: 'center', pad: 0 }, { align: 'center', pad: 0 },
  { align: 'center', pad: 0 }, { align: 'center', pad: 0 }, { align: 'left', pad: 1.7 }, { align: 'center', pad: 0 }, { align: 'left', pad: 3 },
  { align: 'center', pad: 0 }, { align: 'right', pad: 6.4 }, { align: 'right', pad: 1 },
]

const pt = (n: number) => `${n}pt`

function T({ x, y, w, size, bold, font = CALIBRI, align = 'left', pad = 0, children }: { x: number; y: number; w?: number; size: number; bold?: boolean; font?: string; align?: 'left' | 'center' | 'right'; pad?: number; children: ReactNode }) {
  const style: CSSProperties = {
    position: 'absolute',
    left: pt(x),
    top: pt(y),
    width: w === undefined ? undefined : pt(w),
    paddingLeft: align === 'left' ? pt(pad) : undefined,
    paddingRight: align === 'right' ? pt(pad) : undefined,
    boxSizing: 'border-box',
    fontFamily: font,
    fontSize: pt(size),
    fontWeight: bold ? 700 : 400,
    lineHeight: 1.21,
    textAlign: align,
    whiteSpace: 'pre',
    overflow: 'hidden',
    color: '#000',
  }
  return <div style={style}>{children}</div>
}
const HLine = ({ y, x0 = LEFT, x1 = RIGHT }: { y: number; x0?: number; x1?: number }) => (
  <div style={{ position: 'absolute', left: pt(x0), top: pt(y - 0.5), width: pt(x1 - x0), height: 0, borderTop: `1pt solid ${GREY}` }} />
)
const VLine = ({ x, y0, y1 }: { x: number; y0: number; y1: number }) => (
  <div style={{ position: 'absolute', left: pt(x - 0.5), top: pt(y0), width: 0, height: pt(y1 - y0), borderLeft: `1pt solid ${GREY}` }} />
)

function Page({ doc, page, pages, origin }: { doc: SalesQuotationDoc; page: SalesQuotationPage; pages: number; origin: string }) {
  const h = SQ_PAGE.rowHeight
  const headTop = page.rowsTop - 38.5
  const tableTop = page.headings ? headTop : page.rowsTop
  const tableEnd = page.rowsTop + page.rows.length * h
  const c = tableEnd // the closing block is placed from the end of the table
  return (
    <div className="sq-page" style={{ position: 'relative', width: pt(842), height: pt(595), background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: pt(LEFT), top: pt(18.2), width: pt(RIGHT - LEFT), height: pt(563.9 - 18.2), border: `1pt solid ${GREY}`, boxSizing: 'border-box' }} />
      {/* Page Header a: logo and letterhead */}
      <img src={`${origin}/quotation/gp3-logo.png`} alt="Gujarat Print Pack Publications Pvt. Ltd." style={{ position: 'absolute', left: pt(24), top: pt(17.7), width: pt(184.5), height: pt(54) }} />
      <T x={LEFT + 2.6} y={25.2} w={RIGHT - LEFT} size={10.1} bold font={ARIAL} align="center">{doc.texts.letterhead[0]}</T>
      {doc.texts.letterhead.slice(1).map((t, i) => (
        <T key={t} x={LEFT + 2.4} y={37.7 + i * 12.17} w={RIGHT - LEFT} size={8.2} align="center">{t}</T>
      ))}
      <HLine y={86.5} />
      {/* Page Header b: title */}
      <T x={LEFT} y={86.1} w={RIGHT - LEFT} size={10.6} bold align="center">{doc.title}</T>
      <HLine y={104.4} />

      {/* Page Header c: page 1 only */}
      {page.details && (
        <>
          {([
            ['Quotation No.  ', 108.5, 108.5, doc.quotationNo, 108.4],
            ['Quotation Date ', 121.2, 120.4, quotationDateText(doc.sheet.date), 121.1],
            ['Quotation Validity ', 133.0, 132.4, doc.texts.validity, 133.0],
            ['Lead Time ', 145.0, 144.3, doc.texts.leadTime, 145.0],
            ['Currency : ', 156.4, 156.3, doc.texts.currency, 156.4],
          ] as const).map(([label, y, colonY, value, valueY]) => (
            <div key={label}>
              <T x={25.1} y={y} size={7.3} bold>{label}</T>
              <T x={96} y={colonY} size={7.3}>:</T>
              <T x={108.8} y={valueY} size={6.6} bold>{value}</T>
            </div>
          ))}
          <T x={237.8} y={108.5} size={7.3} bold>Delivery Location</T>
          <T x={237.8} y={121.2} size={7.3}>{doc.texts.deliveryLocation}</T>
          <HLine y={186.1} />
        </>
      )}

      {/* Page Header f: headings */}
      {page.headings && (
        <>
          <div style={{ position: 'absolute', left: pt(LEFT), top: pt(headTop), width: pt(TABLE_RIGHT - LEFT), height: pt(38.5), background: PINK, border: `1pt solid ${GREY}`, boxSizing: 'border-box' }} />
          {SALES_QUOTATION_HEADINGS.map((lines, i) =>
            lines.map((line, k) => (
              <T key={`${i}-${k}`} x={COLS[i]} y={headTop + 2.0 + k * 9.85} w={COLS[i + 1] - COLS[i]} size={6.6} bold align="center">{line}</T>
            ))
          )}
        </>
      )}

      {/* Details */}
      {page.rows.map((r, n) => {
        const top = page.rowsTop + n * h
        return (
          <div key={r.line.id}>
            {salesRowCells(r).map((cell, i) => (
              <T key={i} x={COLS[i]} y={top + 4.9} w={COLS[i + 1] - COLS[i]} size={6.6} align={ALIGN[i].align} pad={ALIGN[i].pad}>{cell}</T>
            ))}
            <HLine y={top + h} x1={TABLE_RIGHT + 1.7} />
          </div>
        )
      })}
      {(page.rows.length > 0 || page.headings) && COLS.slice(1, -1).map((x) => <VLine key={x} x={x} y0={tableTop} y1={tableEnd} />)}
      {page.rows.length > 0 && <VLine x={TABLE_RIGHT} y0={tableTop} y1={tableEnd} />}

      {/* Report Footer: Payment Terms, Other Charges, Remarks, declaration */}
      {page.closing && (
        <>
          <HLine y={c + 0.7} />
          <HLine y={c + 25.6} />
          <HLine y={c + 91.6} />
          <VLine x={278.1} y0={c + 0.7} y1={c + 91.6} />
          <VLine x={549.5} y0={c + 0.7} y1={c + 91.6} />
          <T x={LEFT} y={c + 6.2} w={278.1 - LEFT} size={9.9} bold align="center">Payment Terms </T>
          <T x={278.1} y={c + 6.4} w={549.5 - 278.1} size={10.6} bold align="center">Other Charges</T>
          <T x={549.5} y={c + 6.4} w={RIGHT - 549.5} size={10.6} bold align="center">Remarks</T>
          <T x={LEFT} y={c + 40.3} w={278.1 - LEFT} size={9.0} bold align="center">{doc.footer.paymentTerms}</T>
          {([
            ['Freight', doc.footer.freight, 30.2],
            ['Plate Charge', doc.footer.plateCharge, 42.0],
            ['Die Charge', doc.footer.dieCharge, 53.2],
            ['Proofing Charge', doc.footer.proofingCharge, 64.6],
            ['GST Charge (Extra)', doc.footer.gst, 77.4],
          ] as const).map(([label, value, dy]) => (
            <div key={label}>
              <T x={280.2} y={c + dy} size={7.3} bold>{label}</T>
              <T x={353.4} y={c + dy - 0.2} size={8.8} bold font={ARIAL}>:</T>
              <T x={357.8} y={c + dy + 0.1} size={7.3}>{value}</T>
            </div>
          ))}
          <T x={24.9} y={c + 95.3} size={6.6} bold>{doc.texts.declaration[0]}</T>
          {doc.texts.declaration.slice(1).map((t, i) => (
            <T key={i} x={24.9} y={c + 105.2 + i * 9.85} size={6.6}>{t}</T>
          ))}
          <HLine y={c + 139.3} />
          <T x={LEFT + 2.1} y={c + 141.5} w={RIGHT - LEFT} size={9.0} bold align="center">{doc.texts.computerGenerated}</T>
        </>
      )}

      {/* Page footer: the corporate office strip, page number, Cont.. on every page but the last */}
      <HLine y={SQ_PAGE.footerTop} />
      <img src={`${origin}/quotation/gp3-corporate-office.png`} alt="Corporate Office" style={{ position: 'absolute', left: pt(19.5), top: pt(504.6), width: pt(463.1), height: pt(57.9) }} />
      <T x={21} y={566.2} size={8.2}>{`Page ${page.number} of ${pages}`}</T>
      {page.number < pages && <T x={RIGHT - 60} y={566.2} w={60} size={8.2} align="right">{SALES_QUOTATION_TEXT.continued}</T>}
    </div>
  )
}

export function SalesQuotationPages({ doc, origin = '' }: { doc: SalesQuotationDoc; origin?: string }) {
  const pages = paginate(doc.rows)
  return (
    <>
      {pages.map((p) => (
        <Page key={p.number} doc={doc} page={p} pages={pages.length} origin={origin} />
      ))}
    </>
  )
}

/** Opens the print box with the quotation pages alone (A4 landscape, no margins); "Save as PDF" there makes the PDF. */
export async function printSalesQuotation(doc: SalesQuotationDoc): Promise<void> {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const markup = renderToStaticMarkup(<SalesQuotationPages doc={doc} origin={window.location.origin} />)
  const title = `Sales Quotation ${doc.quotationNo.replace(/\s/g, '')} ${doc.sheet.customer}`.replace(/[\\/:*?"<>|]/g, ' ').trim()
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)
  const w = frame.contentWindow!
  w.document.open()
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>` +
      '@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#fff}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.sq-page{break-after:page;page-break-after:always}.sq-page:last-child{break-after:auto;page-break-after:auto}' +
      `</style></head><body>${markup}</body></html>`
  )
  w.document.close()
  await Promise.all([...w.document.images].map((img) => (img.complete ? Promise.resolve() : new Promise((done) => { img.onload = img.onerror = () => done(null) }))))
  await w.document.fonts?.ready
  const cleanup = () => setTimeout(() => frame.remove(), 1000)
  w.addEventListener('afterprint', cleanup, { once: true })
  w.focus()
  w.print()
  // Some browsers return from print() only after it closes; clean up then too.
  setTimeout(cleanup, 60_000)
}
