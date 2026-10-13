import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OverduePayment } from '../../../src/lib/types'
import { kpiGap, kpiGapLabel } from '../../../src/features/snapshots/transform'
import { autoSaveDue, runAutoSave } from './auto-save'
import { createSnapshotStore } from './store'

// 12 Oct 2026 is a Monday; times are local.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0)
const isoAt = (day: number, hour: number) => at(day, hour).toISOString()

describe('when the Monday day is saved', () => {
  it('waits for the morning, then for that morning\'s Overdue import, then saves once', () => {
    expect(autoSaveDue(at(13, 11), [], isoAt(13, 9))).toBe('no') // Tuesday
    expect(autoSaveDue(at(12, 9), [], isoAt(12, 9))).toBe('wait') // too early
    expect(autoSaveDue(at(12, 10), [], isoAt(9, 10))).toBe('wait') // not synced yet this morning
    expect(autoSaveDue(at(12, 10), [], isoAt(12, 9))).toBe('save')
    expect(autoSaveDue(at(12, 13), [], isoAt(9, 10))).toBe('save-stale') // nobody synced by 13:00
    expect(autoSaveDue(at(12, 11), ['2026-10-12'], isoAt(12, 9))).toBe('no') // already saved
  })
})

describe('the Monday save itself', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  const row = (id: string, coordinator: string, b121: number) =>
    ({
      id, bp_code: `C-${id}`, customer_name: id, balance_due: b121 + 1000, due_0_30: 1000, due_31_60: 0, due_61_90: 0,
      due_91_120: 0, due_121_plus: b121, assigned_coordinator_id: coordinator, status: 'critical', imported_at: isoAt(12, 9),
    }) as unknown as OverduePayment

  it('saves the day like the button does, once, and needs a target percentage', () => {
    dir = mkdtempSync(join(tmpdir(), 'autosave-'))
    const snapshots = createSnapshotStore(dir, { now: () => at(12, 10) })
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const deps = {
      snapshots,
      overduePayments: () => [row('a', 'coord-1', 50000), row('b', 'coord-2', 20000)],
      nameOf: (id: string) => ({ 'coord-1': 'Pragati Patel', 'coord-2': 'Diya Prajapati' })[id] ?? id,
      logger: logger as never,
      now: () => at(12, 10),
    }
    expect(runAutoSave(deps)).toBe('no-percentage')
    snapshots.saveSettings(10, 'admin-1')
    expect(runAutoSave(deps)).toBe('save')
    const days = snapshots.listDays()
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ savedBy: 'system', savedByName: 'Automatic (Monday)', coordinatorCount: 2 })
    // A second check the same morning does nothing.
    expect(runAutoSave(deps)).toBe('no')
    expect(snapshots.listDays()).toHaveLength(1)
  })
})

describe('the KPI score, written as the gap from 100%', () => {
  it('reads 80 as -20% and 100 as 0%', () => {
    expect(kpiGapLabel(80)).toBe('-20%')
    expect(kpiGapLabel(100)).toBe('0%')
    expect(kpiGap(16.43)).toBe(-83.57)
  })
})
