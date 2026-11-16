/**
 * The team leader's (and administrator's) dashboard, 16 Nov 2026, the user's
 * picks: for a Saturday-to-Friday week, per coordinator, the final score (and
 * its change from the week before, the month's, and the module losing the most
 * points), the overdue collected since that Saturday, client commitments (due
 * that week, missed, all open), quotations of the week, Ready for Dispatch
 * waiting and billing issues of the week. Pure: the page gathers the records.
 */

import type { Commitment } from '@/lib/followups-api'
import { finalScoreOf, SCORE_MODULES, type PeriodScores, type ScoreModule } from '@/lib/score-history'
import { performanceOf, quotationDay } from '@/lib/quotation-stats'
import type { BillingIssue, OverduePayment, Quotation, RfdRow } from '@/lib/types'
import type { AppModuleId } from '../../../shared/module-access'

export interface TeamWeekInput {
  /** The week's Saturday (yyyy-mm-dd) and today. */
  weekStart: string
  today: string
  coordinators: readonly { id: string; name: string }[]
  /** The week's scores, the week before's and the month's, as shown (switched-off modules marked N/A). */
  week: PeriodScores | null
  previousWeek: PeriodScores | null
  month: PeriodScores | null
  /** The Overdue book saved on the week's Saturday, and the book at its end (next Saturday's day, or today's). */
  overdueAtStart: readonly Pick<OverduePayment, 'bp_code' | 'balance_due' | 'assigned_coordinator_id'>[] | null
  overdueAtEnd: readonly Pick<OverduePayment, 'bp_code' | 'balance_due' | 'assigned_coordinator_id'>[]
  commitments: readonly Commitment[]
  quotations: readonly Quotation[]
  rfdRows: readonly Pick<RfdRow, 'assigned_coordinator_id' | 'pending_value'>[]
  billingIssues: readonly Pick<BillingIssue, 'date' | 'responsible_1'>[]
  /** The modules switched off for a coordinator (Admin Panel): those columns show N/A. */
  modulesOff: (coordinatorId: string) => ReadonlySet<AppModuleId>
}

export interface TeamWeekRow {
  coordinatorId: string
  name: string
  final: number | null
  previousFinal: number | null
  /** final − previousFinal, in points; null when either is missing. */
  change: number | null
  monthFinal: number | null
  /** The module that cost the most points that week, and how many. */
  weakest: { module: ScoreModule; label: string; lost: number } | null
  /** null: N/A (Overdue Payments switched off), or no day saved on the Saturday. */
  collected: number | null
  commitments: { dueThisWeek: number; dueCount: number; missed: number; missedCount: number; open: number; openCount: number } | null
  quotations: { made: number; closed: number; lost: number; valueWon: number; winRate: number | null } | null
  rfd: { rows: number; pending: number } | null
  billingIssues: number | null
}

export const addDaysISO = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const sum = (values: number[]) => Math.round(values.reduce((a, v) => a + v, 0) * 100) / 100
const code = (v: unknown) => String(v ?? '').trim().toUpperCase()

/** The module that cost a coordinator the most points: with a ratio, its share of the gap; without, the lowest score. */
export function weakestModule(final: ReturnType<typeof finalScoreOf>): TeamWeekRow['weakest'] {
  let worst: TeamWeekRow['weakest'] = null
  for (const part of final.parts) {
    const share = final.weights ? (final.weights[part.module] ?? 0) : 100
    if (final.weights && share <= 0) continue
    const lost = Math.round(((100 - part.value) * share) / 100 * 10) / 10
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { module: part.module, label: SCORE_MODULES.find((m) => m.id === part.module)?.label ?? part.module, lost }
  }
  // With a ratio, a module with a share but no score counts -100 for it.
  if (final.weights) {
    for (const m of SCORE_MODULES) {
      const share = final.weights[m.id] ?? 0
      if (share <= 0 || final.na?.includes(m.id) || final.parts.some((p) => p.module === m.id)) continue
      if (!worst || share > worst.lost) worst = { module: m.id, label: m.label, lost: share }
    }
  }
  return worst
}

/** How much each coordinator's overdue came down since the Saturday: per customer, only drops count (new overdue is not subtracted). */
export function collectedSince(start: TeamWeekInput['overdueAtStart'], end: TeamWeekInput['overdueAtEnd']): Map<string, number> | null {
  if (!start) return null
  const now = new Map<string, number>()
  for (const r of end) now.set(code(r.bp_code), (now.get(code(r.bp_code)) ?? 0) + (r.balance_due ?? 0))
  const out = new Map<string, number>()
  for (const r of start) {
    if (!r.assigned_coordinator_id) continue
    const drop = (r.balance_due ?? 0) - (now.get(code(r.bp_code)) ?? 0)
    if (drop > 0) out.set(r.assigned_coordinator_id, (out.get(r.assigned_coordinator_id) ?? 0) + drop)
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100)
  return out
}

