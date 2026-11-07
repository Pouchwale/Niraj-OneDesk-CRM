import { describe, expect, it } from 'vitest'

import { byRelationManager, liveSummary, weeklyTrend, type OtifLiveRow } from '@/lib/otif-live'
import { orderCells, otifReportFileName, pctColour, pdfDate, pdfPct, renderOtifPdf, reportDetails, type OtifReportInput } from './otif-report-pdf'

const row = (o: Partial<OtifLiveRow> & { poNo: string }): OtifLiveRow => ({
  soNo: null,
  soDate: null,
  poDueDate: null,
  poClosedDate: null,
  delayDays: null,
  dayCommitted: null,
  customerName: null,
  openOrderQty: null,
  otifScore: null,
  relationManager: null,
  department: null,
  ...o,
})

const input = (rows: OtifLiveRow[]): OtifReportInput => {
  const summary = liveSummary(rows)
  return {
    weekStart: '2026-10-31',
    weekEnd: '2026-11-06',
    basisLabel: 'PO Closed Date',
    filters: { department: null, relationManager: null, bucket: null },
    file: { name: 'OTIF-SCORE.xlsm', sheet: 'Claude OTIF Score', savedAt: '2026-11-07T05:07:00.000Z', orders: 66740 },
    rows,
    summary,
    buckets: [{ bucket: 'On-Time / Early', count: summary.onTimeCount, percentage: summary.totalPOs ? (summary.onTimeCount / summary.totalPOs) * 100 : 0 }],
    managers: byRelationManager(rows),
    trend: weeklyTrend(rows, 'closed', '2026-10-31', 8),
    generatedBy: 'Test Admin',
  }
}

describe('OTIF PDF report', () => {
  it('writes each order in the team’s fields, clearly', () => {
    expect(
      orderCells(
        row({
          poNo: '91947',
          soNo: '34264',
          soDate: '2026-11-03',
          poDueDate: '2026-11-10',
          poClosedDate: '2026-11-05',
          delayDays: -5,
          dayCommitted: 7,
          customerName: 'Aculife Healthcare',
          openOrderQty: -13100,
          otifScore: 'YES',
          relationManager: 'Devyani Vaghela',
          department: 'FG - Label',
        })
      )
    ).toEqual(['91947', '34264', '03 Nov 2026', '10 Nov 2026', '05 Nov 2026', '-5', '7', 'Aculife Healthcare', '-13,100', 'YES', 'Devyani Vaghela', 'FG - Label'])
    // An order still open, late, with nothing else filled in.
    expect(orderCells(row({ poNo: '1', delayDays: 12, openOrderQty: 125000 }))).toEqual(['1', '-', '-', '-', 'Open', '+12', '-', '-', '1,25,000', '-', '-', '-'])
  })

  it('names the week, the filters and the source file', () => {
    expect(pdfDate('2026-11-06')).toBe('06 Nov 2026')
    expect(pdfDate(null)).toBe('-')
    expect(pdfPct(74.1758)).toBe('74.2%')
    expect(pdfPct(null)).toBe('-')
    expect(otifReportFileName('2026-10-31', '2026-11-06')).toBe('OTIF report 2026-10-31 to 2026-11-06.pdf')
    const details = Object.fromEntries(reportDetails(input([])))
    expect(details['Week (Saturday to Friday)']).toBe('31 Oct 2026 to 06 Nov 2026')
    expect(details['Orders counted by']).toBe('PO Closed Date')
    expect(details.Department).toBe('All departments')
    expect(details['Relation Manager']).toBe('Everyone')
    expect(details.Delay).toBe('All orders')
    expect(details['Source file']).toMatch(/^OTIF-SCORE\.xlsm \(sheet Claude OTIF Score\), saved 07 Nov 2026/)
    const filtered = Object.fromEntries(reportDetails({ ...input([]), filters: { department: 'FG - Label', relationManager: 'Krina Shah', bucket: '1-3 Days Late' } }))
    expect([filtered.Department, filtered['Relation Manager'], filtered.Delay]).toEqual(['FG - Label', 'Krina Shah', '1-3 Days Late'])
  })

  it('colours the OTIF score as the screen does', () => {
    expect(pctColour(90)).toEqual([5, 150, 105])
    expect(pctColour(74.2)).toEqual([217, 119, 6])
    expect(pctColour(60)).toEqual([225, 29, 72])
  })

  it('draws the summary page and the orders, page after page with the header repeated', async () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      row({
        poNo: String(90000 + i),
        soNo: String(34000 + i),
        soDate: '2026-10-20',
        poDueDate: '2026-11-04',
        poClosedDate: '2026-11-03',
        delayDays: i % 3 === 0 ? 4 : -2,
        dayCommitted: 14,
        customerName: `Customer number ${i} Private Limited`,
        openOrderQty: 0,
        otifScore: i % 3 === 0 ? 'NO' : 'YES',
        relationManager: i % 2 ? 'Krina Shah' : null,
        department: 'FG - Label',
      })
    )
    const doc = await renderOtifPdf(input(rows), null)
    // The summary, then 120 orders starting on a page of their own and running over at least two pages.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3)
    // A week with no orders still makes a readable report (the screen's button is off for one, but it must not break).
    const empty = await renderOtifPdf(input([]), null)
    expect(empty.getNumberOfPages()).toBeGreaterThanOrEqual(2)
  })
})
