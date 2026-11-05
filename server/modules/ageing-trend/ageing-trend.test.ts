/**
 * Overdue Payments' Trends tab: the saved Monday books, summed week by week.
 *
 * What matters: a coordinator sees only their own figures, the team sees
 * everyone's, and a week's sum outlives the 90-day removal of the day itself.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'

import { createApp } from '../../app'
import { loadConfig } from '../../config'
import { createLogger } from '../../logger'
import { AUTH_ROUTES } from '../../../shared/auth'
import { AGEING_TREND_ROUTE, type AgeingTrendResponse } from '../../../src/lib/ageing-trend'
import { createSnapshotStore } from '../snapshots/store'
import { createAgeingTrendStore, MONTHS_FILE, TREND_FILE } from './store'

const root = mkdtempSync(join(tmpdir(), 'ageing-trend-'))
const quiet = createLogger({ level: 'error', write: () => undefined })

const balance = (id: string, coordinatorId: string, extra: Record<string, unknown> = {}) => ({
  id,
  bp_code: `BP-${id}`,
  status: 'overdue' as const,
  assigned_coordinator_id: coordinatorId,
  due_0_30: 100,
  due_31_60: 10,
  due_61_90: 20,
  due_91_120: 30,
  due_121_plus: 1000,
  ...extra,
})

const day = (rows: Record<string, unknown>[]) => ({
  savedBy: 'test',
  savedByName: 'Test',
  fileModifiedAt: null,
  percentage: 20,
  rows,
  table: [],
})

describe('the route', () => {
  let server: ReturnType<typeof createServer>
  let port = 0
  /** Writes month closes into the same folder the app reads. */
  let trendStore: ReturnType<typeof createAgeingTrendStore>

  beforeAll(async () => {
    const snapshotDir = mkdtempSync(join(root, 'snapshots-'))
    createSnapshotStore(snapshotDir).saveDay(
      day([
        balance('a', 'coord-1'),
        balance('b', 'coord-2'),
        balance('c', 'coord-1', { no_followup_at: '2026-10-01', no_followup_kind: 'dispute' }),
        balance('d', 'coord-1', { status: 'settled' }),
      ])
    )
    const config = loadConfig({
      AUTH_DIR: mkdtempSync(join(root, 'auth-')),
      DATA_DIR: mkdtempSync(join(root, 'data-')),
      SNAPSHOT_DIR: snapshotDir,
    })
    trendStore = createAgeingTrendStore(snapshotDir, createSnapshotStore(snapshotDir))
    server = createServer(createApp(config, quiet))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const as = async (username: string | null, password = '') => {
    let cookie = ''
    if (username) {
      const res = await fetch(`http://127.0.0.1:${port}${AUTH_ROUTES.login}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
    }
    return fetch(`http://127.0.0.1:${port}${AGEING_TREND_ROUTE}`, { headers: cookie ? { cookie } : {} })
  }

  it('is closed to anyone who has not signed in', async () => {
    expect((await as(null)).status).toBe(401)
  })

  it('gives the team leader every coordinator, by segment, settled left out', async () => {
    const body = (await (await as('niki', 'Niki@123')).json()) as AgeingTrendResponse
    expect(body.weeks).toHaveLength(1)
    const rows = body.weeks[0].rows
    expect(rows.map((r) => `${r.coordinatorId}:${r.segment}:${r.accounts}`).sort()).toEqual([
      'coord-1:dispute:1',
      'coord-1:regular:1',
      'coord-2:regular:1',
    ])
    expect(rows.find((r) => r.coordinatorId === 'coord-2')).toMatchObject({ d31_120: 60, d121_plus: 1000 })
  })

  it('gives a coordinator only their own figures', async () => {
    const body = (await (await as('pragati', 'Pragati@123')).json()) as AgeingTrendResponse
    expect(body.weeks[0].rows.every((r) => r.coordinatorId === 'coord-1')).toBe(true)
    expect(body.weeks[0].rows).toHaveLength(2)
  })

  it('sends month closes with the same split', async () => {
    trendStore.recordMonth([balance('a', 'coord-1'), balance('b', 'coord-2')])
    const team = (await (await as('niki', 'Niki@123')).json()) as AgeingTrendResponse
    const mine = (await (await as('pragati', 'Pragati@123')).json()) as AgeingTrendResponse
    expect(team.months).toHaveLength(1)
    expect(team.months[0].rows.map((r) => r.coordinatorId).sort()).toEqual(['coord-1', 'coord-2'])
    expect(mine.months[0].rows.map((r) => r.coordinatorId)).toEqual(['coord-1'])
  })
})

describe('the kept sums', () => {
  it('outlive a day removed by age, but not a day deleted by hand', () => {
    const dir = mkdtempSync(join(root, 'kept-'))
    let clock = new Date('2026-09-01T10:00:00')
    const snapshots = createSnapshotStore(dir, { now: () => clock })
    const trend = createAgeingTrendStore(dir, snapshots, () => clock)

    const old = snapshots.saveDay(day([balance('a', 'coord-1')]))
    clock = new Date('2026-09-08T10:00:00')
    const unwanted = snapshots.saveDay(day([balance('b', 'coord-1')]))
    expect(trend.days().map((d) => d.id).sort()).toEqual([old.id, unwanted.id].sort())
    expect(existsSync(join(dir, TREND_FILE))).toBe(true)

    // Deleted by hand within the 90 days: a save nobody wanted, so its sum goes.
    snapshots.removeDay(unwanted.id)
    expect(trend.days().map((d) => d.id)).toEqual([old.id])

    // Four months on, the old day itself is pruned; its sum stays, read back from the file.
    clock = new Date('2027-01-05T10:00:00')
    expect(snapshots.listDays()).toHaveLength(0)
    const reread = createAgeingTrendStore(dir, snapshots, () => clock)
    expect(reread.days().map((d) => d.id)).toEqual([old.id])
  })
})

describe('month closes', () => {
  it('keeps one close per month, rewritten only when the book changes, and kept for good', () => {
    const dir = mkdtempSync(join(root, 'months-'))
    let clock = new Date('2026-10-30T10:00:00')
    const snapshots = createSnapshotStore(dir, { now: () => clock })
    const trend = createAgeingTrendStore(dir, snapshots, () => clock)

    expect(trend.recordMonth([balance('a', 'coord-1')])).toBe('2026-10')
    clock = new Date('2026-10-31T23:30:00')
    // The same book half an hour later is not written again.
    expect(trend.recordMonth([balance('a', 'coord-1')])).toBeNull()
    // A changed book is: this is how October closes.
    expect(trend.recordMonth([balance('a', 'coord-1'), balance('b', 'coord-2')])).toBe('2026-10')
    clock = new Date('2026-11-01T00:00:00')
    expect(trend.recordMonth([balance('a', 'coord-1')])).toBe('2026-11')

    const reread = createAgeingTrendStore(dir, snapshots, () => clock).months()
    expect(reread.map((m) => [m.month, m.rows.reduce((n, r) => n + r.accounts, 0)])).toEqual([
      ['2026-10', 2],
      ['2026-11', 1],
    ])
    expect(existsSync(join(dir, MONTHS_FILE))).toBe(true)
  })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})
