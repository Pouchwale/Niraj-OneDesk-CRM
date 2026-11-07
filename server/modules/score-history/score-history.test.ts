/**
 * The saved score history: ended periods are locked once (the first run fills
 * in the past), later edits do not change them, the open period stays live,
 * and only the administrator can work a locked period out again. A
 * coordinator reads only their own lines.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'

import { createApp } from '../../app'
import { loadConfig } from '../../config'
import { createLogger } from '../../logger'
import { AUTH_ROUTES } from '../../../shared/auth'
import { SCORE_HISTORY_ROUTE, type ScoreHistoryResponse, type ScoreInputs } from '../../../src/lib/score-history'
import type { Quotation } from '../../../src/lib/types'
import { createScoreHistoryStore } from './store'

const root = mkdtempSync(join(tmpdir(), 'score-history-'))
const quiet = createLogger({ level: 'error', write: () => undefined })

const quote = (id: string, coordinator: string, day: string, status: Quotation['status']) =>
  ({ id, coordinator_id: coordinator, inquiry_date: day, quotation_date: day, closing_date: null, created_at: `${day}T09:00:00.000Z`, status, customer_type: 'new', customer_name: `Customer ${id}`, amount: null, followups: [] }) as unknown as Quotation

const baseInputs = (quotations: Quotation[]): ScoreInputs => ({
  coordinators: [{ id: 'c1', name: 'Asha' }],
  robiDays: new Map(),
  kpiWeeks: [],
  quotations,
  billingIssues: [],
  serviceRecords: [],
  serviceTargets: [],
  selfLeads: [],
})

describe('locking', () => {
  it('fills in the past on the first run, then locks only what has newly ended', () => {
    const dir = mkdtempSync(join(root, 'lock-'))
    let clock = new Date('2026-11-06T10:00:00')
    let quotations = [quote('a', 'c1', '2026-10-01', 'closed'), quote('b', 'c1', '2026-11-03', 'open')]
    let reads = 0
    const store = createScoreHistoryStore(dir, () => (reads++, baseInputs(quotations)), () => clock)

    const first = store.lockDue()
    // Saturday-to-Friday weeks from the one holding 1 Oct (26 Sep) to the one ending 30 Oct, and October.
    // Not the week ending Friday 6 Nov (it locks on Tuesday 10 Nov), not November, not 2026.
    expect(first).toEqual(['week:2026-09-26', 'week:2026-10-03', 'week:2026-10-10', 'week:2026-10-17', 'week:2026-10-24', 'month:2026-10'])
    expect(store.lockDue()).toEqual([])
    expect(reads).toBe(1)

    // An old quotation edited later: the locked October keeps its score; the open November is live.
    quotations = [quote('a', 'c1', '2026-10-01', 'lost'), quote('b', 'c1', '2026-11-03', 'closed')]
    const months = store.periods('month', 2)
    expect(months.map((p) => [p.key, p.lockedAt !== null])).toEqual([
      ['2026-10', true],
      ['2026-11', false],
    ])
    expect(months[0].entries.find((e) => e.module === 'quotations')?.score).toBe(100)
    expect(months[1].entries.find((e) => e.module === 'quotations')?.score).toBe(100)

    clock = new Date('2026-11-12T10:00:00')
    expect(store.lockDue()).toEqual(['week:2026-10-31'])
  })

  it('works a locked period out again for the administrator only when it is locked', () => {
    const dir = mkdtempSync(join(root, 'relock-'))
    const clock = new Date('2026-11-06T10:00:00')
    let quotations = [quote('a', 'c1', '2026-10-01', 'closed')]
    const store = createScoreHistoryStore(dir, () => baseInputs(quotations), () => clock)
    store.lockDue()
    quotations = [quote('a', 'c1', '2026-10-01', 'lost')]
    expect(store.relock('month:2026-11', 'admin-0')).toBeNull()
    const again = store.relock('month:2026-10', 'admin-0')!
    expect(again.lockedBy).toBe('admin-0')
    expect(again.entries.find((e) => e.module === 'quotations')?.score).toBe(0)
    expect(store.periods('month', 2)[0].entries.find((e) => e.module === 'quotations')?.score).toBe(0)
  })
})

describe('the route', () => {
  let server: ReturnType<typeof createServer>
  let port = 0

  beforeAll(async () => {
    const dataDir = mkdtempSync(join(root, 'data-'))
    // Two coordinators' quotations this week.
    const today = new Date().toISOString().slice(0, 10)
    writeFileSync(join(dataDir, 'store.json'), JSON.stringify({ quotations: [quote('p1', 'coord-1', today, 'closed'), quote('p2', 'coord-2', today, 'open')] }))
    const config = loadConfig({ AUTH_DIR: mkdtempSync(join(root, 'auth-')), DATA_DIR: dataDir, SNAPSHOT_DIR: mkdtempSync(join(root, 'snap-')) })
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
  const get = async (cookie: string) =>
    fetch(`http://127.0.0.1:${port}${SCORE_HISTORY_ROUTE}?kind=week&count=2`, { headers: cookie ? { cookie } : {} })
  const recalc = async (cookie: string, id: string) =>
    fetch(`http://127.0.0.1:${port}${SCORE_HISTORY_ROUTE}/recalculate`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ id }) })

  it('is closed to anyone who has not signed in', async () => {
    expect((await get('')).status).toBe(401)
  })

  it('gives the team leader everyone, and a coordinator only their own lines', async () => {
    const team = (await (await get(await signIn('niki', 'Niki@123'))).json()) as ScoreHistoryResponse
    const live = team.periods[team.periods.length - 1]
    expect(team.periods).toHaveLength(2)
    expect(live.lockedAt).toBeNull()
    expect(live.entries.filter((e) => e.module === 'quotations').map((e) => e.coordinatorId).sort()).toEqual(['coord-1', 'coord-2'])

    const mine = (await (await get(await signIn('pragati', 'Pragati@123'))).json()) as ScoreHistoryResponse
    expect(mine.periods.flatMap((p) => p.entries).every((e) => e.coordinatorId === 'coord-1')).toBe(true)
    expect(mine.periods[1].entries.find((e) => e.module === 'quotations')?.score).toBe(100)
  })

  it('lets only the administrator work a period out again', async () => {
    expect((await recalc(await signIn('niki', 'Niki@123'), 'week:2026-10-26')).status).toBe(403)
    // Nothing is locked in this fresh folder: there is nothing to work out again.
    expect((await recalc(await signIn('admin', 'Admin@123'), 'week:2026-10-26')).status).toBe(400)
  })
})
