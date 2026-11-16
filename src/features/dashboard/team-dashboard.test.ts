/**
 * The team dashboard's arithmetic (16 Nov 2026): final score and its change,
 * the module costing most, overdue collected since Saturday, commitments,
 * quotations, RFD and billing issues per coordinator; N/A where switched off.
 */

import { describe, expect, it } from 'vitest'

import type { PeriodScores } from '@/lib/score-history'
import type { Quotation } from '@/lib/types'
import { collectedSince, teamTotals, teamWeek } from './team-dashboard'

const period = (key: string, entries: [string, string, number | null][], weights: Record<string, number> | null = null): PeriodScores => ({
  id: `week:${key}`, kind: 'week', key, start: key, end: key, lockedAt: null, lockedBy: null, finalWeights: weights,
  entries: entries.map(([coordinatorId, module, score]) => ({ coordinatorId, name: coordinatorId, module: module as never, score, detail: {} })),
})
const quote = (id: string, who: string, status: string, quotation_date: string, closing_date: string | null, amount = 0) =>
  ({ id, coordinator_id: who, status, quotation_date, closing_date, amount }) as unknown as Quotation

const base = {
  weekStart: '2026-11-07',
  today: '2026-11-16',
  coordinators: [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Bina' }],
  week: period('2026-11-07', [['a', 'billing', 100], ['a', 'quotations', 40], ['b', 'billing', 50]]),
  previousWeek: period('2026-10-31', [['a', 'billing', 60], ['a', 'quotations', 40]]),
  month: period('2026-11', [['a', 'billing', 80]]),
  overdueAtStart: [
    { bp_code: 'C1', balance_due: 1000, assigned_coordinator_id: 'a' },
    { bp_code: 'C2', balance_due: 500, assigned_coordinator_id: 'a' },
    { bp_code: 'C3', balance_due: 300, assigned_coordinator_id: 'b' },
  ],
  overdueAtEnd: [
    { bp_code: 'c1', balance_due: 400, assigned_coordinator_id: 'a' }, // 600 came down
    // C2 paid off entirely: 500
    { bp_code: 'C3', balance_due: 900, assigned_coordinator_id: 'b' }, // went up: not a collection
    { bp_code: 'C9', balance_due: 5000, assigned_coordinator_id: 'a' }, // new overdue: not subtracted
  ],
  commitments: [
    { bp_code: 'C1', amount: 200, committed_date: '2026-11-10', coordinator_id: 'a' },
    { bp_code: 'C2', amount: 300, committed_date: '2026-11-20', coordinator_id: 'a' },
    { bp_code: 'C3', amount: 50, committed_date: '2026-11-01', coordinator_id: 'b' },
  ],
  quotations: [
    quote('q1', 'a', 'open', '2026-11-08', null),
    quote('q2', 'a', 'closed', '2026-11-01', '2026-11-09', 1000),
    quote('q3', 'a', 'lost', '2026-11-09', '2026-11-12'),
    quote('q4', 'a', 'closed', '2026-10-01', '2026-10-05', 999),
  ],
  rfdRows: [{ assigned_coordinator_id: 'a', pending_value: 700 }, { assigned_coordinator_id: 'a', pending_value: 300 }],
  billingIssues: [{ date: '2026-11-09', responsible_1: 'b' }, { date: '2026-10-09', responsible_1: 'b' }],
  modulesOff: () => new Set<never>(),
}

describe('the team dashboard', () => {
  it('works out each coordinator’s week', () => {
    const [asha, bina] = teamWeek(base)
    expect(asha).toMatchObject({ final: 70, previousFinal: 50, change: 20, monthFinal: 80, collected: 1100 })
    expect(asha.weakest).toMatchObject({ module: 'quotations', lost: 60 })
    expect(asha.commitments).toEqual({ dueThisWeek: 200, dueCount: 1, missed: 200, missedCount: 1, open: 500, openCount: 2 })
    expect(asha.quotations).toEqual({ made: 2, closed: 1, lost: 1, valueWon: 1000, winRate: 50 })
    expect(asha.rfd).toEqual({ rows: 2, pending: 1000 })
    expect(bina).toMatchObject({ final: 50, change: null, collected: 0, billingIssues: 1 })
  })

  it('counts only drops, and nothing without the Saturday’s saved day', () => {
    expect(collectedSince(null, base.overdueAtEnd)).toBeNull()
    expect(teamWeek({ ...base, overdueAtStart: null })[0].collected).toBeNull()
  })

  it('shows N/A for modules switched off for a coordinator', () => {
    const [asha] = teamWeek({ ...base, modulesOff: (id: string) => new Set(id === 'a' ? (['quotations', 'rfd', 'overdue_payments'] as const) : []) as never })
    expect(asha).toMatchObject({ quotations: null, rfd: null, collected: null })
    expect(asha.commitments).not.toBeNull()
  })

  it('totals the team for the cards', () => {
    const t = teamTotals(teamWeek(base))
    expect(t).toMatchObject({ final: 60, collected: 1100, dueThisWeek: 200, missed: 250, quotationsMade: 2, valueWon: 1000, rfdPending: 1000, billingIssues: 1 })
  })
})
