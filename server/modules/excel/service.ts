/**
 * The live Excel books on disk.
 *
 * The browser cannot watch a file, so the server does: it holds the paths,
 * reports when a workbook last changed, and hands over its bytes on request.
 *
 * Paths come only from configuration and never from a request. A caller may
 * pick which configured book it wants and nothing else, so this can never be
 * talked into reading an arbitrary file off the machine.
 */

import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { Readable } from 'node:stream'
import { EXCEL_BOOKS, type ExcelBook, type ExcelBookStatus } from '../../../shared/api'
import type { ExcelBookConfig } from '../../config'
import { ApiError } from '../../http/errors'

export type ExcelConfig = Partial<Record<ExcelBook, ExcelBookConfig>>

export interface ExcelFile {
  stream: Readable
  name: string
  contentType: string
  modifiedAt: string
  sheet: string | null
}

export interface ExcelService {
  status(book: ExcelBook): ExcelBookStatus
  statusAll(): Record<ExcelBook, ExcelBookStatus>
  open(book: ExcelBook): ExcelFile
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function contentTypeFor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  return XLSX_TYPE
}

/** Turns a filesystem failure into something the person can act on. */
export function describeFsError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'ENOENT') return 'No file at that path. Check the path in the environment settings.'
  if (code === 'EACCES' || code === 'EPERM') return 'This machine is not allowed to read that file.'
  return err instanceof Error ? err.message : 'Could not read that file.'
}

const UNCONFIGURED = (book: ExcelBook): ExcelBookStatus => ({
  book,
  configured: false,
  name: null,
  exists: false,
  modifiedAt: null,
  size: null,
  sheet: null,
  error: null,
})

export function createExcelService(config: ExcelConfig): ExcelService {
  const status = (book: ExcelBook): ExcelBookStatus => {
    const entry = config[book]
    if (!entry) return UNCONFIGURED(book)

    const base = { book, configured: true, name: basename(entry.path), sheet: entry.sheet ?? null }

    try {
      const stat = statSync(entry.path)
      if (!stat.isFile()) {
        return { ...base, exists: false, modifiedAt: null, size: null, error: 'That path is a folder, not a file.' }
      }
      return { ...base, exists: true, modifiedAt: stat.mtime.toISOString(), size: stat.size, error: null }
    } catch (err) {
      return { ...base, exists: false, modifiedAt: null, size: null, error: describeFsError(err) }
    }
  }

  return {
    status,

    statusAll: () =>
      EXCEL_BOOKS.reduce(
        (all, book) => ({ ...all, [book]: status(book) }),
        {} as Record<ExcelBook, ExcelBookStatus>
      ),

    open(book) {
      const entry = config[book]
      const current = status(book)
      if (!entry || !current.configured) {
        throw ApiError.notConfigured(`No Excel file is connected for ${book}.`)
      }
      if (!current.exists) {
        throw ApiError.notFound(current.error ?? 'That file could not be read.')
      }

      return {
        stream: createReadStream(entry.path),
        name: current.name ?? 'workbook.xlsx',
        contentType: contentTypeFor(current.name ?? ''),
        modifiedAt: current.modifiedAt ?? '',
        sheet: current.sheet,
      }
    },
  }
}
