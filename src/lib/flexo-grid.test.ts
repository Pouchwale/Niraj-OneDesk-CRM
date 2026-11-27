import { describe, expect, it } from 'vitest'

import { GRID_COLUMNS, GRID_MIN_ROWS, copyLines, insertLines, isBlankLine, linesToTsv, padLines, tsvToLines } from './flexo-grid'
import { blankFlexoLine, type FlexoRateLine } from './flexo-rate-sheet'
import { DEFAULT_QUOTATION_CONFIG } from './quotation-config'

const lists = DEFAULT_QUOTATION_CONFIG.lists
let n = 0
const id = () => `t${++n}`

/** SAP's sheet 5381 (the user's screenshot), first line. */
const sleeve: FlexoRateLine = {
  ...blankFlexoLine('a'),
  jobName: 'Shrink Sleeve', netContent: '-', finalRate: 0, cutLength: 285.75, width: 291, layFlatWidth: 144, acrossUps: 1, aroundUps: 1,
  acrossGap: 6, moq: 5000, teeth: 90, set: 'No', colors: 8, coatingType: 'Shrink Sleeve White', material: '40 Micron PET',
  valueAddition: 'None', inkCoverageArea: 100, valueAddCoverageArea: 0, deliveryZone: 'Gujarat', jobLevel: 'Level 1', itemType: 'Sleeve', profitOverhead: 35,
}

describe('Quotation Sheet grid: copy and paste', () => {
  it('has SAP’s 22 line columns in SAP’s order', () => {
    expect(GRID_COLUMNS.map((c) => c.label).slice(0, 18)).toEqual([
      'Job Name', 'Net Content', 'Final Rate', 'Length/Cut Length', 'Width/Open Size', 'Lay Flat Width', 'Across Ups', 'Around Ups',
      'Across Gap', 'MOQ 1', 'Teeth', 'Set?', 'Colors', 'Coating Type', 'Material', 'Value Addition 1', 'Ink Coverage Area', 'Value Add Coverage Area',
    ])
    expect(GRID_COLUMNS).toHaveLength(22)
  })

  it('copies rows and pastes them back exactly, as new lines', () => {
    const second = { ...sleeve, id: 'b', moq: 10000 }
    const text = linesToTsv([sleeve, second])
    expect(text.split('\r\n')).toHaveLength(2)
    const back = tsvToLines(text, lists, id)!
    expect(back).toHaveLength(2)
    expect(back.map(({ id: _, ...rest }) => rest)).toEqual([sleeve, second].map(({ id: _, ...rest }) => rest))
    expect(new Set(back.map((l) => l.id)).size).toBe(2)
    expect(back.every((l) => l.id !== 'a' && l.id !== 'b')).toBe(true)
  })

  it('takes rows from Excel: descriptions or codes in any capitals, numbers with commas, a # column and a heading row', () => {
    const heading = ['#', ...GRID_COLUMNS.map((c) => c.label)].join('\t')
    const row = ['1', 'Label A', '10kg', '0', '203', '266', '', '1', '4', '4', '1,00,000', '66', 'no', '8', 'gloss uv', '80 gsm chromo', 'NONE', '100', '0', 'gujarat', 'level 1', 'label', '45'].join('\t')
    const lines = tsvToLines(`${heading}\r\n${row}\r\n`, lists, id)!
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ jobName: 'Label A', moq: 100000, set: 'No', coatingType: 'Gloss UV', material: '80 GSM Chromo', valueAddition: 'None', deliveryZone: 'Gujarat', jobLevel: 'Level 1', itemType: 'Label', layFlatWidth: null, profitOverhead: 45 })
  })

  it('always shows a page of empty rows, as SAP does, without saving them', () => {
    const padded = padLines([sleeve], id)
    expect(padded).toHaveLength(GRID_MIN_ROWS)
    expect(padded[0]).toBe(sleeve)
    expect(padded.slice(1).every(isBlankLine)).toBe(true)
    const many = Array.from({ length: 20 }, (_, i) => ({ ...sleeve, id: `m${i}` }))
    expect(padLines(many, id)).toBe(many)
    // Pasting into the first empty row fills it; the page of empty rows stays.
    const pasted = copyLines([sleeve], id)
    const next = padLines(insertLines(padded, pasted, padded[1].id), id)
    expect(next.slice(0, 2).map((l) => l.jobName)).toEqual(['Shrink Sleeve', 'Shrink Sleeve'])
    expect(next).toHaveLength(GRID_MIN_ROWS)
  })

  it('leaves a single plain value to the cell', () => {
    expect(tsvToLines('5000', lists, id)).toBeNull()
    expect(tsvToLines('Gloss UV', lists, id)).toBeNull()
  })

  it('puts copies below the chosen line, filling an empty line instead of leaving it', () => {
    const a = { ...sleeve, id: 'a' }, b = { ...sleeve, id: 'b', moq: 10000 }, empty = blankFlexoLine('e')
    const copies = copyLines([a], id)
    expect(insertLines([a, b], copies, 'a').map((l) => l.id)).toEqual(['a', copies[0].id, 'b'])
    expect(insertLines([a, empty], copies, 'e').map((l) => l.id)).toEqual(['a', copies[0].id])
    expect(insertLines([empty], copies, null).map((l) => l.id)).toEqual([copies[0].id])
    expect(isBlankLine(empty)).toBe(true)
    expect(isBlankLine(a)).toBe(false)
  })
})
