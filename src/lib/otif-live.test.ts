import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { computeDelayBucket } from './file-parser'
import {
  byRelationManager,
  compareReads,
  dateCell,
  delayBucketOf,
  departmentCell,
  filterRows,
  latestWeekWithRows,
  liveSummary,
  mapOtifHeaders,
  weekStartOf,
  NO_LIVE_FILTERS,
  NOT_CLOSED,
  NOT_SET,
  numberCell,
  OTIF_LIVE_COLUMNS,
  otifCell,
  readOtifSheets,
  rowsInWeek,
  serialToIso,
  summariseRead,
  textCell,
  weeklyTrend,
  type OtifLiveRow,
} from './otif-live'

/** The OTIF-SCORE sheet's header row as it is on 7 Nov 2026. */
const LIVE_HEADERS = [
  'Production Order No', 'PO Date', 'PO Closed Date', 'Customer Name', 'Sales Order No', 'Sales Order Date', 'Sales Order Due Date', 'Order Type',
  'Relation Manager', 'Production Order Due Date', 'Planned Qty', 'Completed Qty', 'Open Order Qty', 'OTIF Score', 'Department', 'Day Commited',
  'DelayDays', 'OTIF', 'OTIF %',
]
const serial = (iso: string) => (Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) - Date.UTC(1899, 11, 30)) / 86_400_000

/** A sheet row in the live layout. */
function liveRow(o: {
  po: number | string
  closed?: string | null
  customer?: string
  so?: number
  soDate?: string
  soDue?: string
  rm?: string | null
  due?: string
  open?: number
  otif?: string
  dept?: string
  committed?: number
  delay?: number | null
}): unknown[] {
  return [
    o.po, serial('2026-11-01'), o.closed ? serial(o.closed) : null, o.customer ?? 'Acme Pvt Ltd', o.so ?? 34000, serial(o.soDate ?? '2026-10-30'), serial(o.soDue ?? '2026-11-20'),
    'Repeat Order', o.rm === undefined ? 'Krina Shah' : o.rm, serial(o.due ?? '2026-11-05'), 1000, 1000, o.open ?? 0, o.otif ?? 'YES', o.dept ?? 'FG - Label',
    o.committed ?? 7, o.delay === undefined ? -2 : o.delay, o.otif === 'NO' ? 0 : 1, 32.98,
  ]
}

describe('cells', () => {
  it('reads an Excel date serial exactly as Excel (and SheetJS) does', () => {
    for (let s = 61; s <= 80_000; s += 7) {
      const d = XLSX.SSF.parse_date_code(s)
      expect(serialToIso(s)).toBe(`${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`)
    }
    expect(serialToIso(46329)).toBe('2026-11-03')
    expect(serialToIso(46329.75)).toBe('2026-11-03')
    expect(serialToIso(1)).toBe('1900-01-01')
    expect(serialToIso(0)).toBeNull()
    expect(serialToIso(Number.NaN)).toBeNull()
  })

  it('reads the 1904 date system', () => {
    for (let s = 0; s <= 60_000; s += 11) {
      const d = XLSX.SSF.parse_date_code(s, { date1904: true })
      expect(serialToIso(s, true)).toBe(`${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`)
    }
  })

  it('reads dates written as text or as dates', () => {
    expect(dateCell('2026-11-03')).toBe('2026-11-03')
    expect(dateCell('03-11-2026')).toBe('2026-11-03')
    expect(dateCell('03/11/2026')).toBe('2026-11-03')
    expect(dateCell('3.11.2026')).toBe('2026-11-03')
    expect(dateCell('31-02-2026')).toBeNull()
    expect(dateCell('soon')).toBeNull()
    expect(dateCell(null)).toBeNull()
    expect(dateCell('')).toBeNull()
    expect(dateCell(new Date(Date.UTC(2026, 10, 3)))).toBe('2026-11-03')
    expect(dateCell(new Date(2026, 10, 3, 0, 0, 0))).toBe('2026-11-03')
  })

  it('reads numbers, text, OTIF and department', () => {
    expect(numberCell(-13100)).toBe(-13100)
    expect(numberCell('1,200')).toBe(1200)
    expect(numberCell('-5')).toBe(-5)
    expect(numberCell('n/a')).toBeNull()
    expect(numberCell(null)).toBeNull()
    expect(textCell(91947)).toBe('91947')
    expect(textCell('  Dabur  India ')).toBe('Dabur India')
    expect(textCell('   ')).toBeNull()
    expect(otifCell('YES')).toBe('YES')
    expect(otifCell(' no ')).toBe('NO')
    expect(otifCell(1)).toBeNull()
    expect(departmentCell('FG- Laminates')).toBe('FG - Laminates')
    expect(departmentCell('FG - Label')).toBe('FG - Label')
    expect(departmentCell('Service')).toBe('Service')
  })
})

