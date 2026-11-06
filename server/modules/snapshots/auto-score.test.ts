import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OverdueSnapshotMeta } from '../../../shared/snapshots'
import type { OverduePayment } from '../../../src/lib/types'
import { scoreTwoDays, transformOverdueDay } from '../../../src/features/snapshots/transform'
import { lastTwoSaturdays, runAutoScore, saturdayPair } from './auto-score'
import { createSnapshotStore, type SnapshotStore } from './store'

// October 2026: Saturdays 3, 10 and 17, Mondays 5, 12 and 19. Times are local.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute, 0)
const meta = (id: string, when: Date) => ({ id, savedAt: when.toISOString() }) as OverdueSnapshotMeta

describe('which two days the weekly score compares', () => {
  it('knows last Saturday and the one before, from any day', () => {
    expect(lastTwoSaturdays(at(12, 10))).toEqual({ saturday: '2026-10-10', before: '2026-10-03' }) // Monday
    expect(lastTwoSaturdays(at(10, 18))).toEqual({ saturday: '2026-10-10', before: '2026-10-03' }) // that Saturday
    expect(lastTwoSaturdays(at(11, 9))).toEqual({ saturday: '2026-10-10', before: '2026-10-03' }) // Sunday
  })

  it('takes last Saturday’s day and the Saturday before, never the Monday saves', () => {
    const oldSaturday = meta('sat-3', at(3, 10))
    const monday = meta('mon-5', at(5, 10))
    const newSaturday = meta('sat-10', at(10, 10, 5))
    const thisMonday = meta('mon-12', at(12, 10))
    expect(saturdayPair(at(12, 10, 30), [thisMonday, newSaturday, monday, oldSaturday])).toEqual({ oldDay: oldSaturday, newDay: newSaturday })

    // Two saves last Saturday: the newer; two the Saturday before: the one nearest a week earlier.
    const laterSaturday = meta('sat-10-late', at(10, 17))
    const earlyOld = meta('sat-3-early', at(3, 9))
    const lateOld = meta('sat-3-late', at(3, 16))
    expect(saturdayPair(at(12, 11), [laterSaturday, newSaturday, lateOld, earlyOld])).toEqual({ oldDay: lateOld, newDay: laterSaturday })

    // A Saturday with no saved day: nothing to compare, even with Monday's day there.
    expect(saturdayPair(at(12, 11), [thisMonday, newSaturday, monday])).toBeNull()
    expect(saturdayPair(at(12, 11), [thisMonday, monday, oldSaturday])).toBeNull()
  })
})

