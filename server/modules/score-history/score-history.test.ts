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

describe('the final score ratios by dates', () => {
  it('locks each period with the ratio in force on its first day; open periods use the ratios now', () => {
    const dir = mkdtempSync(join(root, 'ratio-'))
    let clock = new Date('2026-11-06T10:00:00')
    const store = createScoreHistoryStore(dir, () => baseInputs([quote('a', 'c1', '2026-10-01', 'closed')]), () => clock)
    expect(store.finalRatios()).toEqual([])
    // Locked before any ratio: the plain average, as before.
    store.lockDue()
    expect(store.periods('month', 2)[0].finalWeights).toBeNull()

    // October's ratio, set afterwards, does not reach the locked October.
    store.saveFinalRatio({ from: '2026-10-01', to: '2026-10-31', weights: { robi: 50, quotations: 50 } }, 'admin-0')
    // From 31 Oct (the Saturday the week 31 Oct - 6 Nov starts) onward.
    const nov = store.saveFinalRatio({ from: '2026-10-31', to: null, weights: { robi: 60, quotations: 40 } }, 'admin-0')
    expect(store.finalRatios().map((r) => r.from)).toEqual(['2026-10-01', '2026-10-31'])
    const [october, november] = store.periods('month', 2)
    expect(october.finalWeights).toBeNull()
    expect(november.finalWeights).toEqual({ robi: 60, quotations: 40 })

    // The week 31 Oct - 6 Nov locks on Tuesday 10 Nov with the ratio of its first day, 31 Oct.
    clock = new Date('2026-11-12T10:00:00')
    expect(store.lockDue()).toEqual(['week:2026-10-31'])
    store.saveFinalRatio({ from: '2026-10-31', to: null, weights: { robi: 100 } }, 'admin-0', nov.id)
    const week = store.periods('week', 3).find((p) => p.key === '2026-10-31')!
    expect(week.finalWeights).toEqual({ robi: 60, quotations: 40 })
    expect(store.relock('week:2026-10-31', 'admin-0')!.finalWeights).toEqual({ robi: 60, quotations: 40 })
    // The open week of 7 Nov uses the changed ratio.
    expect(store.periods('week', 1)[0].finalWeights).toEqual({ robi: 100 })

    expect(() => store.saveFinalRatio({ from: '2026-10-31', to: null, weights: { robi: 100 } }, 'admin-0')).toThrow(/already starts on that date/)
    expect(() => store.saveFinalRatio({ from: '2026-12-01', to: '2026-11-01', weights: { robi: 100 } }, 'admin-0')).toThrow(/before the From date/)
    expect(() => store.saveFinalRatio({ from: '2026-12-01', weights: { robi: 70 } }, 'admin-0')).toThrow(/add up to 70%/)
    expect(store.deleteFinalRatio(nov.id)).toBe(true)
    expect(store.deleteFinalRatio(nov.id)).toBe(false)
    // With only October's ratio left, November takes the nearest earlier one.
    expect(store.periods('week', 1)[0].finalWeights).toEqual({ robi: 50, quotations: 50 })
  })
})

describe('ratios for particular coordinators', () => {
  it('scores the people on it by their own shares in open periods, locks with them, and refuses a person twice', () => {
    const dir = mkdtempSync(join(root, 'person-ratio-'))
    let clock = new Date('2026-11-06T10:00:00')
    const store = createScoreHistoryStore(dir, () => baseInputs([quote('a', 'c1', '2026-10-01', 'closed')]), () => clock)
    store.lockDue()
    store.saveFinalRatio({ from: '2026-10-01', to: null, weights: { robi: 60, quotations: 40 } }, 'admin-0')
    const own = store.savePersonRatio({ coordinatorIds: ['c1', 'c2', 'c1'], weights: { quotations: 100 } }, 'admin-0')
    expect(own.coordinatorIds).toEqual(['c1', 'c2'])
    // Locked October keeps what it had; the open November carries the people's own ratio beside the team's.
    const [october, november] = store.periods('month', 2)
    expect(october.personWeights).toBeUndefined()
    expect(november.finalWeights).toEqual({ robi: 60, quotations: 40 })
    expect(november.personWeights).toEqual({ c1: { quotations: 100 }, c2: { quotations: 100 } })

    expect(() => store.savePersonRatio({ coordinatorIds: ['c2', 'c3'], weights: { robi: 100 } }, 'admin-0')).toThrow(/One person already has/)
    expect(() => store.savePersonRatio({ coordinatorIds: [], weights: { robi: 100 } }, 'admin-0')).toThrow(/at least one coordinator/)
    expect(() => store.savePersonRatio({ coordinatorIds: ['c3'], weights: { robi: 90 } }, 'admin-0')).toThrow(/add up to 90%/)
    // Changing their own ratio keeps them on it; taking c2 off frees c2 for another.
    store.savePersonRatio({ coordinatorIds: ['c1'], weights: { robi: 20, quotations: 80 } }, 'admin-0', own.id)
    store.savePersonRatio({ coordinatorIds: ['c2'], weights: { robi: 100 } }, 'admin-0')
    expect(store.periods('week', 1)[0].personWeights).toEqual({ c1: { robi: 20, quotations: 80 }, c2: { robi: 100 } })

    // The week 31 Oct - 6 Nov locks with the people's ratios as they stand; removing one later does not reach it.
    clock = new Date('2026-11-12T10:00:00')
    expect(store.lockDue()).toEqual(['week:2026-10-31'])
    expect(store.deletePersonRatio(own.id)).toBe(true)
    expect(store.deletePersonRatio(own.id)).toBe(false)
    const locked = store.periods('week', 3).find((p) => p.key === '2026-10-31')!
    expect(locked.personWeights).toEqual({ c1: { robi: 20, quotations: 80 }, c2: { robi: 100 } })
    expect(store.relock('week:2026-10-31', 'admin-0')!.personWeights).toEqual({ c1: { robi: 20, quotations: 80 }, c2: { robi: 100 } })
    // The open week: c1 is back on the team ratio.
    expect(store.periods('week', 1)[0].personWeights).toEqual({ c2: { robi: 100 } })
  })
})