export function teamWeek(input: TeamWeekInput): TeamWeekRow[] {
  const end = addDaysISO(input.weekStart, 6)
  const inWeek = (day: string | null | undefined) => Boolean(day) && day! >= input.weekStart && day! <= end
  const collected = collectedSince(input.overdueAtStart, input.overdueAtEnd)
  const finalOf = (p: PeriodScores | null, id: string) => (p ? finalScoreOf(p.entries.filter((e) => e.coordinatorId === id), p.finalWeights ?? null) : null)

  return input.coordinators.map((c) => {
    const off = input.modulesOff(c.id)
    const week = finalOf(input.week, c.id)
    const previous = finalOf(input.previousWeek, c.id)
    const final = week?.score ?? null
    const previousFinal = previous?.score ?? null
    const promises = input.commitments.filter((p) => p.coordinator_id === c.id)
    const due = promises.filter((p) => inWeek(p.committed_date))
    const missed = promises.filter((p) => p.committed_date < input.today)
    const mine = input.quotations.filter((q) => q.coordinator_id === c.id)
    const decided = mine.filter((q) => (q.status === 'closed' || q.status === 'lost') && inWeek(q.closing_date))
    const perf = performanceOf(decided)
    const rfd = input.rfdRows.filter((r) => r.assigned_coordinator_id === c.id)
    return {
      coordinatorId: c.id,
      name: c.name,
      final,
      previousFinal,
      change: final !== null && previousFinal !== null ? Math.round((final - previousFinal) * 10) / 10 : null,
      monthFinal: finalOf(input.month, c.id)?.score ?? null,
      weakest: week ? weakestModule(week) : null,
      collected: off.has('overdue_payments') || !collected ? null : (collected.get(c.id) ?? 0),
      commitments:
        off.has('active_payments') && off.has('overdue_payments')
          ? null
          : {
              dueThisWeek: sum(due.map((p) => p.amount || 0)),
              dueCount: due.length,
              missed: sum(missed.map((p) => p.amount || 0)),
              missedCount: missed.length,
              open: sum(promises.map((p) => p.amount || 0)),
              openCount: promises.length,
            },
      quotations: off.has('quotations')
        ? null
        : { made: mine.filter((q) => inWeek(quotationDay(q))).length, closed: perf.closed, lost: perf.lost, valueWon: perf.valueWon, winRate: perf.winRate },
      rfd: off.has('rfd') ? null : { rows: rfd.length, pending: sum(rfd.map((r) => r.pending_value || 0)) },
      billingIssues: off.has('billing_issues') ? null : input.billingIssues.filter((b) => b.responsible_1 === c.id && inWeek(b.date)).length,
    }
  })
}

/** The team's figures for the cards: averages of the final scores, totals of the rest (N/A lines left out). */
export function teamTotals(rows: readonly TeamWeekRow[]) {
  const avg = (values: (number | null)[]) => {
    const list = values.filter((v): v is number => v !== null)
    return list.length ? Math.round((list.reduce((a, v) => a + v, 0) / list.length) * 10) / 10 : null
  }
  const final = avg(rows.map((r) => r.final))
  const previous = avg(rows.map((r) => r.previousFinal))
  const known = <T,>(pick: (r: TeamWeekRow) => T | null) => rows.map(pick).filter((v): v is T => v !== null)
  return {
    final,
    change: final !== null && previous !== null ? Math.round((final - previous) * 10) / 10 : null,
    monthFinal: avg(rows.map((r) => r.monthFinal)),
    collected: rows.some((r) => r.collected !== null) ? sum(known((r) => r.collected)) : null,
    dueThisWeek: sum(known((r) => r.commitments).map((c) => c.dueThisWeek)),
    dueCount: known((r) => r.commitments).reduce((a, c) => a + c.dueCount, 0),
    missed: sum(known((r) => r.commitments).map((c) => c.missed)),
    missedCount: known((r) => r.commitments).reduce((a, c) => a + c.missedCount, 0),
    open: sum(known((r) => r.commitments).map((c) => c.open)),
    quotationsMade: known((r) => r.quotations).reduce((a, q) => a + q.made, 0),
    quotationsClosed: known((r) => r.quotations).reduce((a, q) => a + q.closed, 0),
    valueWon: sum(known((r) => r.quotations).map((q) => q.valueWon)),
    rfdRows: known((r) => r.rfd).reduce((a, q) => a + q.rows, 0),
    rfdPending: sum(known((r) => r.rfd).map((q) => q.pending)),
    billingIssues: known((r) => r.billingIssues).reduce((a, n) => a + n, 0),
  }
}

