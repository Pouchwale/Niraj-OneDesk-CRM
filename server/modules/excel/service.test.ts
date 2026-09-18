import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { contentTypeFor, createExcelService, describeFsError } from './service'
import { ApiError } from '../../http/errors'

const dir = mkdtempSync(join(tmpdir(), 'excel-service-'))
const workbook = join(dir, 'ageing.xlsx')
writeFileSync(workbook, 'not a real workbook, but a real file')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('status', () => {
  it('reports a connected file with its name, size and save time', () => {
    const status = createExcelService({ overdue: { path: workbook } }).status('overdue')
    expect(status).toMatchObject({ book: 'overdue', configured: true, exists: true, name: 'ageing.xlsx', error: null })
    expect(status.size).toBeGreaterThan(0)
    expect(Date.parse(status.modifiedAt!)).not.toBeNaN()
  })

  it('moves the timestamp when the file is saved again', () => {
    const service = createExcelService({ overdue: { path: workbook } })
    const before = service.status('overdue').modifiedAt
    const later = new Date(Date.now() + 60_000)
    utimesSync(workbook, later, later)
    expect(service.status('overdue').modifiedAt).not.toBe(before)
  })

  it('says plainly when the path is wrong, and never throws', () => {
    const missing = createExcelService({ overdue: { path: join(dir, 'nope.xlsx') } }).status('overdue')
    expect(missing).toMatchObject({ configured: true, exists: false })
    expect(missing.error).toBe('No file at that path. Check the path in the environment settings.')

    const folder = join(dir, 'a-folder')
    mkdirSync(folder, { recursive: true })
    expect(createExcelService({ overdue: { path: folder } }).status('overdue').error).toBe(
      'That path is a folder, not a file.'
    )
  })

  it('reports an unconfigured book without inventing a name', () => {
    expect(createExcelService({}).status('companies')).toEqual({
      book: 'companies',
      configured: false,
      name: null,
      exists: false,
      modifiedAt: null,
      size: null,
      sheet: null,
      error: null,
    })
  })

  it('never sends the full path to the browser, only the file name', () => {
    const status = createExcelService({ overdue: { path: workbook } }).status('overdue')
    expect(JSON.stringify(status)).not.toContain(dir)
  })

  it('covers both books at once', () => {
    const all = createExcelService({ overdue: { path: workbook } }).statusAll()
    expect(all.overdue.configured).toBe(true)
    expect(all.companies.configured).toBe(false)
  })
})

describe('open', () => {
  it('hands over the bytes with the timestamp the client compares against', async () => {
    const file = createExcelService({ overdue: { path: workbook, sheet: 'Ageing' } }).open('overdue')
    expect(file.name).toBe('ageing.xlsx')
    expect(file.sheet).toBe('Ageing')
    expect(Date.parse(file.modifiedAt)).not.toBeNaN()

    const chunks: Buffer[] = []
    for await (const chunk of file.stream) chunks.push(chunk as Buffer)
    expect(Buffer.concat(chunks).toString()).toContain('a real file')
  })

  it('refuses a book nobody configured, and one whose file is gone', () => {
    expect(() => createExcelService({}).open('overdue')).toThrow(ApiError)
    expect(() => createExcelService({}).open('overdue')).toThrow(/No Excel file is connected/)

    try {
      createExcelService({ overdue: { path: join(dir, 'gone.xlsx') } }).open('overdue')
      expect.unreachable('a missing file must not open')
    } catch (err) {
      expect((err as ApiError).status).toBe(404)
    }
  })
})

describe('contentTypeFor and describeFsError', () => {
  it('names the type from the extension, defaulting to a workbook', () => {
    expect(contentTypeFor('book.csv')).toBe('text/csv')
    expect(contentTypeFor('BOOK.XLS')).toBe('application/vnd.ms-excel')
    expect(contentTypeFor('book.xlsx')).toContain('spreadsheetml')
    expect(contentTypeFor('book')).toContain('spreadsheetml')
  })

  it('turns a filesystem code into something to do about it', () => {
    expect(describeFsError({ code: 'ENOENT' })).toContain('No file at that path')
    expect(describeFsError({ code: 'EACCES' })).toContain('not allowed to read')
    expect(describeFsError(new Error('disk on fire'))).toBe('disk on fire')
  })
})