describe('the two scores', () => {
  it('keeps ratios per score, one per person per score, and locks each period with what it had', () => {
    const dir = mkdtempSync(join(root, 'groups-'))
    let clock = new Date('2026-11-06T10:00:00')
    const store = createScoreHistoryStore(dir, () => baseInputs([quote('a', 'c1', '2026-10-01', 'closed')]), () => clock)
    store.lockDue()
    expect(store.scoreGroups().service).toBe('operations')

    // The same From date is fine for the two scores; shares only for a score's own modules.
    store.saveFinalRatio({ from: '2026-10-31', to: null, group: 'payments', weights: { robi: 40, kpi: 60 } }, 'admin-0')
    store.saveFinalRatio({ from: '2026-10-31', to: null, group: 'operations', weights: { quotations: 50, service: 50 } }, 'admin-0')
    expect(() => store.saveFinalRatio({ from: '2026-10-31', to: null, group: 'payments', weights: { robi: 100 } }, 'admin-0')).toThrow(/already starts/)
    expect(() => store.saveFinalRatio({ from: '2026-12-01', to: null, group: 'payments', weights: { service: 100 } }, 'admin-0')).toThrow(/not in the Payments score/)

    // A person may have one for each score, not two for one.
    store.savePersonRatio({ coordinatorIds: ['c1'], group: 'payments', weights: { robi: 100 } }, 'admin-0')
    store.savePersonRatio({ coordinatorIds: ['c1'], group: 'operations', weights: { service: 100 } }, 'admin-0')
    expect(() => store.savePersonRatio({ coordinatorIds: ['c1'], group: 'payments', weights: { kpi: 100 } }, 'admin-0')).toThrow(/already has/)
    expect(() => store.savePersonRatio({ coordinatorIds: ['c1'], weights: { robi: 100 } }, 'admin-0')).toThrow(/already has/)

    const open = store.periods('week', 1)[0]
    expect(open.groupWeights).toEqual({ payments: { robi: 40, kpi: 60 }, operations: { quotations: 50, service: 50 } })
    expect(open.personGroupWeights).toEqual({ payments: { c1: { robi: 100 } }, operations: { c1: { service: 100 } } })
    expect(open.finalWeights).toBeNull()

    // Locks with them; a later move and a work-out-again keep what it locked with.
    clock = new Date('2026-11-12T10:00:00')
    expect(store.lockDue()).toEqual(['week:2026-10-31'])
    const groups = store.scoreGroups()
    expect(() => store.saveScoreGroups({ ...groups, service: 'nowhere' })).toThrow(/Service/)
    expect(store.saveScoreGroups({ ...groups, service: 'payments' }).service).toBe('payments')
    const locked = store.periods('week', 3).find((p) => p.key === '2026-10-31')!
    expect(locked.scoreGroups?.service).toBe('operations')
    const again = store.relock('week:2026-10-31', 'admin-0')!
    expect(again.scoreGroups?.service).toBe('operations')
    expect(again.groupWeights?.payments).toEqual({ robi: 40, kpi: 60 })
    expect(again.personGroupWeights?.operations).toEqual({ c1: { service: 100 } })
    expect(store.periods('week', 1)[0].scoreGroups?.service).toBe('payments')
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

  it('lets only the administrator set the dated ratios, and sends them to everyone', async () => {
    const send = async (cookie: string, method: string, path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${port}${SCORE_HISTORY_ROUTE}${path}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const ratio = { from: '2026-01-01', to: null, weights: { robi: 50, quotations: 50 } }
    expect((await send(await signIn('niki', 'Niki@123'), 'POST', '/ratios', ratio)).status).toBe(403)
    expect((await send(await signIn('pragati', 'Pragati@123'), 'POST', '/ratios', ratio)).status).toBe(403)
    const admin = await signIn('admin', 'Admin@123')
    const wrong = await send(admin, 'POST', '/ratios', { ...ratio, weights: { robi: 50 } })
    expect(wrong.status).toBe(400)
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toMatch(/must add up to 100%/)
    const made = await send(admin, 'POST', '/ratios', ratio)
    expect(made.status).toBe(200)
    const { ratio: saved } = (await made.json()) as { ratio: { id: string } }
    const mine = (await (await get(await signIn('pragati', 'Pragati@123'))).json()) as ScoreHistoryResponse
    expect(mine.finalRatios.map((r) => r.weights)).toEqual([{ robi: 50, quotations: 50 }])
    expect(mine.periods[1].finalWeights).toEqual({ robi: 50, quotations: 50 })
    expect((await send(admin, 'PUT', `/ratios/${saved.id}`, { ...ratio, weights: { robi: 100 } })).status).toBe(200)
    expect((await send(await signIn('niki', 'Niki@123'), 'DELETE', `/ratios/${saved.id}`)).status).toBe(403)
    expect((await send(admin, 'DELETE', `/ratios/${saved.id}`)).status).toBe(200)
    expect((await send(admin, 'DELETE', `/ratios/${saved.id}`)).status).toBe(404)
    expect(((await (await get(admin)).json()) as ScoreHistoryResponse).finalRatios).toEqual([])
  })

  it('lets only the administrator set ratios for particular coordinators; a coordinator sees only their own', async () => {
    const send = async (cookie: string, method: string, path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${port}${SCORE_HISTORY_ROUTE}${path}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const ratio = { coordinatorIds: ['coord-1', 'coord-2'], weights: { quotations: 100 } }
    expect((await send(await signIn('niki', 'Niki@123'), 'POST', '/person-ratios', ratio)).status).toBe(403)
    const admin = await signIn('admin', 'Admin@123')
    const made = await send(admin, 'POST', '/person-ratios', ratio)
    expect(made.status).toBe(200)
    const { ratio: saved } = (await made.json()) as { ratio: { id: string } }
    expect((await send(admin, 'POST', '/person-ratios', { coordinatorIds: ['coord-2'], weights: { robi: 100 } })).status).toBe(400)

    const team = (await (await get(await signIn('niki', 'Niki@123'))).json()) as ScoreHistoryResponse
    expect(team.personRatios?.map((r) => r.coordinatorIds)).toEqual([['coord-1', 'coord-2']])
    expect(team.periods[1].personWeights).toEqual({ 'coord-1': { quotations: 100 }, 'coord-2': { quotations: 100 } })
    const mine = (await (await get(await signIn('pragati', 'Pragati@123'))).json()) as ScoreHistoryResponse
    expect(mine.personRatios).toBeUndefined()
    expect(mine.periods[1].personWeights).toEqual({ 'coord-1': { quotations: 100 } })

    expect((await send(admin, 'PUT', `/person-ratios/${saved.id}`, { coordinatorIds: ['coord-2'], weights: { robi: 100 } })).status).toBe(200)
    expect((await send(admin, 'DELETE', `/person-ratios/${saved.id}`)).status).toBe(200)
    expect((await send(admin, 'DELETE', `/person-ratios/${saved.id}`)).status).toBe(404)
    expect(((await (await get(admin)).json()) as ScoreHistoryResponse).personRatios).toEqual([])
  })

  it('lets only the administrator move modules; a coordinator sees only their own ratio for each score', async () => {
    const send = async (cookie: string, method: string, path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${port}${SCORE_HISTORY_ROUTE}${path}`, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const admin = await signIn('admin', 'Admin@123')
    const { scoreGroups } = (await (await get(admin)).json()) as ScoreHistoryResponse
    const moved = { ...scoreGroups!, billing: 'payments' }
    expect((await send(await signIn('niki', 'Niki@123'), 'PUT', '/groups', { groups: moved })).status).toBe(403)
    expect((await send(admin, 'PUT', '/groups', { groups: { ...moved, billing: 'x' } })).status).toBe(400)
    expect((await send(admin, 'PUT', '/groups', { groups: moved })).status).toBe(200)
    expect(((await (await get(await signIn('pragati', 'Pragati@123'))).json()) as ScoreHistoryResponse).scoreGroups?.billing).toBe('payments')
    expect((await send(admin, 'PUT', '/groups', { groups: scoreGroups })).status).toBe(200)

    const made = await send(admin, 'POST', '/person-ratios', { coordinatorIds: ['coord-1', 'coord-2'], group: 'operations', weights: { service: 100 } })
    expect(made.status).toBe(200)
    const { ratio } = (await made.json()) as { ratio: { id: string } }
    const mine = (await (await get(await signIn('pragati', 'Pragati@123'))).json()) as ScoreHistoryResponse
    expect(mine.periods[1].personGroupWeights).toEqual({ operations: { 'coord-1': { service: 100 } } })
    expect((await send(admin, 'DELETE', `/person-ratios/${ratio.id}`)).status).toBe(200)
  })

  it('lets only the administrator work a period out again', async () => {
    expect((await recalc(await signIn('niki', 'Niki@123'), 'week:2026-10-26')).status).toBe(403)
    // Nothing is locked in this fresh folder: there is nothing to work out again.
    expect((await recalc(await signIn('admin', 'Admin@123'), 'week:2026-10-26')).status).toBe(400)
  })
})
