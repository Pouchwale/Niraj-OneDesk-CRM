/**
 * Modules per coordinator (Admin Panel, 16 Nov 2026): the administrator
 * switches modules off per coordinator; a switched-off module leaves their
 * menu and its score is N/A, left out of the final score (the other ratio
 * shares fill 100%), in every period.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { demoCompanyStore } from '@/lib/demo-companies'
import { finalScoreOf, markSwitchedOff, type PeriodScores } from '@/lib/score-history'
import { moduleAccessRefusal, mayCall } from '../../server/modules/data/operations'
import { cleanModulesOff, moduleOfPath, moduleOn, scoreModulesOff } from '../../shared/module-access'

beforeEach(() => {
  demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), moduleAccess: [] })
})

describe('the switches', () => {
  it('keeps known modules only, and an empty list switches everything back on', () => {
    expect(cleanModulesOff(['service', 'nonsense', 'service', 'rfd'])).toEqual(['rfd', 'service'])
    demoCompanyStore.setModuleAccess('coord-1', ['service', 'robi_tasks'], 'admin-0', '2026-11-16T05:00:00.000Z')
    expect(demoCompanyStore.getModulesOff('coord-1')).toEqual(['service', 'robi_tasks'])
    expect(demoCompanyStore.isModuleOff('coord-1', 'service')).toBe(true)
    expect(demoCompanyStore.isModuleOff('coord-2', 'service')).toBe(false)
    demoCompanyStore.setModuleAccess('coord-1', [], 'admin-0', '2026-11-16T05:01:00.000Z')
    expect(demoCompanyStore.moduleAccess).toEqual([])
  })

  it('hides a page only from a coordinator who has it off', () => {
    const access = [{ coordinatorId: 'coord-1', off: ['service' as const, 'overdue_payments' as const], by: 'admin-0', at: '' }]
    expect(moduleOfPath('/service')).toBe('service')
    expect(moduleOfPath('/overdue/abc')).toBe('overdue_payments')
    expect(moduleOfPath('/')).toBeNull()
    expect(moduleOfPath('/score-history')).toBeNull()
    expect(moduleOn(access, { id: 'coord-1', role: 'coordinator' }, 'service')).toBe(false)
    expect(moduleOn(access, { id: 'coord-1', role: 'coordinator' }, 'quotations')).toBe(true)
    expect(moduleOn(access, { id: 'coord-2', role: 'coordinator' }, 'service')).toBe(true)
    expect(moduleOn(access, { id: 'coord-1', role: 'team_leader' }, 'service')).toBe(true)
    // Overdue Payments off takes both Overdue Scoring books with it.
    expect([...scoreModulesOff(access, 'coord-1')].sort()).toEqual(['kpi', 'kpi_dispute', 'service'])
  })

  it('lets only the administrator change them', () => {
    expect(moduleAccessRefusal('admin', 'setModuleAccess')).toBeNull()
    expect(moduleAccessRefusal('team_leader', 'setModuleAccess')).toMatch(/administrator/)
    expect(moduleAccessRefusal('coordinator', 'setModuleAccess')).toMatch(/administrator/)
    expect(mayCall('coordinator', 'setModuleAccess')).toBe(false)
  })
})

describe('the final score with a module switched off', () => {
  const weights = { robi: 10, kpi: 25, kpi_dispute: 10, quotations: 15, billing: 10, service: 20, self_leads: 10 }
  // Every module at full marks except Service, which has no score.
  const full = (['robi', 'kpi', 'kpi_dispute', 'quotations', 'billing', 'self_leads'] as const).map((module) => ({
    module,
    // Robi's score is its gap from 100, so 0 is full marks.
    score: module === 'robi' ? 0 : 100,
  }))

  it('counts a missing module -100 as before while it is switched on', () => {
    expect(finalScoreOf(full, weights).score).toBe(80)
  })

  it('leaves a switched-off module out, the other shares filling 100%', () => {
    const final = finalScoreOf([...full, { module: 'service' as const, score: null, na: true }], weights)
    expect(final.score).toBe(100)
    expect(final.na).toEqual(['service'])
  })

  it('leaves it out of the plain average too, even when it has a score', () => {
    expect(finalScoreOf([{ module: 'billing', score: 100 }, { module: 'quotations', score: 40, na: true }]).score).toBe(100)
  })

  it('marks every period, locked ones too, adding N/A where the module had no score', () => {
    const period = (id: string, locked: boolean): PeriodScores => ({
      id, kind: 'month', key: id, start: '', end: '', lockedAt: locked ? '2026-10-03' : null, lockedBy: 'auto',
      entries: [
        { coordinatorId: 'coord-1', name: 'A', module: 'service', score: 80, detail: {} },
        { coordinatorId: 'coord-2', name: 'B', module: 'service', score: 70, detail: {} },
      ],
    })
    const access = [{ coordinatorId: 'coord-1', off: ['service' as const, 'quotations' as const], by: '', at: '' }]
    const shown = markSwitchedOff([period('2026-09', true), period('2026-11', false)], (id) => scoreModulesOff(access, id), ['coord-1'])
    for (const p of shown) {
      expect(p.entries.find((e) => e.coordinatorId === 'coord-1' && e.module === 'service')).toMatchObject({ score: null, na: true })
      expect(p.entries.find((e) => e.coordinatorId === 'coord-1' && e.module === 'quotations')).toMatchObject({ na: true })
      expect(p.entries.find((e) => e.coordinatorId === 'coord-2')).toMatchObject({ score: 70 })
    }
  })
})