describe('headers', () => {
  it('finds every field in the live sheet, and never the look-alike columns', () => {
    const { columns, missing } = mapOtifHeaders(LIVE_HEADERS)
    expect(missing).toEqual([])
    expect(columns.poNo).toBe(LIVE_HEADERS.indexOf('Production Order No'))
    expect(columns.poDueDate).toBe(LIVE_HEADERS.indexOf('Production Order Due Date')) // not Sales Order Due Date
    expect(columns.otifScore).toBe(LIVE_HEADERS.indexOf('OTIF Score')) // not OTIF or OTIF %
    expect(columns.delayDays).toBe(LIVE_HEADERS.indexOf('DelayDays'))
    expect(columns.soDate).toBe(LIVE_HEADERS.indexOf('Sales Order Date'))
    expect(columns.department).toBe(LIVE_HEADERS.indexOf('Department'))
  })

  it('also answers to the short names the team uses', () => {
    const short = ['PO No.', 'SO No', 'SO Date', 'PO Due Date', 'PO Closed Date', 'Delay Day', 'Day Commited', 'Customer Name', 'Open Order Qty', 'OTIF Score', 'Relation Manager']
    const { columns, missing } = mapOtifHeaders(short)
    expect(missing).toEqual([])
    expect(Object.keys(columns)).toHaveLength(11)
  })

  it('names what is missing', () => {
    expect(mapOtifHeaders(LIVE_HEADERS.filter((h) => h !== 'OTIF Score' && h !== 'Relation Manager')).missing).toEqual(['OTIF Score', 'Relation Manager'])
  })
})

