/**
 * Excel downloads for the Weekly KPI module.
 *
 * Kept apart from transform.ts so the sheet library is only loaded where a
 * download actually happens.
 */

import * as XLSX from 'xlsx'

type Cell = string | number | null

/** Writes one workbook, one sheet per entry, and hands it to the browser. */
export function downloadWorkbook(fileName: string, sheets: { name: string; rows: Cell[][] }[]): void {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
    // Wide enough to read the headers without dragging every column open.
    worksheet['!cols'] = (sheet.rows[0] ?? []).map((header) => ({ wch: Math.max(12, String(header ?? '').length + 2) }))
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(workbook, fileName)
}

/** "11 Sep 2026 09-40" — safe in a file name. */
export function fileStamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const month = d.toLocaleString('en-IN', { month: 'short' })
  return `${pad(d.getDate())} ${month} ${d.getFullYear()} ${pad(d.getHours())}-${pad(d.getMinutes())}`
}
