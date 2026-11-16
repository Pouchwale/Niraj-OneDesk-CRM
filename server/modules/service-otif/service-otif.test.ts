/**
 * The Service score's Total Customers from OTIF (16 Nov 2026): from November
 * 2026 each coordinator's different customers in the OTIF file with a PO
 * closed that month (Relation Manager); earlier months keep the typed numbers;
 * the mails stay every Service record. Only the team leader and the
 * administrator may read the counts.
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
import { countOtifCustomers, SERVICE_OTIF_ROUTE, type ServiceOtifResponse } from '../../../shared/service-otif'
import { serviceScores } from '../../../src/lib/service-records'
import type { ServiceRecord } from '../../../src/lib/types'
import { coordinatorMatcher } from '../presales/match'

const quiet = createLogger({ level: 'error', write: () => undefined })

describe('counting the OTIF customers', () => {
  const match = coordinatorMatcher([
    { id: 'p', name: 'Pragati Patel' },
    { id: 'k', name: 'Krina Shah' },
  ])
  const row = (closed: string | null, customer: string | null, rm: string | null) => ({ poClosedDate: closed, customerName: customer, relationManager: rm })

  it('counts different customers per coordinator and month by PO Closed Date, from the month given', () => {
    const { counts, unmatched } = countOtifCustomers(
      [
        row('2026-11-02', 'Amul Dairy', 'Pragati'),
        row('2026-11-09', 'AMUL  dairy ', 'PRAGATI PATEL'), // the same customer again
        row('2026-11-10', 'Banas Dairy', 'Pragati'),
        row('2026-11-11', 'Amul Dairy', 'Krina'), // a customer counts for each coordinator who served it
        row('2026-12-01', 'Amul Dairy', 'Pragati'),
        row('2026-10-31', 'Old Ltd', 'Pragati'), // before November: typed instead
        row(null, 'Open Order Ltd', 'Pragati'), // still open: no closed date
        row('2026-11-12', null, 'Pragati'), // no customer name
        row('2026-11-12', 'Someone Ltd', 'Niki Patel'),
        row('2026-11-13', 'Nobody Ltd', null),
      ],
      match,
      '2026-11'
    )
    expect(counts).toEqual({ '2026-11': { p: 2, k: 1 }, '2026-12': { p: 1 } })
    // Every month by default (16 Nov 2026: OTIF for the past months too).
    expect(countOtifCustomers([row('2026-10-31', 'Old Ltd', 'Pragati')], match).counts).toEqual({ '2026-10': { p: 1 } })
    expect(unmatched).toEqual({ '2026-11': { 'Niki Patel': 1, '(blank)': 1 } })
  })

  it('counts them by week too, Saturday to Friday', () => {
    const { weeks } = countOtifCustomers([row('2026-11-06', 'Amul', 'Pragati'), row('2026-11-07', 'Amul', 'Pragati'), row('2026-11-08', 'Banas', 'Pragati'), row('2026-11-13', 'amul', 'Pragati')], match)
    // Friday 6 Nov is the week of Saturday 31 Oct; 7 to 13 Nov is one week.
    expect(weeks).toEqual({ '2026-10-31': { p: 1 }, '2026-11-07': { p: 2 } })
  })
})

describe('the service score with OTIF customers', () => {
  const rec = (id: string, date: string, info: boolean): ServiceRecord =>
    ({ id, date, coordinator_id: 'p', customer_name: 'X', information_date: info ? date : null }) as ServiceRecord
  const records = [rec('1', '2026-10-05', true), rec('2', '2026-11-05', true), rec('3', '2026-11-06', false)]
  const typed = [
    { coordinatorId: 'p', month: '2026-10', customers: 4, updatedAt: '', updatedBy: null },
    // Typed numbers are no longer used: every month comes from OTIF.
    { coordinatorId: 'p', month: '2026-11', customers: 99, updatedAt: '', updatedBy: null },
  ]
  const otif = { '2026-10': { p: 1 }, '2026-11': { p: 2 } }

  it('takes every month from OTIF, typed numbers aside, with all of the mails', () => {
    const [nov] = serviceScores(records, typed, ['p'], '2026-11-01', '2026-11-30', otif)
    expect(nov).toMatchObject({ totalCustomers: 2, mails: 2, sumOfScore: 10, mailRatio: 1, finalScore: 50, missingMonths: [] })
    const [oct] = serviceScores(records, typed, ['p'], '2026-10-01', '2026-10-31', otif)
    expect(oct).toMatchObject({ totalCustomers: 1, mails: 1, finalScore: 100 })
    const [both] = serviceScores(records, typed, ['p'], '2026-10-01', '2026-11-30', otif)
    expect(both).toMatchObject({ totalCustomers: 3, mails: 3 })
  })

  it('gives a coordinator with no OTIF customers 0 (shown —), and no number at all when the file was not read', () => {
    const [none] = serviceScores(records, typed, ['p'], '2026-11-01', '2026-11-30', { '2026-11': { k: 3 } })
    expect(none).toMatchObject({ totalCustomers: 0, finalScore: null, missingMonths: [] })
    const [unread] = serviceScores(records, typed, ['p'], '2026-11-01', '2026-11-30', null)
    expect(unread).toMatchObject({ totalCustomers: null, finalScore: null, missingMonths: ['2026-11'] })
  })
})

describe('the route', () => {
  let server: ReturnType<typeof createServer>
  let port = 0
  const HEADER = ['Production Order No', 'PO Date', 'PO Closed Date', 'Customer Name', 'Sales Order No', 'Sales Order Date', 'Sales Order Due Date', 'Order Type', 'Relation Manager', 'Production Order Due Date', 'Planned Qty', 'Completed Qty', 'Open Order Qty', 'OTIF Score', 'Department', 'Day Commited', 'DelayDays']
  // Excel day numbers: 46329 = 3 Nov 2026, 46330 = 4 Nov 2026.
  const order = (po: string, closed: number | null, customer: string, rm: string) => [po, 46300, closed, customer, 'SO1', 46300, 46330, 'N', rm, 46330, 10, 10, 0, 'YES', 'FG - Pouch', 30, 0]

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'service-otif-'))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([HEADER, order('P1', 46329, 'Amul', 'Pragati'), order('P2', 46330, 'Banas', 'Pragati Patel'), order('P3', 46330, 'Amul', 'Pragati'), order('P4', null, 'Open', 'Pragati'), order('P5', 46330, 'Other', 'Somebody')]),
      'Claude OTIF Score'
    )
    const file = join(root, 'OTIF-SCORE.xlsx')
    writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
    const config = loadConfig({ AUTH_DIR: mkdtempSync(join(root, 'auth-')), DATA_DIR: mkdtempSync(join(root, 'data-')), SNAPSHOT_DIR: mkdtempSync(join(root, 'snap-')), EXCEL_OTIF_PATH: file })
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
  const get = (cookie: string) => fetch(`http://127.0.0.1:${port}${SERVICE_OTIF_ROUTE}`, { headers: cookie ? { cookie } : {} })

  it('is for the team leader and the administrator only', async () => {
    expect((await get('')).status).toBe(401)
    expect((await get(await signIn('pragati', 'Pragati@123'))).status).toBe(403)
  })

  it('counts each coordinator’s customers from the file', async () => {
    const res = await get(await signIn('niki', 'Niki@123'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ServiceOtifResponse
    expect(body).toMatchObject({ configured: true, error: null, counts: { '2026-11': { 'coord-1': 2 } }, unmatched: { '2026-11': { Somebody: 1 } } })
  })
})
