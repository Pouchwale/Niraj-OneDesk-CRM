/**
 * Saved OTIF reports (14 Nov 2026): what a browser sends is checked and kept
 * to the known fields; the team leader and the administrator save, list and
 * open them; a coordinator cannot; only the administrator deletes one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'

import { createApp } from '../../app'
import { loadConfig } from '../../config'
import { createLogger } from '../../logger'
import { AUTH_ROUTES } from '../../../shared/auth'
import { OTIF_REPORTS_ROUTE, type OtifLiveRow, type OtifSavedReport, type OtifSavedReportSummary } from '../../../shared/otif-reports'
import { checkReport, createOtifReportsStore } from './store'

const root = mkdtempSync(join(tmpdir(), 'otif-reports-'))
const quiet = createLogger({ level: 'error', write: () => undefined })

const order = (o: Partial<OtifLiveRow> = {}): OtifLiveRow => ({
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
  ...o,
})

const report = (o: Record<string, unknown> = {}) => ({
  name: 'Early November',
  from: '2026-11-01',
  to: '2026-11-14',
  basis: 'closed',
  filters: { department: null, relationManager: 'Devyani Vaghela', bucket: null },
  file: { name: 'OTIF-SCORE.xlsm', sheet: 'Claude OTIF Score', savedAt: '2026-11-14T04:00:00.000Z' },
  rows: [order(), order({ poNo: '91948', otifScore: 'NO', delayDays: 3 })],
  ...o,
})

describe('checking a report', () => {
  it('keeps the known fields only, and the orders as they are', () => {
    const checked = checkReport(report({ rows: [{ ...order(), extra: 'dropped', otifScore: 'maybe' }, { poNo: '' }, 'junk'] }))
    expect(checked.rows).toHaveLength(1)
    expect(checked.rows[0]).not.toHaveProperty('extra')
    expect(checked.rows[0].otifScore).toBeNull()
    expect(checked.rows[0].poClosedDate).toBe('2026-11-05')
    expect(checked.filters).toEqual({ department: null, relationManager: 'Devyani Vaghela', bucket: null })
  })

  it('refuses dates, bases or orders that do not make sense', () => {
    expect(() => checkReport(report({ from: '2026-11-15' }))).toThrow(/after the To date/)
    expect(() => checkReport(report({ to: '14/11/2026' }))).toThrow(/From and a To date/)
    expect(() => checkReport(report({ basis: 'week' }))).toThrow(/places an order/)
    expect(() => checkReport(report({ rows: [] }))).toThrow(/no orders/)
    expect(() => checkReport(null)).toThrow(/Nothing to save/)
  })

  it('names a report by its dates when no name is given', () => {
    expect(checkReport(report({ name: '   ' })).name).toBe('OTIF 2026-11-01 to 2026-11-14')
  })
})

describe('the store', () => {
  it('saves, lists without the orders, opens and deletes', () => {
    let clock = new Date('2026-11-14T05:00:00.000Z')
    const store = createOtifReportsStore(mkdtempSync(join(root, 'store-')), () => clock)
    const first = store.save(report(), { id: 'coord-0', name: 'Niki Patel' })
    clock = new Date('2026-11-14T06:00:00.000Z')
    const second = store.save(report({ name: 'Second' }), { id: 'admin-0', name: 'Admin' })
    const list = store.list()
    expect(list.map((r) => r.name)).toEqual(['Second', 'Early November'])
    expect(list[1]).toMatchObject({ orders: 2, savedBy: 'coord-0', savedByName: 'Niki Patel' })
    expect(list[1]).not.toHaveProperty('rows')
    expect(store.get(first.id)?.rows).toHaveLength(2)
    expect(store.remove(second.id)).toBe(true)
    expect(store.remove(second.id)).toBe(false)
    expect(store.list()).toHaveLength(1)
  })
})

describe('the route', () => {
  let server: ReturnType<typeof createServer>
  let port = 0

  beforeAll(async () => {
    const config = loadConfig({ AUTH_DIR: mkdtempSync(join(root, 'auth-')), DATA_DIR: mkdtempSync(join(root, 'data-')), SNAPSHOT_DIR: mkdtempSync(join(root, 'snap-')) })
    server = createServer(createApp(config, quiet))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const signIn = async (username: string, password: string) => {
    const res = await fetch(`http://127.0.0.1:${port}${AUTH_ROUTES.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    return res.headers.get('set-cookie')?.split(';')[0] ?? ''
  }
  const call = (cookie: string, path = '', init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}${OTIF_REPORTS_ROUTE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) } })

  it('is closed to anyone not signed in, and to coordinators', async () => {
    expect((await call('')).status).toBe(401)
    const coordinator = await signIn('pragati', 'Pragati@123')
    expect((await call(coordinator)).status).toBe(403)
    expect((await call(coordinator, '', { method: 'POST', body: JSON.stringify(report()) })).status).toBe(403)
  })

  it('lets the team leader save, list and open; only the administrator deletes', async () => {
    const leader = await signIn('niki', 'Niki@123')
    const saved = await call(leader, '', { method: 'POST', body: JSON.stringify(report()) })
    expect(saved.status).toBe(200)
    const summary = (await saved.json()) as OtifSavedReportSummary
    expect(summary).toMatchObject({ name: 'Early November', orders: 2 })
    expect(summary.savedByName).toMatch(/Niki/)
    expect(summary).not.toHaveProperty('rows')

    const bad = await call(leader, '', { method: 'POST', body: JSON.stringify(report({ rows: [] })) })
    expect(bad.status).toBe(400)

    const list = (await (await call(leader)).json()) as { reports: OtifSavedReportSummary[] }
    expect(list.reports.map((r) => r.id)).toEqual([summary.id])
    const opened = (await (await call(leader, `/${summary.id}`)).json()) as OtifSavedReport
    expect(opened.rows.map((r) => r.poNo)).toEqual(['91947', '91948'])
    expect((await call(leader, '/nope')).status).toBe(404)

    expect((await call(leader, `/${summary.id}`, { method: 'DELETE' })).status).toBe(403)
    const admin = await signIn('admin', 'Admin@123')
    expect((await call(admin, `/${summary.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await call(admin, `/${summary.id}`)).status).toBe(404)
  })

  it('takes a report bigger than the usual 1 MB limit', async () => {
    const leader = await signIn('niki', 'Niki@123')
    const rows = Array.from({ length: 8000 }, (_, i) => order({ poNo: String(100000 + i), customerName: `Customer with a fairly long name number ${i}` }))
    const res = await call(leader, '', { method: 'POST', body: JSON.stringify(report({ rows })) })
    expect(res.status).toBe(200)
    expect(((await res.json()) as OtifSavedReportSummary).orders).toBe(8000)
  })
})