describe('the weekly score itself', () => {
  let dir = ''
  let clock = at(3, 10)
  let snapshots: SnapshotStore
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const nameOf = (id: string) => ({ 'coord-1': 'Pragati Patel', 'coord-2': 'Diya Prajapati' })[id] ?? id
  const deps = () => ({ snapshots, nameOf, logger: logger as never, now: () => clock })

  // Regular customers and one in dispute; balances fall from one Saturday to the next.
  const row = (id: string, coordinator: string, d31: number, d121: number, dispute = false) =>
    ({
      id, bp_code: `C-${id}`, customer_name: id, balance_due: d31 + d121, due_0_30: 0, due_31_60: d31, due_61_90: 0, due_91_120: 0,
      due_121_plus: d121, assigned_coordinator_id: coordinator, status: 'critical',
      ...(dispute ? { no_followup_at: '2026-09-01T00:00:00.000Z', no_followup_kind: 'dispute' } : {}),
    }) as unknown as OverduePayment
  const saveDay = (when: Date, rows: OverduePayment[], by = 'system') => {
    clock = when
    return snapshots.saveDay({ savedBy: by, savedByName: by, fileModifiedAt: null, percentage: 10, rows, table: transformOverdueDay(rows, 10, nameOf) })
  }
  const weekBefore = [row('a', 'coord-1', 20000, 50000), row('b', 'coord-2', 8000, 12000), row('d', 'coord-1', 0, 30000, true)]
  const lastWeek = [row('a', 'coord-1', 10000, 40000), row('b', 'coord-2', 8000, 11000), row('d', 'coord-1', 0, 15000, true)]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autoscore-'))
    snapshots = createSnapshotStore(dir, { now: () => clock })
    snapshots.saveSettings(10, 'admin-1')
    vi.clearAllMocks()
  })
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  it('runs on Monday from 10:00 only', () => {
    saveDay(at(3, 10), weekBefore)
    saveDay(at(10, 10), lastWeek)
    clock = at(13, 11) // Tuesday
    expect(runAutoScore(deps())).toBe('no')
    clock = at(10, 12) // the Saturday itself
    expect(runAutoScore(deps())).toBe('no')
    clock = at(12, 9, 59)
    expect(runAutoScore(deps())).toBe('wait')
    expect(snapshots.listResults()).toEqual([])
  })

  it('scores Saturday against Saturday like the button, for regular and dispute accounts, once', () => {
    const older = saveDay(at(3, 10, 2), weekBefore)
    saveDay(at(5, 10, 2), weekBefore) // a Monday save: not used
    const newer = saveDay(at(10, 10, 2), lastWeek)
    saveDay(at(12, 10, 1), lastWeek) // this Monday's save: not used either
    const told = new Set<string>()

    clock = at(12, 10, 5)
    // No dispute percentage yet: regular only, and the skip is logged once.
    expect(runAutoScore(deps(), told)).toEqual({ regular: 'generated', dispute: 'no-dispute-percentage' })
    const regular = snapshots.getResult(`${older.id}--${newer.id}`)!
    expect(regular).toMatchObject({ book: 'regular', generatedBy: 'system', generatedByName: 'Automatic (Monday)', oldId: older.id, newId: newer.id })
    const asTheButton = scoreTwoDays(snapshots.getDay(older.id)!.table, snapshots.getDay(newer.id)!.table)
    expect(regular.rows).toEqual(asTheButton.rows)
    expect(regular.rows.find((r) => r.coordinatorName === 'Pragati Patel')!.kpiScore).toBe(100)

    clock = at(12, 10, 10)
    expect(runAutoScore(deps(), told)).toEqual({ regular: 'already', dispute: 'no-dispute-percentage' })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(snapshots.listResults()).toHaveLength(1)

    // The dispute percentage is set later that Monday: the dispute score follows.
    snapshots.saveDisputeSettings(20, 'admin-1')
    clock = at(12, 11)
    expect(runAutoScore(deps(), told)).toEqual({ regular: 'already', dispute: 'generated' })
    const dispute = snapshots.getResult(`${older.id}--${newer.id}--dispute`)!
    expect(dispute).toMatchObject({ book: 'dispute', generatedByName: 'Automatic (Monday)' })
    // Only the customers in dispute: Pragati's 30,000 at 121+ against a 20% target, down to 15,000.
    expect(dispute.oldTable).toEqual([expect.objectContaining({ coordinatorName: 'Pragati Patel', due121Plus: 30000, target121Plus: 6000 })])
    expect(dispute.rows).toEqual([expect.objectContaining({ coordinatorName: 'Pragati Patel', achieve120Plus: 15000, kpiScore: 50 })])
    expect(snapshots.listResults()).toHaveLength(2)
  })

  it('leaves a score made by hand for last Saturday’s day alone', () => {
    const monday = saveDay(at(5, 10), weekBefore)
    const older = saveDay(at(3, 10), weekBefore)
    const newer = saveDay(at(10, 10), lastWeek, 'niki')
    // Niki scored last Saturday against Monday the 5th herself.
    clock = at(10, 15)
    snapshots.saveResult({
      generatedBy: 'niki', generatedByName: 'Niki Patel', oldId: monday.id, newId: newer.id, oldSavedAt: monday.savedAt, newSavedAt: newer.savedAt,
      rows: [], flags: [], oldTable: [], newTable: [],
    })
    clock = at(12, 10, 5)
    expect(runAutoScore(deps())).toEqual({ regular: 'already', dispute: 'no-dispute-percentage' })
    const results = snapshots.listResults()
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ generatedByName: 'Niki Patel', oldId: monday.id })
    expect(snapshots.getResult(`${older.id}--${newer.id}`)).toBeNull()
  })

  it('makes nothing when a Saturday has no saved day', () => {
    saveDay(at(5, 10), weekBefore) // only Monday saves the week before
    saveDay(at(10, 10), lastWeek)
    clock = at(12, 10, 5)
    expect(runAutoScore(deps())).toEqual({ regular: 'no-old-day', dispute: 'no-old-day' })

    // The next Monday, nothing was saved on Saturday the 17th.
    clock = at(19, 10, 5)
    expect(runAutoScore(deps())).toEqual({ regular: 'no-new-day', dispute: 'no-new-day' })
    expect(snapshots.listResults()).toEqual([])
  })
})
