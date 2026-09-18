/**
 * The saved days of the Overdue book.
 *
 * What matters: a saved day is exactly what was saved and never changes; it
 * keeps the percentage it was saved with; it is gone after three months; and
 * nothing a request sends can reach a file outside the folder.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SnapshotTableRow } from '../../../shared/snapshots'
import { createSnapshotStore, isSafeId, SnapshotInputError } from './store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crm-snapshots-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const line = (name: string, over: Partial<SnapshotTableRow> = {}): SnapshotTableRow => ({
  coordinatorId: name.toLowerCase(),
  coordinatorName: name,
  balanceDue: 2400000,
  due0to30: 1000000,
  due31to60: 500000,
  due61to90: 300000,
  due91to120: 200000,
  due121Plus: 400000,
  target0to120: 400000,
  target121Plus: 80000,
  ...over,
})

const day = (over: Record<string, unknown> = {}) => ({
  savedBy: 'admin-1',
  savedByName: 'Niki',
  fileModifiedAt: '2026-09-11T03:30:00.000Z',
  percentage: 20,
  rows: [{ id: 'o1', bp_code: 'C1', balance_due: 2400000 }],
  table: [line('Pragati')],
  ...over,
})

/** A clock the test moves. */
const clock = (start = new Date(2026, 8, 11, 9, 40)) => {
  let t = start.getTime()
  return { now: () => new Date(t), advanceDays: (n: number) => (t += n * 86_400_000) }
}

describe('saving a day', () => {
  it('keeps exactly what was saved', () => {
    const store = createSnapshotStore(dir)
    const meta = store.saveDay(day())
    const saved = store.getDay(meta.id)!

    expect(saved.rows).toEqual([{ id: 'o1', bp_code: 'C1', balance_due: 2400000 }])
    expect(saved.table).toEqual([line('Pragati')])
    expect(saved.savedByName).toBe('Niki')
    expect(saved.fileModifiedAt).toBe('2026-09-11T03:30:00.000Z')
  })

  it('summarises it for the list without the list reading the whole book', () => {
    const store = createSnapshotStore(dir)
    const meta = store.saveDay(day({ table: [line('Pragati'), line('Vishva', { balanceDue: 100000 })] }))

    expect(meta.rowCount).toBe(1)
    expect(meta.coordinatorCount).toBe(2)
    expect(meta.totalBalance).toBe(2500000)
    expect(readdirSync(join(dir, 'days')).sort()).toEqual([`${meta.id}.json`, `${meta.id}.meta.json`])
  })

  it('keeps the percentage it was saved with', () => {
    // Changing the percentage applies to days saved from then on only.
    const store = createSnapshotStore(dir)
    const first = store.saveDay(day({ percentage: 20 }))
    store.saveSettings(25, 'admin-1')
    store.saveDay(day({ percentage: 25 }))

    expect(store.getDay(first.id)!.percentage).toBe(20)
  })

  it('allows several saves on the same day, newest first', () => {
    const c = clock()
    const store = createSnapshotStore(dir, { now: c.now })
    const morning = store.saveDay(day())
    c.advanceDays(0.3)
    const evening = store.saveDay(day())

    expect(store.listDays().map((d) => d.id)).toEqual([evening.id, morning.id])
  })

  it('refuses a day with no percentage, no rows or a broken table', () => {
    const store = createSnapshotStore(dir)
    expect(() => store.saveDay(day({ percentage: 0 }))).toThrow(SnapshotInputError)
    expect(() => store.saveDay(day({ percentage: 150 }))).toThrow(SnapshotInputError)
    expect(() => store.saveDay(day({ rows: undefined }))).toThrow(SnapshotInputError)
    expect(() => store.saveDay(day({ table: [{ coordinatorName: 'X' }] }))).toThrow(SnapshotInputError)
    expect(store.listDays()).toEqual([])
  })

  it('can be deleted', () => {
    const store = createSnapshotStore(dir)
    const meta = store.saveDay(day())
    expect(store.removeDay(meta.id)).toBe(true)
    expect(store.getDay(meta.id)).toBeNull()
    expect(store.listDays()).toEqual([])
    expect(store.removeDay(meta.id)).toBe(false)
  })
})

