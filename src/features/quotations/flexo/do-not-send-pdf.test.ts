/**
 * The Do not Send PDF against the user's own SAP print (27 Nov 2026): sheet
 * 5382, Shree ganesh bakery nandani pvt. sap-5382-dns.json holds every text
 * and coloured box of SAP's file as PyMuPDF read it (position, size). The
 * same sheet is worked out here with SAP's rates and laid out; every SAP text
 * must come out at the same place.
 */
import { describe, expect, it } from 'vitest'

import { doNotSendReport, dnsFixed } from '@/lib/do-not-send'
import { blankFlexoLine, type FlexoRateSheet } from '@/lib/flexo-rate-sheet'
import { DEFAULT_QUOTATION_CONFIG } from '@/lib/quotation-config'
import { DNS_PAGE, doNotSendFileName, doNotSendPdfPages, textWidth, type PdfOp } from './do-not-send-pdf'
import sap from './sap-5382-dns.json'

const RATES = { '80 GSM Chromo': 27.9, 'Gloss UV': 3.78, None: 0, Gujarat: 8 }

const line = (id: string, moq: number, acrossUps: number) => ({
  ...blankFlexoLine(id),
  jobName: 'slice cake sticker label', netContent: '-', set: 'No', cutLength: 64, width: 202.5, moq, teeth: 85, acrossUps, aroundUps: 4,
  acrossGap: 4, colors: 8, jobLevel: 'Level 1', coatingType: 'Gloss UV', valueAddCoverageArea: 0, valueAddition: 'None',
  material: '80 GSM Chromo', inkCoverageArea: 100, deliveryZone: 'Gujarat', profitOverhead: 35, itemType: 'Label',
})

export const SHEET_5382: FlexoRateSheet = {
  id: 's5382', docEntry: 5382, date: '2026-11-24', remark: '-', dieCharge: 'Extra@2500', freight: 'Inclu RoadT', paymentTerms: '',
  status: 'Pending', customer: 'Shree ganesh bakery nandani pvt', marketingPerson: 'Other', plateCharge: 'Extra@1200',
  proofingCharge: 'Extra@15000', gst: 'Extra @ 18%', deliveryLocation: '',
  lines: [line('l1', 100000, 1), line('l2', 150000, 2), line('l3', 200000, 2)],
  coordinator_id: null, created_at: '', created_by: null, updated_at: '', updated_by: null,
}

type TextOp = Extract<PdfOp, { kind: 'text' }>
const edges = (op: TextOp) => {
  const w = textWidth(op.text, op.size, op.bold) * (op.hScale ?? 1)
  const left = op.align === 'left' ? op.x : op.align === 'right' ? op.x - w : op.x - w / 2
  // SAP's edges are of the letters only: leave out leading and trailing spaces.
  const scale = op.hScale ?? 1
  const lead = textWidth(op.text.match(/^ */)![0], op.size, op.bold) * scale
  const trail = textWidth(op.text.match(/ *$/)![0], op.size, op.bold) * scale
  return { left: left + lead, right: left + w - trail }
}

describe('Do not Send PDF, against SAP print 5382', () => {
  const report = doNotSendReport(SHEET_5382, RATES, DEFAULT_QUOTATION_CONFIG)
  const pages = doNotSendPdfPages(report)
  const texts = pages[0].filter((o): o is TextOp => o.kind === 'text')

  it('is one page the size of SAP’s, named as SAP names it', () => {
    expect(pages).toHaveLength(1)
    expect(DNS_PAGE).toEqual({ width: 1899, height: 612 })
    expect(doNotSendFileName(report)).toBe('5382-Shree_ganesh_bakery_nandani_pvt_DO_NOT_SEND.pdf')
  })

  it('prints every text SAP prints, at SAP’s place and size', () => {
    const used = new Set<TextOp>()
    const off: string[] = []
    for (const s of sap.spans) {
      const op = texts
        .filter((o) => !used.has(o) && o.text.trim() === s.text)
        // The same text can sit on one baseline twice ("Gap", "Price/SQM"): take the nearest.
        .sort((a, b) => Math.abs(a.y - s.y) * 100 + Math.abs(edges(a).left - s.left) - (Math.abs(b.y - s.y) * 100 + Math.abs(edges(b).left - s.left)))[0]
      expect(op, `"${s.text}" at ${s.y}`).toBeDefined()
      used.add(op)
      const e = edges(op)
      const where = `"${s.text}" (${s.left}-${s.right} @ ${s.y})`
      expect(Math.abs(op.y - s.y), where).toBeLessThan(0.2)
      expect(Math.abs(op.size - s.size), where).toBeLessThan(0.11)
      // Arial and Helvetica share letter widths, but Crystal spaces letters on its own grid: up to 1 pt (0.35 mm) over a long text.
      const d = Math.max(Math.abs(e.right - s.right), Math.abs(e.left - s.left))
      if (d > 0.3) off.push(`${where}: ${d.toFixed(2)}`)
      expect(d, where).toBeLessThan(1)
    }
    console.log(`texts off by more than 0.3 pt: ${off.length}\n${off.join('\n')}`)
    // Nothing printed that SAP does not print.
    expect(texts.filter((o) => !used.has(o)).map((o) => o.text)).toEqual([':', ':', ':', ':', ':'].slice(0, texts.filter((o) => !used.has(o)).length))
  })

  it('colours the same boxes as SAP', () => {
    const fills = pages[0].filter((o) => o.kind === 'fill') as Extract<PdfOp, { kind: 'fill' }>[]
    for (const f of sap.fills) {
      const rgb = f.fill.map((c: number) => Math.round(c * 255))
      const ours = fills.find((o) => Math.abs(o.x - f.x) < 0.2 && Math.abs(o.y - f.y) < 0.2)
      expect(ours, `box at ${f.x},${f.y}`).toBeDefined()
      expect(ours!.rgb).toEqual(rgb)
      expect(Math.abs(ours!.x + ours!.w - f.x1)).toBeLessThan(0.2)
      expect(Math.abs(ours!.y + ours!.h - f.y1)).toBeLessThan(0.2)
    }
    expect(fills).toHaveLength(sap.fills.length)
  })

  it('rounds only what it prints', () => {
    const f = report.lines[0].figures!
    expect(dnsFixed(f.finalRate, 3)).toBe('0.950')
    expect(dnsFixed(f.totalValue, 0)).toBe('94976')
    expect(f.totalValue).toBeCloseTo(94975.7117, 3)
    expect(dnsFixed(-0.0004, 3)).toBe('0.000')
    expect(dnsFixed(2.675, 2)).toBe('2.68')
  })

  it('moves the remarks and footer down with more lines, and goes on to a second page after 20', () => {
    const more = { ...SHEET_5382, lines: Array.from({ length: 25 }, (_, i) => line(`m${i}`, 100000, 1)) }
    const p = doNotSendPdfPages(doNotSendReport(more, RATES, DEFAULT_QUOTATION_CONFIG))
    expect(p).toHaveLength(2)
    const gst = (ops: PdfOp[]) => ops.find((o) => o.kind === 'text' && o.text === 'GST Charge (Extra)') as TextOp | undefined
    expect(gst(p[0])).toBeUndefined()
    expect(gst(p[1])!.y).toBeCloseTo(226.3 + 2 * 21.3, 5)
    expect(gst(doNotSendPdfPages(doNotSendReport({ ...SHEET_5382, lines: more.lines.slice(0, 20) }, RATES, DEFAULT_QUOTATION_CONFIG))[0])!.y).toBeLessThan(612)
  })
})
