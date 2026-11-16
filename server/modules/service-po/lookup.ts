/**
 * The Service-AutoPO workbook on the server (16 Nov 2026; shared/service-po.ts).
 * Columns are found by their headers (PO No., Customer Name, FG Item Code, SO
 * Number, Due Date) on the sheet that has them (LOGISTIC_APP today). The file
 * is read again only after it has been saved; a read that fails while a save
 * is under way keeps the last good one. GET /api/service-po?po=… answers for
 * that one PO to anyone signed in; the sheet itself is never sent.
 */

import { readFileSync, statSync } from 'node:fs'
import { Router } from 'express'
import * as XLSX from 'xlsx'
import { dateCell, headerKey, textCell } from '../../../shared/otif-read'
import { poKey, type ServicePoMatch, type ServicePoResponse } from '../../../shared/service-po'
import type { Logger } from '../../logger'

const HEADERS = {
  po: ['PO No.', 'PO No', 'PO Number', 'Production Order No'],
  customer: ['Customer Name'],
  fg: ['FG Item Code', 'FG Code', 'Item Code'],
  so: ['SO Number', 'SO No', 'Sales Order No', 'Sales Order Number'],
  due: ['Due Date', 'SO Due Date', 'Sales Order Due Date'],
} as const
type Field = keyof typeof HEADERS

/** Every PO in the workbook by its number. Throws when no sheet has a PO column. */
export function readServicePos(buffer: Buffer): Map<string, ServicePoMatch> {
  const workbook = XLSX.read(buffer, { type: 'buffer', dense: true, cellText: false, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false })
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false })
    for (let h = 0; h < Math.min(rows.length, 20); h++) {
      const keys = (rows[h] ?? []).map(headerKey)
      const col = {} as Record<Field, number>
      for (const field of Object.keys(HEADERS) as Field[]) col[field] = HEADERS[field].map(headerKey).map((k) => keys.indexOf(k)).find((i) => i >= 0) ?? -1
      if (col.po < 0) continue
      const out = new Map<string, ServicePoMatch>()
      const cell = (row: unknown[], field: Field) => (col[field] >= 0 ? row[col[field]] : null)
      for (const row of rows.slice(h + 1)) {
        const key = poKey(cell(row, 'po'))
        if (!key) continue
        out.set(key, {
          poNo: key,
          customerName: textCell(cell(row, 'customer')),
          salesOrderNo: textCell(cell(row, 'so')),
          fgCode: textCell(cell(row, 'fg')),
          dueDate: dateCell(cell(row, 'due'), date1904),
        })
      }
      return out
    }
  }
  throw new Error('No sheet in Service-AutoPO has a "PO No." column.')
}

export function servicePoRoutes(path: string | undefined, logger: Logger): Router {
  const router = Router()
  let cache: { modifiedAt: number; pos: Map<string, ServicePoMatch> } | null = null

  const load = (): { pos: Map<string, ServicePoMatch> | null; error: string | null } => {
    if (!path) return { pos: null, error: null }
    let modifiedAt: number
    try {
      modifiedAt = statSync(path).mtimeMs
    } catch {
      return cache ? { pos: cache.pos, error: null } : { pos: null, error: 'The Service-AutoPO file is not there.' }
    }
    if (cache?.modifiedAt === modifiedAt) return { pos: cache.pos, error: null }
    try {
      const pos = readServicePos(readFileSync(path))
      cache = { modifiedAt, pos }
      logger.info('service po: Service-AutoPO read', { pos: pos.size })
      return { pos, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read the Service-AutoPO file.'
      logger.warn('service po: Service-AutoPO not read', { error: message })
      return cache ? { pos: cache.pos, error: null } : { pos: null, error: message }
    }
  }

  router.get('/', (req, res) => {
    const { pos, error } = load()
    const key = poKey(req.query.po)
    const body: ServicePoResponse = { configured: Boolean(path), error, match: key && pos ? pos.get(key) ?? null : null }
    res.json(body)
  })
  return router
}
