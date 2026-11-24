/**
 * The OTIF file as the Service score reads it (16 Nov 2026): each
 * coordinator's different POs closed per month by PO Closed Date (customers
 * until 24 Nov 2026; shared/service-otif.ts). The server opens the workbook with
 * the same reading the OTIF page uses (shared/otif-read.ts), only again after
 * the file has been saved (about 4 seconds for the whole file), and keeps
 * just the three columns it counts. The file's Relation Manager is matched to
 * a CRM coordinator by full or first name (the Pre Sales matcher).
 */

import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { readOtifSheets } from '../../../shared/otif-read'
import type { OtifLiveRow } from '../../../shared/otif-reports'
import { countOtifCustomers, type ServiceOtifResponse } from '../../../shared/service-otif'
import type { ExcelBookConfig } from '../../config'
import type { Logger } from '../../logger'
import type { ExcelService } from '../excel/service'
import { coordinatorMatcher } from '../presales/match'

type Row = Pick<OtifLiveRow, 'poNo' | 'poClosedDate' | 'relationManager'>

interface Deps {
  excel: ExcelService
  config: ExcelBookConfig | undefined
  coordinators: () => { id: string; name: string }[]
  logger: Logger
  now?: () => Date
}

export interface OtifCustomerSource {
  /** The counts as the file stands now (read again only after a save). */
  get(): ServiceOtifResponse
}

/** The rows of an OTIF workbook, as the OTIF page reads them; throws when the sheet is not there or lacks a column. */
export function readOtifRows(buffer: Buffer, sheet: string | null | undefined): Row[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', dense: true, cellText: false, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false })
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false }),
  }))
  const read = readOtifSheets(sheets, { wantedSheet: sheet ?? null, date1904: Boolean(workbook.Workbook?.WBProps?.date1904) })
  if (!read.ok) throw new Error(read.error)
  return read.rows.map((r) => ({ poNo: r.poNo, poClosedDate: r.poClosedDate, relationManager: r.relationManager }))
}

export function createOtifCustomerSource(deps: Deps): OtifCustomerSource {
  const now = deps.now ?? (() => new Date())
  let file: { modifiedAt: string; rows: Row[]; at: string } | null = null
  let tally: { key: string; value: ReturnType<typeof countOtifCustomers> } | null = null

  return {
    get() {
      const status = deps.excel.status('otif')
      const base = { configured: status.configured && Boolean(deps.config), fileModifiedAt: status.modifiedAt }
      if (!base.configured || !deps.config) return { ...base, error: null, readAt: null, counts: null, weeks: null, unmatched: null }
      let error: string | null = null
      if (!status.exists || !status.modifiedAt) error = status.error ?? 'The OTIF file is not there.'
      else if (file?.modifiedAt !== status.modifiedAt) {
        try {
          const rows = readOtifRows(readFileSync(deps.config.path), deps.config.sheet)
          file = { modifiedAt: status.modifiedAt, rows, at: now().toISOString() }
          deps.logger.info('service otif: OTIF file read', { rows: rows.length })
        } catch (err) {
          // A save in progress can leave the file half written: the last good read stands.
          const message = err instanceof Error ? err.message : 'Could not read the OTIF file.'
          deps.logger.warn('service otif: OTIF file not read', { error: message })
          if (!file) error = message
        }
      }
      if (!file) return { ...base, error: error ?? 'The OTIF file could not be read.', readAt: null, counts: null, weeks: null, unmatched: null }
      const people = deps.coordinators()
      const key = `${file.modifiedAt}|${people.map((p) => `${p.id}:${p.name}`).join(',')}`
      if (tally?.key !== key) tally = { key, value: countOtifCustomers(file.rows, coordinatorMatcher(people)) }
      return { ...base, error: null, readAt: file.at, counts: tally.value.counts, weeks: tally.value.weeks, unmatched: tally.value.unmatched }
    },
  }
}
