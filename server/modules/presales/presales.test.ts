/**
 * Pre Sales Analysis on the server (14 Nov 2026): the workbook is read by its
 * headers; a coordinator gets only the customers the CRM assigns to them; the
 * team leader gets everyone (customers not in the CRM as not assigned); a
 * coordinator can mark only their own customers reminded.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import * as XLSX from 'xlsx'

import { createApp } from '../../app'
import { loadConfig } from '../../config'
import { createLogger } from '../../logger'
import { AUTH_ROUTES } from '../../../shared/auth'
import { PRESALES_ROUTE, type PresalesResponse } from '../../../shared/presales'
import { coordinatorMatcher } from './match'
import { dayOf, readPresales } from './read'

const root = mkdtempSync(join(tmpdir(), 'presales-'))
const quiet = createLogger({ level: 'error', write: () => undefined })

const HEADER = ['Customer Code', 'Customer Name', 'Coordinator Name', 'SO Series', 'SO No', 'SO Date', 'SO Year', 'SO Month', 'Item Code', 'Item Name', 'Quantity']
const workbook = (rows: unknown[][]) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...rows]), 'Pre_sales_order_CRM')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
// Excel day numbers: 45964 = 3 Nov 2025, 46329 = 3 Nov 2026.
const ROWS = [
  ['C0001', 'Mine Ltd', 'Pragati', '202526', '100', 45964, 2025, 11, 'IT1', 'Pouch A', 1000],
  ['c0001 ', 'Mine Ltd', 'PRAGATI', '202526', '100', 45964, 2025, 11, 'IT2', 'Pouch B', 500],
  ['C0002', 'Someone Else Ltd', 'Krina', '202526', '101', 45964, 2025, 11, 'IT1', 'Pouch A', 200],
  ['C0003', 'Not In CRM Ltd', 'Old Person', '202627', '200', 46329, 2026, 11, 'IT9', 'Label', 50],
  // Not in the CRM either, but the file names Pragati on its latest order.
  ['C0004', 'Paid Up Ltd', 'Krina', '202425', '50', 45600, 2024, 11, 'IT3', 'Sleeve', 10],
  ['C0004', 'Paid Up Ltd', 'PRAGATI ', '202526', '150', 45964, 2025, 11, 'IT3', 'Sleeve', 20],
  [null, 'No Code', 'X', '202627', '201', 46329, 2026, 11, 'IT9', 'Label', 5],
]

describe('reading the workbook', () => {
  it('reads dates as Excel day numbers or text, and finds the columns by header', () => {
    expect(dayOf(45964)).toBe('2025-11-03')
    expect(dayOf('10/13/26 0:00')).toBe('2026-10-13')
    expect(dayOf('2026-01-05')).toBe('2026-01-05')
    expect(dayOf('nonsense')).toBeNull()
    const read = readPresales(workbook(ROWS))
    expect(read.sheet).toBe('Pre_sales_order_CRM')
    expect(read.skipped).toBe(1)
    expect(read.lines[1]).toEqual({ c: 'C0001', so: '202526/100', d: '2025-11-03', ic: 'IT2', in: 'Pouch B', q: 500 })
    expect(read.fileCoordinator.get('C0003')).toBe('Old Person')
  })
})

describe('matching the file’s coordinator names', () => {
  const match = coordinatorMatcher([
    { id: 'k', name: 'Krina Shah' },
    { id: 'p', name: 'Pragati Patel' },
    { id: 'da', name: 'Disha Acharya' },
    { id: 'dc', name: 'Disha Chaudhary' },
  ])
  it('matches a full name or a first name, case and spacing aside', () => {
    expect(match('Krina')).toBe('k')
    expect(match('KRINA SHAH')).toBe('k')
    expect(match(' krina ')).toBe('k')
    expect(match('Pragati Patel')).toBe('p')
    expect(match('Disha Chaudhary')).toBe('dc')
  })
  it('matches no one when the name fits nobody or more than one coordinator', () => {
    expect(match('Disha')).toBeNull()
    expect(match('Chirag')).toBeNull()
    expect(match('Praagti')).toBeNull()
    expect(match('Krina Patel')).toBeNull()
    expect(match(null)).toBeNull()
  })
})

describe('the route', () => {
  let server: ReturnType<typeof createServer>
  let port = 0

  beforeAll(async () => {
    const dataDir = mkdtempSync(join(root, 'data-'))
    const file = join(root, 'Pre-Sales-Order-CRM.xlsx')
    writeFileSync(file, workbook(ROWS))
    // C0001 is Pragati's (coord-1) in Active Payments, C0002 someone else's in Overdue Payments; C0003 has no account.
    writeFileSync(
      join(dataDir, 'store.json'),
      JSON.stringify({
        companies: [{ id: 'co1', sap_bp_code: 'C0001', name: 'Mine Ltd', assigned_coordinator_id: 'coord-1' }],
        overduePayments: [{ id: 'op1', bp_code: 'C0002', customer_name: 'Someone Else Ltd', assigned_coordinator_id: 'coord-2' }],
      })
    )
    const config = loadConfig({ AUTH_DIR: mkdtempSync(join(root, 'auth-')), DATA_DIR: dataDir, SNAPSHOT_DIR: mkdtempSync(join(root, 'snap-')), EXCEL_PRESALES_PATH: file })
    server = createServer(createApp(config, quiet))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const signIn = async (username: string, password: string) => {
    const res = await fetch(`http://127.0.0.1:${port}${AUTH_ROUTES.login}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    return res.headers.get('set-cookie')?.split(';')[0] ?? ''
  }
  const call = (cookie: string, path = '', init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}${PRESALES_ROUTE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) } })

  it('is closed to anyone not signed in', async () => {
    expect((await call('')).status).toBe(401)
  })

  it('gives a coordinator only their own customers', async () => {
    const body = (await (await call(await signIn('pragati', 'Pragati@123'))).json()) as PresalesResponse
    expect(body.file).toMatchObject({ configured: true, name: 'Pre-Sales-Order-CRM.xlsx', error: null })
    expect(body.customers).toEqual([
      { code: 'C0001', name: 'Mine Ltd', coordinatorId: 'coord-1', assignedFrom: 'crm', fileCoordinator: 'PRAGATI' },
      // No CRM account: the file names Pragati on its latest order.
      { code: 'C0004', name: 'Paid Up Ltd', coordinatorId: 'coord-1', assignedFrom: 'file', fileCoordinator: 'PRAGATI' },
    ])
    expect(new Set(body.lines.map((l) => l.c))).toEqual(new Set(['C0001', 'C0004']))
  })

  it('gives the team leader everyone, customers with no CRM account as not assigned', async () => {
    const body = (await (await call(await signIn('niki', 'Niki@123'))).json()) as PresalesResponse
    expect(body.customers.map((c) => [c.code, c.coordinatorId, c.assignedFrom]).sort()).toEqual([
      ['C0001', 'coord-1', 'crm'],
      ['C0002', 'coord-2', 'crm'],
      ['C0003', null, null],
      ['C0004', 'coord-1', 'file'],
    ])
    expect(body.lines).toHaveLength(6)
  })

  it('lets a coordinator follow up only their own customers, item by item, checked like the payment follow-ups', async () => {
    const pragati = await signIn('pragati', 'Pragati@123')
    const good = { customerCode: 'c0001', items: ['IT1', 'IT2', 'NOT-THEIRS'], mode: 'call', response: 'order_expected', said: '  Will send the PO next week  ', expectedOrderDate: '2026-11-21', nextDate: '2026-11-22' }
    const follow = (o: Record<string, unknown>, cookie = pragati) => call(cookie, '/followups', { method: 'POST', body: JSON.stringify({ ...good, ...o }) })
    expect((await follow({ customerCode: 'C0002', items: ['IT1'] })).status).toBe(403)
    expect((await follow({ customerCode: 'C0003', items: ['IT9'] })).status).toBe(403)
    expect((await follow({ customerCode: 'C9999' })).status).toBe(400)
    expect((await follow({ items: ['NOT-THEIRS'] })).status).toBe(400)
    expect((await follow({ response: 'maybe' })).status).toBe(400)
    expect((await follow({ said: ' ' })).status).toBe(400)
    expect((await follow({ expectedOrderDate: null })).status).toBe(400)
    const ok = await follow({})
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({
      customerCode: 'C0001',
      items: ['IT1', 'IT2'],
      by: 'coord-1',
      mode: 'call',
      response: 'order_expected',
      said: 'Will send the PO next week',
      expectedOrderDate: '2026-11-21',
      nextDate: '2026-11-22',
    })
    // The expected date only goes with "Order expected on a date".
    expect(await (await follow({ response: 'will_order' })).json()).toMatchObject({ expectedOrderDate: null })
    const body = (await (await call(pragati)).json()) as PresalesResponse
    expect(body.followups.map((f) => f.customerCode)).toEqual(['C0001', 'C0001'])
    // The team leader may follow up a customer with no coordinator found.
    expect((await follow({ customerCode: 'C0003', items: ['IT9'] }, await signIn('niki', 'Niki@123'))).status).toBe(200)
  })

  it('does not hand a coordinator the raw workbook', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/excel/file?book=presales`, { headers: { cookie: await signIn('pragati', 'Pragati@123') } })
    expect(res.status).toBe(403)
  })
})
