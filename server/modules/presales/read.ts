/**
 * Reads the Pre-Sales-Order-CRM workbook into order lines (14 Nov 2026).
 *
 * Columns are found by their header (Customer Code, Customer Name,
 * Coordinator Name, SO Series, SO No, SO Date, Item Code, Item Name,
 * Quantity), on the sheet named in the settings or the first sheet that has
 * them. Dates are read from Excel's day numbers, so no time zone can move
 * them.
 */

import * as XLSX from 'xlsx'
import type { PresalesLine } from '../../../shared/presales'

export interface PresalesRead {
  sheet: string
  lines: PresalesLine[]
  names: Map<string, string>
  /** The coordinator name on each customer's latest order. */
  fileCoordinator: Map<string, string>
  skipped: number
}

const key = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const HEADERS = {
  code: ['customercode', 'cardcode', 'bpcode'],
  name: ['customername', 'cardname'],
  coordinator: ['coordinatorname', 'coordinator'],
  series: ['soseries', 'series'],
  soNo: ['sono', 'sonumber', 'docnum'],
  date: ['sodate', 'docdate', 'date'],
  itemCode: ['itemcode'],
  itemName: ['itemname', 'description'],
  qty: ['quantity', 'qty'],
} as const
type Field = keyof typeof HEADERS
const REQUIRED: Field[] = ['code', 'soNo', 'date', 'qty']

const pad = (n: number) => String(n).padStart(2, '0')

/** An Excel day number, a date string (m/d/yy, d-m-yyyy or yyyy-mm-dd) or a Date, as yyyy-mm-dd; null when it is none. */
export function dayOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    const p = XLSX.SSF.parse_date_code(value)
    return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  if (typeof value === 'string') {
    const t = value.trim()
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    // The sheet's text dates are month/day/year ("10/13/26 0:00").
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      return `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`
    }
  }
  return null
}

export function readPresales(buffer: Buffer, wantedSheet?: string | null): PresalesRead {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const order = wantedSheet && wb.SheetNames.includes(wantedSheet) ? [wantedSheet] : wb.SheetNames
  for (const sheet of order) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: null, raw: true })
    const headerAt = rows.findIndex((r) => Array.isArray(r) && r.some((c) => HEADERS.code.includes(key(c) as never)))
    if (headerAt < 0) continue
    const header = rows[headerAt].map(key)
    const col = {} as Record<Field, number>
    for (const field of Object.keys(HEADERS) as Field[]) col[field] = header.findIndex((h) => (HEADERS[field] as readonly string[]).includes(h))
    if (REQUIRED.some((f) => col[f] < 0)) continue
    const lines: PresalesLine[] = []
    const names = new Map<string, string>()
    const fileCoordinator = new Map<string, { day: string; name: string }>()
    let skipped = 0
    for (const row of rows.slice(headerAt + 1)) {
      if (!Array.isArray(row) || row.every((c) => c === null || c === '')) continue
      const code = String(row[col.code] ?? '').trim().toUpperCase()
      const d = dayOf(row[col.date])
      if (!code || !d) {
        skipped++
        continue
      }
      const qty = Number(row[col.qty])
      const series = col.series >= 0 ? String(row[col.series] ?? '').trim() : ''
      const so = String(row[col.soNo] ?? '').trim()
      lines.push({
        c: code,
        so: series ? `${series}/${so}` : so,
        d,
        ic: col.itemCode >= 0 ? String(row[col.itemCode] ?? '').trim() : '',
        in: col.itemName >= 0 ? String(row[col.itemName] ?? '').trim() : '',
        q: Number.isFinite(qty) ? qty : 0,
      })
      if (col.name >= 0 && row[col.name]) names.set(code, String(row[col.name]).trim())
      const coordinator = col.coordinator >= 0 ? String(row[col.coordinator] ?? '').trim() : ''
      const held = fileCoordinator.get(code)
      if (coordinator && (!held || d >= held.day)) fileCoordinator.set(code, { day: d, name: coordinator })
    }
    return { sheet, lines, names, fileCoordinator: new Map([...fileCoordinator].map(([c, v]) => [c, v.name])), skipped }
  }
  throw new Error('No sheet has the Customer Code, SO No, SO Date and Quantity columns.')
}
