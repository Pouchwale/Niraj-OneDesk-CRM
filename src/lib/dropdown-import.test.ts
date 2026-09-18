import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseFile } from './file-parser'
import {
  autoMapOverdueColumns,
  mapOverdueRows,
  validateOverdueRows,
  processOverdueUpload,
} from './overdue-upload'
import { OVERDUE_TARGET_SCHEMA } from './overdue-schema'
import { resolveCoordinatorName } from './coordinator-aliases'
import { demoCompanyStore } from './demo-companies'
import { getOverduePayments } from './overdue-api'

function loadWorkbook(name: string): File {
  const buffer = readFileSync(resolve(__dirname, '__fixtures__', name))
  return {
    name,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as unknown as File
}

/** Mirrors the scorer the upload wizard passes to parseFile. */
const scoreSheet = (sheet: { headers: string[] }) => {
  const mapping = autoMapOverdueColumns(sheet.headers)
  return OVERDUE_TARGET_SCHEMA.filter((f) => f.required && mapping[f.key]).length
}

beforeEach(() => {
  demoCompanyStore.overduePayments = []
  demoCompanyStore.followups = []
})

describe('workbooks with a dropdown list sheet', () => {
  it('exposes every sheet in the workbook', async () => {
    const parsed = await parseFile(loadWorkbook('dropdown_sample.xlsx'), { scoreSheet })
    expect(parsed.sheetNames).toEqual(['Lists', 'Ageing Data'])
  })

  it('skips the data-validation list sheet and reads the data sheet', async () => {
    const parsed = await parseFile(loadWorkbook('dropdown_sample.xlsx'), { scoreSheet })

    // "Lists" comes first in the workbook but holds only the dropdown values.
    expect(parsed.sheetName).toBe('Ageing Data')
    expect(parsed.headers).toContain('Coordinator Name')
    expect(parsed.rows).toHaveLength(4)
  })

  it('still picks the data sheet without a caller-supplied scorer', async () => {
    const parsed = await parseFile(loadWorkbook('dropdown_sample.xlsx'))
    expect(parsed.sheetName).toBe('Ageing Data')
  })

  it('honours an explicit sheet choice', async () => {
    const parsed = await parseFile(loadWorkbook('dropdown_sample.xlsx'), { sheetName: 'Lists' })
    expect(parsed.sheetName).toBe('Lists')
    expect(parsed.autoSelected).toBe(false)
  })

  it('reads the value each dropdown cell holds', async () => {
    const parsed = await parseFile(loadWorkbook('dropdown_sample.xlsx'), { scoreSheet })
    const rows = mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))

    expect(rows.map((r) => r.coordinator_name)).toEqual([
      'Pragati',
      'DIYA',
      'Devyani Vaghela',
      'foram@gp3.com',
    ])
  })

  it('assigns every dropdown spelling to the right coordinator', async () => {
    const parsed = await parseFile(loadWorkbook('dropdown_sample.xlsx'), { scoreSheet })
    const rows = mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))
    const result = await validateOverdueRows(rows)

    expect(result.unassigned).toHaveLength(0)
    expect(result.valid).toHaveLength(4)
    expect(result.valid.map((r) => r.coordinator_id)).toEqual([
      'coord-1', // Pragati - exact
      'coord-2', // DIYA - upper case
      'coord-3', // "Devyani Vaghela" - surname the roster does not carry
      'coord-4', // matched by email
    ])
  })

  it('imports the rows and scopes them to their coordinator', async () => {
    const parsed = await parseFile(loadWorkbook('dropdown_sample.xlsx'), { scoreSheet })
    const validation = await validateOverdueRows(
      mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))
    )
    const outcome = await processOverdueUpload(validation.valid)

    expect(outcome.created).toBe(4)
    expect(outcome.failed).toBe(0)

    const pragatis = await getOverduePayments('coord-1')
    expect(pragatis.map((p) => p.customer_name)).toEqual(['Sunrise Foods'])
  })
})

describe('resolveCoordinatorName', () => {
  // A fresh deployment has no rows in coordinator_aliases; resolution must still
  // work off the coordinator profiles themselves.
  const noAliases = new Map<string, string>()

  it('matches the exact name regardless of case or spacing', () => {
    expect(resolveCoordinatorName('Pragati', noAliases)).toBe('coord-1')
    expect(resolveCoordinatorName('  PRAGATI  ', noAliases)).toBe('coord-1')
  })

  it('matches honorifics and trailing qualifiers', () => {
    expect(resolveCoordinatorName('Ms. Foram', noAliases)).toBe('coord-4')
    expect(resolveCoordinatorName('Diya (GP3)', noAliases)).toBe('coord-2')
    expect(resolveCoordinatorName('Krupa - Sleeves', noAliases)).toBe('coord-5')
  })

  it('matches by email and username', () => {
    expect(resolveCoordinatorName('pragati@gp3.com', noAliases)).toBe('coord-1')
    expect(resolveCoordinatorName('aniketa', noAliases)).toBe('coord-6')
  })

  it('matches a name the roster records without its surname', () => {
    // Sheets spell her "Devyani Vaghela"; the roster holds only "Devyani".
    expect(resolveCoordinatorName('Devyani Vaghela', noAliases)).toBe('coord-3')
  })

  it('matches a unique first name only', () => {
    expect(resolveCoordinatorName('Krina', noAliases)).toBe('coord-7')
  })

  it('gives up rather than guessing when nothing matches', () => {
    expect(resolveCoordinatorName('Nobody Known', noAliases)).toBeNull()
    expect(resolveCoordinatorName('', noAliases)).toBeNull()
    expect(resolveCoordinatorName('   ', noAliases)).toBeNull()
  })

  it('lets a configured alias override profile matching', () => {
    const aliases = new Map([['collections desk', 'coord-5']])
    expect(resolveCoordinatorName('Collections Desk', aliases)).toBe('coord-5')
  })
})
