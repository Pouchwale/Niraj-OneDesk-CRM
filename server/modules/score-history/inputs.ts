/**
 * The records the score history is worked out from, gathered on the server:
 * the shared store, the saved Weekly KPI scores and today's coordinators.
 */

import type { AuthUser } from '../../../shared/auth'
import { teamDayScores } from '../../../src/features/assistant/scores'
import { attendanceLookup, weekOf, type KpiWeek, type ScoreInputs } from '../../../src/lib/score-history'
import { toLocalISODate } from '../../../src/lib/utils'
import type { DataStore } from '../data/store'
import type { SnapshotStore } from '../snapshots/store'

const clean = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

export function scoreInputs(data: DataStore, snapshots: SnapshotStore, roster: () => AuthUser[], now: () => Date = () => new Date()): ScoreInputs {
  const snap = data.snapshot()
  const coordinators = roster()
    .filter((u) => u.role === 'coordinator')
    .map((u) => ({ id: u.id, name: u.full_name }))
  const ids = coordinators.map((c) => c.id)

  const { scores } = teamDayScores({
    companies: snap.companies,
    overduePayments: snap.overduePayments,
    dailyPlans: snap.dailyPlans ?? [],
    followups: snap.followups,
    coordinatorIds: ids,
    today: toLocalISODate(now()),
    attendanceOf: attendanceLookup(snap.attendance ?? [], snap.robiOffDays ?? []),
  })

  // A saved KPI names people as written in the sheet: matched to today's coordinators by name
  // (the team leader's own line in the sheet is not a coordinator's score).
  const byName = new Map(coordinators.map((c) => [clean(c.name), c.id]))
  const kpiWeeks: KpiWeek[] = []
  for (const meta of snapshots.listResults()) {
    const result = snapshots.getResult(meta.id)
    if (!result) continue
    kpiWeeks.push({
      book: result.book === 'dispute' ? 'dispute' : 'regular',
      weekStart: weekOf(toLocalISODate(new Date(result.oldSavedAt))),
      generatedAt: result.generatedAt,
      rows: result.rows.map((r) => ({ coordinatorId: byName.get(clean(r.coordinatorName)) ?? null, kpiScore: r.kpiScore })),
    })
  }

  return {
    coordinators,
    robiDays: scores,
    kpiWeeks,
    quotations: snap.quotations ?? [],
    billingIssues: snap.billingIssues ?? [],
    serviceRecords: snap.serviceRecords ?? [],
    serviceTargets: snap.serviceTargets ?? [],
    selfLeads: snap.selfLeads ?? [],
  }
}