describe('reading the workbook', () => {
  it('reads every row exactly as the sheet writes it', () => {
    const result = readOtifSheets([
      {
        name: 'Claude OTIF Score',
        rows: [
          LIVE_HEADERS,
          liveRow({ po: 91947, closed: '2026-11-05', customer: 'Aculife Healthcare', so: 34264, soDate: '2026-11-03', due: '2026-11-10', open: -13100, delay: -5, committed: 7, rm: 'Devyani Vaghela' }),
          [null, null, null],
          liveRow({ po: 91823, closed: null, otif: 'NO', delay: null, rm: null, dept: 'FG- Laminates' }),
          liveRow({ po: '', customer: 'No PO' }),
        ],
      },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sheetName).toBe('Claude OTIF Score')
    expect(result.total).toBe(3)
    expect(result.skipped).toBe(1)
    expect(result.rows[0]).toEqual({
      poNo: '91947',
      soNo: '34264',
      soDate: '2026-11-03',
      poDueDate: '2026-11-10',
      poClosedDate: '2026-11-05',
      delayDays: -5,
      dayCommitted: 7,
      customerName: 'Aculife Healthcare',
      openOrderQty: -13100,
      otifScore: 'YES',
      relationManager: 'Devyani Vaghela',
      department: 'FG - Label',
    })
    expect(result.rows[1]).toMatchObject({ poNo: '91823', poClosedDate: null, delayDays: null, otifScore: 'NO', relationManager: null, department: 'FG - Laminates' })
  })

  it('finds the header row below title rows, and the right sheet', () => {
    const result = readOtifSheets([
      { name: 'Notes', rows: [['Read me'], ['Nothing here']] },
      { name: 'Data', rows: [['OTIF report, week 45'], [], LIVE_HEADERS, liveRow({ po: 1, closed: '2026-11-04' })] },
    ])
    expect(result.ok && result.sheetName).toBe('Data')
    expect(result.ok && result.rows.map((r) => r.poNo)).toEqual(['1'])
  })

  it('refuses a sheet missing a field, and a named sheet that is not there', () => {
    const missing = readOtifSheets([{ name: 'S', rows: [LIVE_HEADERS.filter((h) => h !== 'Day Commited')] }])
    expect(missing).toEqual({ ok: false, error: 'Sheet "S" is missing the column: Day Commited.' })
    const named = readOtifSheets([{ name: 'S', rows: [LIVE_HEADERS] }], { wantedSheet: 'OTIF' })
    expect(named).toEqual({ ok: false, error: 'The workbook has no sheet named "OTIF".' })
    expect(readOtifSheets([{ name: 'S', rows: [['a', 'b']] }]).ok).toBe(false)
  })
})

const row = (o: Partial<OtifLiveRow> & { poNo: string }): OtifLiveRow => ({
  soNo: null,
  soDate: null,
  poDueDate: null,
  poClosedDate: null,
  delayDays: null,
  dayCommitted: null,
  customerName: null,
  openOrderQty: null,
  otifScore: null,
  relationManager: null,
  department: null,
  ...o,
})

describe('weeks and analysis', () => {
  const rows = [
    row({ poNo: 'a', poClosedDate: '2026-11-02', poDueDate: '2026-11-10', soDate: '2026-10-28', otifScore: 'YES', delayDays: -8, relationManager: 'Krina Shah', department: 'FG - Label' }),
    row({ poNo: 'b', poClosedDate: '2026-11-08', poDueDate: '2026-11-05', soDate: '2026-11-02', otifScore: 'NO', delayDays: 3, relationManager: 'Krina Shah', department: 'FG - Sleeves' }),
    row({ poNo: 'c', poClosedDate: '2026-11-09', poDueDate: '2026-11-01', soDate: '2026-10-20', otifScore: 'NO', delayDays: 8, department: 'FG - Label' }),
    row({ poNo: 'd', poClosedDate: null, poDueDate: '2026-11-04', soDate: '2026-11-01', otifScore: 'NO', delayDays: null, relationManager: 'Pragati Patel' }),
  ]

  it('weeks run Saturday to Friday (the company week)', () => {
    expect(weekStartOf('2026-11-02')).toBe('2026-10-31') // Monday
    expect(weekStartOf('2026-11-06')).toBe('2026-10-31') // Friday ends the week
    expect(weekStartOf('2026-11-07')).toBe('2026-11-07') // Saturday starts the next
    expect(weekStartOf('2026-11-08')).toBe('2026-11-07') // Sunday
  })

  it('puts an order in the week of the chosen date', () => {
    expect(rowsInWeek(rows, 'closed', '2026-10-31').map((r) => r.poNo)).toEqual(['a'])
    expect(rowsInWeek(rows, 'closed', '2026-11-07').map((r) => r.poNo)).toEqual(['b', 'c'])
    expect(rowsInWeek(rows, 'due', '2026-10-31').map((r) => r.poNo)).toEqual(['b', 'c', 'd'])
    expect(rowsInWeek(rows, 'so', '2026-10-24').map((r) => r.poNo)).toEqual(['a'])
    expect(rowsInWeek(rows, 'so', '2026-10-31').map((r) => r.poNo)).toEqual(['b', 'd'])
    expect(latestWeekWithRows(rows, 'closed', '2026-11-07')).toBe('2026-11-07')
    expect(latestWeekWithRows(rows, 'closed', '2026-11-06')).toBe('2026-10-31')
    expect(latestWeekWithRows([], 'closed', '2026-11-07')).toBeNull()
  })

  it('buckets delays exactly as an uploaded report does, plus orders still open', () => {
    for (let d = -40; d <= 40; d += 0.5) expect(delayBucketOf({ delayDays: d, poClosedDate: '2026-11-02' })).toBe(computeDelayBucket(d))
    expect(delayBucketOf({ delayDays: null, poClosedDate: null })).toBe(NOT_CLOSED)
    expect(delayBucketOf({ delayDays: null, poClosedDate: '2026-11-02' })).toBe('Unknown')
  })

  it('scores the week: OTIF % = YES ÷ orders', () => {
    const s = liveSummary(rowsInWeek(rows, 'due', '2026-10-31'))
    expect(s.totalPOs).toBe(3)
    expect(s.onTimeCount).toBe(0)
    expect(s.otifPercentage).toBe(0)
    const all = liveSummary(rows)
    expect(all.onTimeCount).toBe(1)
    expect(all.otifPercentage).toBe(25)
    expect(all.byCategory['FG - Label']).toEqual({ total: 2, onTime: 1, pct: 50 })
    expect(all.byCategory['No department'].total).toBe(1)
    expect(all.byBucket).toEqual({ 'On-Time / Early': 1, '1-3 Days Late': 1, '8-10 Days Late': 1, [NOT_CLOSED]: 1 })
  })

  it('filters by department, person and delay', () => {
    expect(filterRows(rows, { ...NO_LIVE_FILTERS, relationManager: 'Krina Shah' }).map((r) => r.poNo)).toEqual(['a', 'b'])
    expect(filterRows(rows, { ...NO_LIVE_FILTERS, relationManager: NOT_SET }).map((r) => r.poNo)).toEqual(['c'])
    expect(filterRows(rows, { ...NO_LIVE_FILTERS, department: 'FG - Label', bucket: '8-10 Days Late' }).map((r) => r.poNo)).toEqual(['c'])
  })

  it('scores each Relation Manager, most orders first', () => {
    expect(byRelationManager(rows)).toEqual([
      { name: 'Krina Shah', total: 2, yes: 1, no: 1, pct: 50 },
      { name: NOT_SET, total: 1, yes: 0, no: 1, pct: 0 },
      { name: 'Pragati Patel', total: 1, yes: 0, no: 1, pct: 0 },
    ])
  })

  it('gives the last weeks, oldest first', () => {
    expect(weeklyTrend(rows, 'closed', '2026-11-07', 3)).toEqual([
      { start: '2026-10-24', total: 0, yes: 0, pct: null },
      { start: '2026-10-31', total: 1, yes: 1, pct: 100 },
      { start: '2026-11-07', total: 2, yes: 0, pct: 0 },
    ])
  })

  it('says what a new read of the file changed', () => {
    const same = rows.map((r) => ({ ...r }))
    expect(compareReads(rows, same)).toEqual({ added: 0, changed: 0, removed: 0 })
    expect(summariseRead({ rows: same, change: compareReads(rows, same) })).toBe('Nothing changed')

    const after = [
      { ...rows[0], otifScore: 'NO' as const }, // changed
      rows[1],
      // rows[2] gone
      rows[3],
      row({ poNo: 'e', poClosedDate: '2026-11-07', otifScore: 'YES' }), // new
      row({ poNo: 'f', poClosedDate: '2026-11-07', otifScore: 'NO' }), // new
    ]
    const change = compareReads(rows, after)
    expect(change).toEqual({ added: 2, changed: 1, removed: 1 })
    expect(summariseRead({ rows: after, change })).toBe('2 new, 1 changed, 1 gone')
    expect(summariseRead({ rows: after, change: null })).toBe('5 orders')
  })

  it('counts a PO No. that repeats in the sheet row by row', () => {
    const twice = [rows[0], { ...rows[0] }]
    expect(compareReads(twice, [rows[0]])).toEqual({ added: 0, changed: 0, removed: 1 })
    expect(compareReads([rows[0]], twice)).toEqual({ added: 1, changed: 0, removed: 0 })
    expect(compareReads(twice, [rows[0], { ...rows[0], openOrderQty: 5 }])).toEqual({ added: 0, changed: 1, removed: 0 })
  })

  it('keeps the team’s fields in their order (the PDF report’s order table follows it)', () => {
    expect(OTIF_LIVE_COLUMNS.map((c) => c.label)).toEqual(['PO No.', 'SO No', 'SO Date', 'PO Due Date', 'PO Closed Date', 'Delay Day', 'Day Commited', 'Customer Name', 'Open Order Qty', 'OTIF Score', 'Relation Manager', 'Department'])
  })
})
