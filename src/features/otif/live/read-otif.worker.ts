/**
 * Reads the OTIF-SCORE workbook off the page's thread: the file holds tens of
 * thousands of orders and takes a few seconds to open, which would otherwise
 * freeze the screen. Receives the file's bytes, answers with the rows
 * (src/lib/otif-live.ts) or the reason it could not read them.
 */

import * as XLSX from 'xlsx'
import { readOtifSheets, type OtifReadResult } from '@/lib/otif-live'

export interface ReadOtifRequest {
  buffer: ArrayBuffer
  /** The sheet named in the settings (EXCEL_OTIF_SHEET), if any. */
  sheet: string | null
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ReadOtifRequest>) => void) | null
  postMessage: (message: OtifReadResult) => void
}

scope.onmessage = (event) => {
  let result: OtifReadResult
  try {
    // Values only: no formatted text, formulas or styles, which roughly halves the time.
    const workbook = XLSX.read(event.data.buffer, {
      type: 'array',
      dense: true,
      cellText: false,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
    })
    const sheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false }),
    }))
    result = readOtifSheets(sheets, { wantedSheet: event.data.sheet, date1904: Boolean(workbook.Workbook?.WBProps?.date1904) })
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : 'Could not read the OTIF file.' }
  }
  scope.postMessage(result)
}
