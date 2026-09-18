import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { calendarDateOf, normalizeDate, parseFile } from './file-parser'
import { autoMapCompanyColumns } from './companies-upload'
import { autoMapOverdueColumns } from './overdue-upload'
import { scoreSheetFor } from './excel-source'

/** Wraps a workbook on disk in the File shape parseFile expects. */
function loadWorkbook(name: string): File {
  const buffer = readFileSync(resolve(__dirname, '__fixtures__', name))
  return {
    name,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as unknown as File
}

const BOOK = 'two_sheet_sample.xlsx'

/**
 * One file, two tabs — the shape a team keeps when they track both books in a
 * single workbook. Each module reads its own tab and neither sees the other's.
 */
describe('a workbook holding both books', () => {
  it('lists both tabs', async () => {
    const parsed = await parseFile(loadWorkbook(BOOK))
    expect(parsed.sheetNames).toEqual(['CRM ACTIVE PAYMENT', 'CRM OverDue'])
  })

  it('reads the Active Payments tab when asked for it', async () => {
    const parsed = await parseFile(loadWorkbook(BOOK), { sheetName: 'CRM ACTIVE PAYMENT' })

    expect(parsed.sheetName).toBe('CRM ACTIVE PAYMENT')
    expect(parsed.autoSelected).toBe(false)
    expect(parsed.rows.length).toBeGreaterThan(0)

    // The columns Active Payments needs, and none of the ageing ones.
    const mapping = autoMapCompanyColumns(parsed.headers)
    expect(mapping.company_name).toBeTruthy()
    expect(mapping.coordinator_name).toBeTruthy()
    expect(mapping.total_amount).toBeTruthy()
  })

  it('reads the Overdue tab from the same file', async () => {
    const parsed = await parseFile(loadWorkbook(BOOK), { sheetName: 'CRM OverDue' })

    expect(parsed.sheetName).toBe('CRM OverDue')
    const mapping = autoMapOverdueColumns(parsed.headers)
    expect(mapping.bp_code).toBeTruthy()
    expect(mapping.customer_name).toBeTruthy()
    expect(mapping.balance_due).toBeTruthy()
  })

  it('keeps the two tabs apart', async () => {
    const active = await parseFile(loadWorkbook(BOOK), { sheetName: 'CRM ACTIVE PAYMENT' })
    const overdue = await parseFile(loadWorkbook(BOOK), { sheetName: 'CRM OverDue' })

    expect(active.headers).not.toEqual(overdue.headers)
    expect(JSON.stringify(active.rows)).not.toBe(JSON.stringify(overdue.rows))
  })

  it('forgives the shift key and a stray space', async () => {
    // Excel does not care how the tab is capitalised, and neither should the
    // settings file: "CRM Overdue" must still find "CRM OverDue".
    for (const spelling of ['CRM Overdue', 'crm overdue', '  CRM OverDue  ', 'CRM   OverDue']) {
      const parsed = await parseFile(loadWorkbook(BOOK), { sheetName: spelling })
      expect(parsed.sheetName).toBe('CRM OverDue')
    }
  })

  it('names the tabs it does have when the one asked for is missing', async () => {
    // "It did not work" is useless; the list turns it into a ten-second fix.
    await expect(parseFile(loadWorkbook(BOOK), { sheetName: 'Sheet1' })).rejects.toThrow(
      /no sheet named "Sheet1".*CRM ACTIVE PAYMENT.*CRM OverDue/s
    )
  })

  it('picks a tab itself when none is named', async () => {
    // With no sheet setting the parser still has to choose one, so an import
    // without the setting is never silently empty.
    const parsed = await parseFile(loadWorkbook(BOOK))
    expect(parsed.sheetNames).toContain(parsed.sheetName)
    expect(parsed.autoSelected).toBe(true)
    expect(parsed.rows.length).toBeGreaterThan(0)
  })

  it('lands on the right tab per module with no sheet setting at all', async () => {
    // Naming the tab is insurance, not a requirement: each module scores the
    // tabs by what only its own sheet can carry.
    const active = await parseFile(loadWorkbook(BOOK), {
      scoreSheet: (sheet) => scoreSheetFor('companies', sheet.headers),
    })
    expect(active.sheetName).toBe('CRM ACTIVE PAYMENT')

    const overdue = await parseFile(loadWorkbook(BOOK), {
      scoreSheet: (sheet) => scoreSheetFor('overdue', sheet.headers),
    })
    expect(overdue.sheetName).toBe('CRM OverDue')
  })
})

describe('scoreSheetFor', () => {
  const ACTIVE = ['Cust. Code', 'Customer Name', 'Co-ordinator Name', 'Payment Term Total Amount', 'Invoice Date']
  const AGEING = ['BP Code', 'Customer Name', 'Coordinator Name', 'Balance Due', '0 - 30', '31 - 60', '61 - 90', '91 - 120', '121+']

  it('prefers the ageing tab for the overdue book, and the other for accounts', () => {
    expect(scoreSheetFor('overdue', AGEING)).toBeGreaterThan(scoreSheetFor('overdue', ACTIVE))
    expect(scoreSheetFor('companies', ACTIVE)).toBeGreaterThan(scoreSheetFor('companies', AGEING))
  })

  it('is not fooled by an invoice sheet that fills every required ageing column', () => {
    // A BP code, a customer, a coordinator and an amount are on both sheets, so
    // required columns alone tie — the buckets have to break it.
    expect(scoreSheetFor('overdue', ACTIVE)).toBeLessThan(scoreSheetFor('overdue', AGEING))
  })

  it('scores a sheet that fits neither book at the bottom', () => {
    const unrelated = ['Region', 'Sales Person', 'Notes']
    expect(scoreSheetFor('overdue', unrelated)).toBeLessThan(scoreSheetFor('overdue', AGEING))
    expect(scoreSheetFor('companies', unrelated)).toBeLessThan(scoreSheetFor('companies', ACTIVE))
  })
})

describe('the date a spreadsheet cell means', () => {
  it('reads a date built at local midnight as that day', () => {
    // What the browser gets: reading bytes makes local midnight, which is
    // 18:30 the previous day in India. Taking its UTC date lost a day on
    // every due date in the file.
    expect(calendarDateOf(new Date(2026, 2, 2, 0, 0, 0))).toBe('2026-03-02')
    expect(calendarDateOf(new Date(2026, 1, 19, 0, 0, 0))).toBe('2026-02-19')
  })

  it('reads a date built at midnight UTC as that same day', () => {
    // What reading from a file path gives; both must agree on the calendar.
    expect(calendarDateOf(new Date('2026-03-02T00:00:00.000Z'))).toBe('2026-03-02')
    expect(calendarDateOf(new Date('2026-12-31T00:00:00.000Z'))).toBe('2026-12-31')
  })

  it('agrees with itself whichever way the workbook was opened', () => {
    // The same cell, both constructions, must land on the same day.
    for (const [y, m, d] of [
      [2026, 0, 1],
      [2026, 2, 2],
      [2026, 6, 15],
      [2026, 11, 31],
    ] as const) {
      const local = new Date(y, m, d, 0, 0, 0)
      const utc = new Date(Date.UTC(y, m, d))
      expect(calendarDateOf(local)).toBe(calendarDateOf(utc))
    }
  })

  it('carries through normalizeDate, which is what the import calls', () => {
    expect(normalizeDate(new Date(2026, 2, 2, 0, 0, 0))).toBe('2026-03-02')
    expect(normalizeDate(new Date('2026-03-02T00:00:00.000Z'))).toBe('2026-03-02')
    // Cells holding text rather than a real date are read as before.
    expect(normalizeDate('15/06/2025')).toBe('2025-06-15')
    expect(normalizeDate('2026-03-02')).toBe('2026-03-02')
  })
})
