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
import { otifRelationManager, otifRowOf } from '../../../shared/otif-read'

const quiet = createLogger({ level: 'error', write: () => undefined })

describe("Krina Shah's OTIF orders under Disha Acharya (21 Nov 2026)", () => {
  it('moves orders closed from 1 Nov 2026 only; older and open orders stay with Krina', () => {
    expect(otifRelationManager('Krina Shah', '2026-11-01')).toBe('Disha Acharya')
    expect(otifRelationManager('  KRINA   shah ', '2026-11-21')).toBe('Disha Acharya')
    expect(otifRelationManager('Krina Shah', '2026-10-31')).toBe('Krina Shah')
    expect(otifRelationManager('Krina Shah', null)).toBe('Krina Shah')
    expect(otifRelationManager('Pragati Patel', '2026-11-21')).toBe('Pragati Patel')
    expect(otifRelationManager(null, '2026-11-21')).toBeNull()
  })

  it('reads a row of the file that way, so the page and the Service count agree', () => {
    const columns = { poNo: 0, poClosedDate: 1, customerName: 2, relationManager: 3 }
    expect(otifRowOf(['P1', '2026-11-05', 'Acme', 'Krina Shah'], columns)?.relationManager).toBe('Disha Acharya')
    expect(otifRowOf(['P2', '2026-10-05', 'Acme', 'Krina Shah'], columns)?.relationManager).toBe('Krina Shah')
    const match = coordinatorMatcher([{ id: 'k', name: 'Krina Shah' }, { id: 'd', name: 'Disha Acharya' }, { id: 'c', name: 'Disha Chaudhary' }])
    const rows = [
      { poNo: 'P1', poClosedDate: '2026-10-30', relationManager: otifRelationManager('Krina Shah', '2026-10-30') },
      { poNo: 'P2', poClosedDate: '2026-11-16', relationManager: otifRelationManager('Krina Shah', '2026-11-16') },
    ]
    const { counts, weeks } = countOtifCustomers(rows, match)
    expect(counts['2026-10']).toEqual({ k: 1 })
    expect(counts['2026-11']).toEqual({ d: 1 })
    expect(weeks['2026-11-14']).toEqual({ d: 1 })
  })
})

describe('counting the OTIF POs (24 Nov 2026; customers before)', () => {
  const match = coordinatorMatcher([
    { id: 'p', name: 'Pragati Patel' },
    { id: 'k', name: 'Krina Shah' },
  ])
  const row = (closed: string | null, po: string | null, rm: string | null) => ({ poClosedDate: closed, poNo: po as string, relationManager: rm })

  it('counts different POs per coordinator and month by PO Closed Date, from the month given', () => {
    const { counts, unmatched } = countOtifCustomers(
      [
        row('2026-11-02', '91001', 'Pragati'),
        row('2026-11-02', ' 91001 ', 'PRAGATI PATEL'), // the same PO on another line of the file: once
        row('2026-11-10', '91002', 'Pragati'), // another PO, even for the same customer: counts
        row('2026-11-11', '91003', 'Krina'),
        row('2026-12-01', '91004', 'Pragati'),
        row('2026-10-31', '90001', 'Pragati'), // before the month given
        row(null, '91005', 'Pragati'), // still open: no closed date
        row('2026-11-12', null, 'Pragati'), // no PO number
        row('2026-11-12', '91006', 'Niki Patel'),
        row('2026-11-13', '91007', null),
      ],
      match,
      '2026-11'
    )
    expect(counts).toEqual({ '2026-11': { p: 2, k: 1 }, '2026-12': { p: 1 } })
    // Every month by default (OTIF for the past months too).
    expect(countOtifCustomers([row('2026-10-31', '90001', 'Pragati')], match).counts).toEqual({ '2026-10': { p: 1 } })
    expect(unmatched).toEqual({ '2026-11': { 'Niki Patel': 1, '(blank)': 1 } })
  })

  it('counts them by week too, Saturday to Friday', () => {
    const { weeks } = countOtifCustomers([row('2026-11-06', 'A1', 'Pragati'), row('2026-11-07', 'A2', 'Pragati'), row('2026-11-08', 'A3', 'Pragati'), row('2026-11-13', 'a3', 'Pragati')], match)
    // Friday 6 Nov is the week of Saturday 31 Oct; 7 to 13 Nov is one week (A3 and a3 are one PO).
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
  const order = (po: string, closed: number | null, customer: string, rm: string) => [po, 46300, closed, customer, 'SO1', 46300, 46330, 'N', rm, 46330, 10, 10, 0, 'YES', 'FG - Label', 30, 0]

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

  it('counts each coordinator’s closed POs from the file, two of them for one customer included', async () => {
    const res = await get(await signIn('niki', 'Niki@123'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ServiceOtifResponse
    expect(body).toMatchObject({ configured: true, error: null, counts: { '2026-11': { 'coord-1': 3 } }, unmatched: { '2026-11': { Somebody: 1 } } })
  })
})
