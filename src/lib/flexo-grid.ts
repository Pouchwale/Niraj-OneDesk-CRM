/**
 * Quotation Sheet lines as SAP's grid (27 Nov 2026, the user's request): the
 * 22 line columns in SAP's order, and the copy and paste the coordinators use
 * in SAP. Copied rows go on the clipboard as tab-separated text (one line per
 * row, columns in this order), so they paste back into the grid, into Excel,
 * or from Excel into the grid. Pure: no React.
 */

import { ITEM_TYPES, JOB_LEVELS, SETS, blankFlexoLine, type Choice, type FlexoRateLine } from './flexo-rate-sheet'
import type { QuotationLists } from './quotation-config'

export type GridKind = 'text' | 'number' | 'rate' | Choice[] | keyof QuotationLists
export type GridKey = Exclude<keyof FlexoRateLine, 'id'>

/** SAP's line columns, labels and order (Flexo Rate Sheet screen), with a cell width in px. */
export const GRID_COLUMNS: { key: GridKey; label: string; kind: GridKind; width: number }[] = [
  { key: 'jobName', label: 'Job Name', kind: 'text', width: 130 },
  { key: 'netContent', label: 'Net Content', kind: 'text', width: 80 },
  { key: 'finalRate', label: 'Final Rate', kind: 'rate', width: 72 },
  { key: 'cutLength', label: 'Length/Cut Length', kind: 'number', width: 112 },
  { key: 'width', label: 'Width/Open Size', kind: 'number', width: 102 },
  { key: 'layFlatWidth', label: 'Lay Flat Width', kind: 'number', width: 90 },
  { key: 'acrossUps', label: 'Across Ups', kind: 'number', width: 74 },
  { key: 'aroundUps', label: 'Around Ups', kind: 'number', width: 78 },
  { key: 'acrossGap', label: 'Across Gap', kind: 'number', width: 74 },
  { key: 'moq', label: 'MOQ 1', kind: 'number', width: 64 },
  { key: 'teeth', label: 'Teeth', kind: 'number', width: 50 },
  { key: 'set', label: 'Set?', kind: SETS, width: 52 },
  { key: 'colors', label: 'Colors', kind: 'number', width: 52 },
  { key: 'coatingType', label: 'Coating Type', kind: 'coatingTypes', width: 112 },
  { key: 'material', label: 'Material', kind: 'materials', width: 124 },
  { key: 'valueAddition', label: 'Value Addition 1', kind: 'valueAdditions', width: 106 },
  { key: 'inkCoverageArea', label: 'Ink Coverage Area', kind: 'number', width: 108 },
  { key: 'valueAddCoverageArea', label: 'Value Add Coverage Area', kind: 'number', width: 110 },
  { key: 'deliveryZone', label: 'Delivery Zone', kind: 'deliveryZones', width: 112 },
  { key: 'jobLevel', label: 'Job Level', kind: JOB_LEVELS, width: 72 },
  { key: 'itemType', label: 'Item Type', kind: ITEM_TYPES, width: 68 },
  { key: 'profitOverhead', label: 'Profit + Overhead', kind: 'number', width: 104 },
]

export const choicesOf = (kind: GridKind, lists: QuotationLists): Choice[] | null =>
  Array.isArray(kind) ? kind : kind in lists ? lists[kind as keyof QuotationLists] : null

/** A line nobody has typed anything into, which SAP would not save either. */
export function isBlankLine(l: FlexoRateLine): boolean {
  const blank = blankFlexoLine(l.id)
  return GRID_COLUMNS.every((c) => (c.key === 'finalRate' ? !l.finalRate : l[c.key] === blank[c.key] || l[c.key] === null || l[c.key] === ''))
}

/** Empty rows the grid always shows, as SAP's grid shows a page of them ready to type in. Empty rows are never saved. */
export const GRID_MIN_ROWS = 15

/** The lines topped up with empty rows to GRID_MIN_ROWS. */
export function padLines(lines: FlexoRateLine[], newId: () => string, min = GRID_MIN_ROWS): FlexoRateLine[] {
  if (lines.length >= min) return lines
  return [...lines, ...Array.from({ length: min - lines.length }, () => blankFlexoLine(newId()))]
}

/** Copies of the lines with new ids (Duplicate, and paste). */
export const copyLines = (lines: FlexoRateLine[], newId: () => string): FlexoRateLine[] => lines.map((l) => ({ ...l, id: newId() }))

/** Puts `added` after the line with id `afterId` (at the end when not found); a blank line there is replaced. */
export function insertLines(lines: FlexoRateLine[], added: FlexoRateLine[], afterId: string | null): FlexoRateLine[] {
  const at = afterId ? lines.findIndex((l) => l.id === afterId) : -1
  // At the end: empty lines (never saved anyway) give way to the pasted ones.
  if (at === -1) return [...lines.filter((l) => !isBlankLine(l)), ...added]
  const target = lines[at]
  return isBlankLine(target) ? [...lines.slice(0, at), ...added, ...lines.slice(at + 1)] : [...lines.slice(0, at + 1), ...added, ...lines.slice(at + 1)]
}

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' '))

/** Lines as tab-separated text, columns in GRID_COLUMNS order (what Ctrl+C puts on the clipboard). */
export function linesToTsv(lines: FlexoRateLine[]): string {
  return lines.map((l) => GRID_COLUMNS.map((c) => cellText(l[c.key])).join('\t')).join('\r\n')
}

/** A dropdown value from pasted text: its code, or the code whose description it is (any capitals). Unknown text is kept as typed. */
function choiceValue(text: string, choices: Choice[]): string {
  const t = text.trim()
  if (!t) return ''
  const lower = t.toLowerCase()
  return choices.find((c) => c.code.toLowerCase() === lower)?.code ?? choices.find((c) => c.description.toLowerCase() === lower)?.code ?? t
}

/** A number from pasted text ("1,00,000" and "285.75" both work); empty or not a number is no value. */
function numberValue(text: string): number | null {
  const t = text.trim().replace(/,/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Pasted text (from this grid or from Excel) as new lines. Rows are split on
 * line breaks, cells on tabs, in SAP's column order. A leading "#" column of
 * row numbers (SAP's first column) and a heading row are skipped. Returns
 * null when the text is not grid rows (one plain value: let the cell take it).
 */
export function tsvToLines(text: string, lists: QuotationLists, newId: () => string): FlexoRateLine[] | null {
  const rows = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((r) => r.split('\t'))
  if (rows.length === 0 || (rows.length === 1 && rows[0].length < 2)) return null
  const out: FlexoRateLine[] = []
  for (let cells of rows) {
    if (cells.every((c) => c.trim() === '')) continue
    if (cells[0].trim().toLowerCase() === 'job name' || cells[0].trim() === '#') continue
    // SAP's "#" column: a row number before the Job Name when the row has one cell too many.
    if (cells.length === GRID_COLUMNS.length + 1 && /^\d+$/.test(cells[0].trim())) cells = cells.slice(1)
    const line = blankFlexoLine(newId())
    GRID_COLUMNS.forEach((c, i) => {
      const raw = cells[i] ?? ''
      const choices = choicesOf(c.kind, lists)
      const value = choices ? choiceValue(raw, choices) : c.kind === 'text' ? raw.trim() : c.kind === 'rate' ? numberValue(raw) ?? 0 : numberValue(raw)
      ;(line as unknown as Record<string, unknown>)[c.key] = value
    })
    out.push(line)
  }
  return out
}