describe('the target percentage', () => {
  it('is unset until somebody sets it', () => {
    expect(createSnapshotStore(dir).getSettings().percentage).toBeNull()
  })

  it('is kept, with who set it', () => {
    const store = createSnapshotStore(dir)
    store.saveSettings(20, 'admin-1')
    const again = createSnapshotStore(dir).getSettings()
    expect(again.percentage).toBe(20)
    expect(again.updatedBy).toBe('admin-1')
  })

  it('must be above 0 and at most 100', () => {
    const store = createSnapshotStore(dir)
    expect(() => store.saveSettings(0, 'x')).toThrow(SnapshotInputError)
    expect(() => store.saveSettings(101, 'x')).toThrow(SnapshotInputError)
    expect(() => store.saveSettings('20', 'x')).toThrow(SnapshotInputError)
  })
})

describe('results', () => {
  const result = (oldId: string, newId: string) => ({
    generatedBy: 'admin-1',
    generatedByName: 'Niki',
    oldId,
    newId,
    oldSavedAt: '2026-09-04T04:00:00.000Z',
    newSavedAt: '2026-09-11T04:00:00.000Z',
    rows: [
      { coordinatorName: 'Pragati', target30to120: 400000, achieve30to120: 250000, target120Plus: 80000, achieve120Plus: 100000, kpiScore: 81.25 },
    ],
    flags: [],
    oldTable: [line('Pragati')],
    newTable: [line('Pragati')],
  })

  it('keeps one result per pair of days', () => {
    const store = createSnapshotStore(dir)
    const a = store.saveDay(day())
    const b = store.saveDay(day())
    store.saveResult(result(a.id, b.id))
    store.saveResult(result(a.id, b.id))

    expect(store.listResults()).toHaveLength(1)
    expect(store.getResult(`${a.id}--${b.id}`)!.rows[0].kpiScore).toBe(81.25)
  })

  it('refuses a result that compares a day with itself', () => {
    const store = createSnapshotStore(dir)
    const a = store.saveDay(day())
    expect(() => store.saveResult(result(a.id, a.id))).toThrow(SnapshotInputError)
  })
})

describe('three months, then gone', () => {
  it('removes days and results older than 90 days, and keeps the rest', () => {
    const c = clock()
    const store = createSnapshotStore(dir, { now: c.now })
    const old = store.saveDay(day())
    c.advanceDays(10)
    const recent = store.saveDay(day())
    store.saveResult({
      generatedBy: 'admin-1', oldId: old.id, newId: recent.id,
      oldSavedAt: old.savedAt, newSavedAt: recent.savedAt,
      rows: [], flags: [], oldTable: [], newTable: [],
    })

    c.advanceDays(85) // the old day is now 95 days old, the recent one 85
    expect(store.listDays().map((d) => d.id)).toEqual([recent.id])
    expect(existsSync(join(dir, 'days', `${old.id}.json`))).toBe(false)
    expect(store.listResults()).toHaveLength(1)

    c.advanceDays(10) // the result is now 95 days old
    expect(store.listResults()).toHaveLength(0)
  })
})

describe('nothing reaches outside the folder', () => {
  it('only accepts plain ids', () => {
    expect(isSafeId('20260911-094000-a1b2')).toBe(true)
    expect(isSafeId('../settings')).toBe(false)
    expect(isSafeId('..\\..\\x')).toBe(false)
    expect(isSafeId('a/b')).toBe(false)
  })

  it('reads nothing for an id that is not plain', () => {
    const store = createSnapshotStore(dir)
    store.saveSettings(20, 'x')
    expect(store.getDay('../settings')).toBeNull()
    expect(store.removeDay('../settings')).toBe(false)
    expect(existsSync(join(dir, 'settings.json'))).toBe(true)
  })
})
