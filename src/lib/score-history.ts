/**
 * Score history (6 Nov 2026): every module's score for each coordinator, by
 * week, month and year, so the team can be reviewed over time. A week is the
 * company's week, Saturday to Friday (since 7 Nov 2026; Monday to Sunday
 * before). The server keeps each period once it has ended (a few days' grace
 * for late entries) and locks it: later edits to old records do not change
 * it. The current week, month and year are worked out live until they end.
 *
 * Each module is scored the way its own screen scores it:
 * - Robi tasks: the average of the day scores (gap from 100%, 0% is all done).
 * - Weekly KPI, Regular and Dispute: the saved weekly scores (out of 100); a
 *   score belongs to the week holding the middle of its two saved days, a
 *   month or year is the average of its weeks.
 * - Quotations: score ÷ customers (the sheet's AVG SCORE), by enquiry date.
 * - Billing Issues: the stepped score from the number of issues as
 *   Responsible Person 1; a year is the average of its months.
 * - Service: the monthly Final score; a week shows the mails only (Total
 *   Customers is a monthly number) and a year is the average of its months.
 * - Self Leads: conversion, closed ÷ connected, by lead date.
 *
 * Scores are kept and worked out as each module scores them (out of 100);
 * since 7 Nov 2026 the screens write every score as its gap from 100 (minus
 * scoring, src/lib/minus-score.ts), which changes none of the figures here.
 *
 * Pure and shared by the server and the browser; relative imports only, so
 * the server bundle can read it.
 */

import { billingIssueScore } from './billing-issues'
import { conversionsOf, dayFor } from './quotation-stats'
import { serviceScores } from './service-records'
import type { AttendanceEntry, BillingIssue, Quotation, RobiOffDay, SelfLead, ServiceCustomerTarget, ServiceRecord } from './types'
import type { OtifCustomerCounts } from '../../shared/service-otif'

export type PeriodKind = 'week' | 'month' | 'year'
export type ScoreModule = 'robi' | 'kpi' | 'kpi_dispute' | 'quotations' | 'billing' | 'service' | 'self_leads'

export const SCORE_MODULES: { id: ScoreModule; label: string; short: string; hint: string }[] = [
  { id: 'robi', label: 'Robi tasks', short: 'Robi tasks', hint: 'Average of the daily scores: Robi’s tasks done, as the gap from 100% (0% is everything done).' },
  { id: 'kpi', label: 'Regular Overdue', short: 'Regular Overdue', hint: 'The saved weekly Regular Overdue score (Overdue Scoring) as the gap from 100%; a month or year is the average of its weeks.' },
  { id: 'kpi_dispute', label: 'Dispute Overdue', short: 'Dispute Overdue', hint: 'The weekly Dispute Overdue score (Overdue Scoring, customers in dispute) as the gap from 100%; a month or year is the average of its weeks.' },
  { id: 'quotations', label: 'Quotations', short: 'Quotations', hint: 'Average points per customer (Closed + New 100, Closed + Existing 50) as the gap from 100, counted by enquiry date: 85 points shows as -15.' },
  { id: 'billing', label: 'Billing Issues', short: 'Billing', hint: 'From the number of issues as Responsible Person 1, as the gap from 100: 0 issues → 0, 1 → -50, 2 → -100, 3-5 → -125, 6-10 → -150, more → -200. A year is the average of its months.' },
  { id: 'service', label: 'Service', short: 'Service', hint: 'The monthly Final score as the gap from 100 (0 at best). A week shows the mails only; a year is the average of its months.' },
  { id: 'self_leads', label: 'Self Leads', short: 'Self Leads', hint: 'New leads in a week against the target (3 or more 0%, 1–2 -70%, none -100%, as the administrator sets); a month is the average of its weeks.' },
]

export const SCORE_HISTORY_ROUTE = '/api/score-history'

/* ===================== The final score ===================== */

/**
 * Minus scoring (7 Nov 2026): the final score, like every score, is shown as
 * its gap from 100. It is still worked out of 100 (finalScoreOf), so the
 * screen writes it less 100: the average of the modules' gaps.
 */
export const FINAL_HINT =
  'Minus scoring: every score is its gap from 100, so 0 is full marks and a score of 70 shows as -30. The final score is the average of the module scores that period (Robi’s -25% counts as -25, Billing’s -125 as -125). A module with no score is left out, not counted as -100.'

/** The final score once the administrator has set a ratio (14 Nov 2026). */
export const FINAL_WEIGHTED_HINT =
  'Minus scoring: every score is its gap from 100, so 0 is full marks and a score of 70 shows as -30. The final score adds up each module’s score times its share in the ratio the administrator set. A module with no score that period counts as -100 for its share; a module at 0% does not count.'

/**
 * The administrator's ratio: each module's share of the final score, in
 * percent, adding up to 100. A module left out has no share.
 */
export type FinalWeights = Partial<Record<ScoreModule, number>>

export interface FinalWeightsSetting {
  weights: FinalWeights
  updatedAt: string
  updatedBy: string
}

/**
 * A ratio for a run of dates (14 Nov 2026): from `from` to `to` (both
 * included); `to` empty is "from this date on, until a newer ratio starts".
 */
export interface FinalRatio extends FinalWeightsSetting {
  id: string
  from: string
  to: string | null
  /** The score it is for (21 Nov 2026). Absent: a ratio over all modules, from before there were two scores. */
  group?: ScoreGroup
}

/* ===================== The two scores (21 Nov 2026) ===================== */

/**
 * The user's rule: each coordinator has two separate scores, Payments and
 * Operations, with no combined score. The administrator chooses which modules
 * count in which (Admin Panel), and each score has its own ratio adding up to
 * 100%. Until a score has a ratio of its own, it uses the all-module ratio's
 * shares for its modules, scaled up to 100%.
 */
export type ScoreGroup = 'payments' | 'operations'
export const SCORE_GROUPS: { id: ScoreGroup; label: string }[] = [
  { id: 'payments', label: 'Payments' },
  { id: 'operations', label: 'Operations' },
]
export type ScoreGroupMap = Record<ScoreModule, ScoreGroup>
export const DEFAULT_SCORE_GROUPS: ScoreGroupMap = {
  robi: 'payments',
  kpi: 'payments',
  kpi_dispute: 'payments',
  quotations: 'operations',
  billing: 'operations',
  service: 'operations',
  self_leads: 'operations',
}
export const scoreGroupLabel = (group: ScoreGroup) => SCORE_GROUPS.find((g) => g.id === group)?.label ?? group
const isScoreGroup = (v: unknown): v is ScoreGroup => SCORE_GROUPS.some((g) => g.id === v)
export const modulesInGroup = (groups: ScoreGroupMap, group: ScoreGroup) => SCORE_MODULES.filter((m) => groups[m.id] === group)

/** Which score each module counts in, as given, checked. Throws a message for the screen. */
export function checkScoreGroups(value: unknown): ScoreGroupMap {
  const v = (value ?? {}) as Record<string, unknown>
  const out = {} as ScoreGroupMap
  for (const m of SCORE_MODULES) {
    if (!isScoreGroup(v[m.id])) throw new Error(`Choose Payments or Operations for ${m.label}.`)
    out[m.id] = v[m.id] as ScoreGroup
  }
  for (const g of SCORE_GROUPS) if (!modulesInGroup(out, g.id).length) throw new Error(`${g.label} needs at least one module.`)
  return out
}

/** A ratio for one score may only give shares to that score's modules. Throws a message for the screen. */
export function checkGroupShares(weights: FinalWeights, group: ScoreGroup, groups: ScoreGroupMap): void {
  const outside = SCORE_MODULES.filter((m) => (weights[m.id] ?? 0) > 0 && groups[m.id] !== group)
  if (outside.length) throw new Error(`${outside.map((m) => m.label).join(', ')} ${outside.length === 1 ? 'is' : 'are'} not in the ${scoreGroupLabel(group)} score.`)
}

/** A ratio's shares for these modules only, scaled to add up to exactly 100; empty when it gives them none. */
export function sharesWithin(weights: FinalWeights, modules: readonly { id: ScoreModule }[]): FinalWeights {
  const kept = modules.filter((m) => (weights[m.id] ?? 0) > 0)
  const total = kept.reduce((a, m) => a + (weights[m.id] ?? 0), 0)
  if (total <= 0) return {}
  if (Math.abs(total - 100) < 0.001) return Object.fromEntries(kept.map((m) => [m.id, weights[m.id]!])) as FinalWeights
  const out: FinalWeights = {}
  for (const m of kept) out[m.id] = Math.round(((weights[m.id] ?? 0) / total) * 10000) / 100
  // Rounding can leave 99.99: the largest share takes the difference.
  const largest = kept.reduce((a, m) => ((out[m.id] ?? 0) > (out[a.id] ?? 0) ? m : a), kept[0])
  const left = 100 - kept.reduce((a, m) => a + (out[m.id] ?? 0), 0)
  out[largest.id] = Math.round(((out[largest.id] ?? 0) + left) * 100) / 100
  return out
}

/** The ratio a coordinator's score uses in a period: their own for it, their own overall, the team's for it, the team's overall; null: the plain average. */
export function groupWeightsFor(
  period: Pick<PeriodScores, 'finalWeights' | 'personWeights' | 'groupWeights' | 'personGroupWeights'> | null | undefined,
  coordinatorId: string,
  group: ScoreGroup,
  groups: ScoreGroupMap
): FinalWeights | null {
  const picked = period?.personGroupWeights?.[group]?.[coordinatorId] ?? period?.personWeights?.[coordinatorId] ?? period?.groupWeights?.[group] ?? period?.finalWeights ?? null
  return picked ? sharesWithin(picked, modulesInGroup(groups, group)) : null
}

/** One coordinator's Payments or Operations score for a period. */
export function groupFinalOf(period: PeriodScores | null | undefined, coordinatorId: string, group: ScoreGroup, fallback: ScoreGroupMap = DEFAULT_SCORE_GROUPS) {
  const groups = period?.scoreGroups ?? fallback
  const modules = new Set(modulesInGroup(groups, group).map((m) => m.id))
  const entries = (period?.entries ?? []).filter((e) => e.coordinatorId === coordinatorId && modules.has(e.module))
  return finalScoreOf(entries, groupWeightsFor(period, coordinatorId, group, groups))
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = (v: unknown): v is string => typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))

/** A dated ratio as given, checked. Throws a message for the screen. */
export function checkFinalRatio(value: unknown): { from: string; to: string | null; weights: FinalWeights; group?: ScoreGroup } {
  const v = (value ?? {}) as { from?: unknown; to?: unknown; weights?: unknown; group?: unknown }
  if (v.group !== undefined && v.group !== null && !isScoreGroup(v.group)) throw new Error('Choose Payments or Operations.')
  if (!isDay(v.from)) throw new Error('Give the date the ratio starts from.')
  const to = v.to === null || v.to === undefined || v.to === '' ? null : v.to
  if (to !== null && !isDay(to)) throw new Error('The To date is not a date.')
  if (to !== null && to < v.from) throw new Error('The To date is before the From date.')
  return { from: v.from, to, weights: checkFinalWeights(v.weights), ...(isScoreGroup(v.group) ? { group: v.group } : {}) }
}

/**
 * A ratio of the administrator's own for some coordinators (20 Nov 2026): the
 * people on it are scored by these shares instead of the team ratio, from now
 * until it is removed (no dates). A person is on one such ratio at most.
 * Open periods use it as it stands; a period locks with it.
 */
export interface PersonRatio {
  id: string
  coordinatorIds: string[]
  weights: FinalWeights
  /** The score it is for (21 Nov 2026): a person may have one for each. Absent: a ratio over all modules. */
  group?: ScoreGroup
  updatedAt?: string
  updatedBy?: string
}

/** A per-person ratio as given, checked. Throws a message for the screen. */
export function checkPersonRatio(value: unknown): { coordinatorIds: string[]; weights: FinalWeights; group?: ScoreGroup } {
  const v = (value ?? {}) as { coordinatorIds?: unknown; weights?: unknown; group?: unknown }
  if (v.group !== undefined && v.group !== null && !isScoreGroup(v.group)) throw new Error('Choose Payments or Operations.')
  const ids = Array.isArray(v.coordinatorIds) ? [...new Set(v.coordinatorIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))] : []
  if (!ids.length) throw new Error('Choose at least one coordinator.')
  return { coordinatorIds: ids, weights: checkFinalWeights(v.weights), ...(isScoreGroup(v.group) ? { group: v.group } : {}) }
}

/** Each coordinator's own ratio, by id. */
export function personWeightsOf(ratios: readonly (Pick<PersonRatio, 'coordinatorIds' | 'weights'> & { group?: ScoreGroup })[]): Record<string, FinalWeights> {
  const out: Record<string, FinalWeights> = {}
  for (const r of ratios) if (!r.group) for (const id of r.coordinatorIds) out[id] ??= r.weights
  return out
}

/** Each coordinator's own ratio for each score. */
export function personGroupWeightsOf(ratios: readonly Pick<PersonRatio, 'coordinatorIds' | 'weights' | 'group'>[]): Partial<Record<ScoreGroup, Record<string, FinalWeights>>> {
  const out: Partial<Record<ScoreGroup, Record<string, FinalWeights>>> = {}
  for (const r of ratios) if (r.group) for (const id of r.coordinatorIds) (out[r.group] ??= {})[id] ??= r.weights
  return out
}

/** The ratio a coordinator's final score uses in a period: their own, else the team's (null: the plain average). */
export function weightsFor(period: Pick<PeriodScores, 'finalWeights' | 'personWeights'> | null | undefined, coordinatorId: string): FinalWeights | null {
  return period?.personWeights?.[coordinatorId] ?? period?.finalWeights ?? null
}

/** The last day a ratio is in force: its To date, or (open-ended) the day before the next ratio starts; null = no end. */
export function ratioEnd(ratio: Pick<FinalRatio, 'from' | 'to'>, all: readonly Pick<FinalRatio, 'from' | 'to'>[]): string | null {
  if (ratio.to) return ratio.to
  const next = all.filter((r) => r.from > ratio.from).sort((a, b) => a.from.localeCompare(b.from))[0]
  return next ? addDays(next.from, -1) : null
}

/**
 * The ratio in force on a day: the one whose dates cover it (the latest
 * start if two do); with none, the nearest earlier one (the last to end
 * before it); before every ratio, none (the plain average).
 */
export function ratioOn<R extends Pick<FinalRatio, 'from' | 'to'>>(ratios: readonly R[], day: string): R | null {
  const covering = ratios.filter((r) => r.from <= day && (ratioEnd(r, ratios) ?? '9999-12-31') >= day)
  if (covering.length) return covering.sort((a, b) => b.from.localeCompare(a.from))[0]
  const earlier = ratios.filter((r) => (ratioEnd(r, ratios) ?? '9999-12-31') < day)
  if (!earlier.length) return null
  return earlier.sort((a, b) => ratioEnd(b, ratios)!.localeCompare(ratioEnd(a, ratios)!))[0]
}

/** The ratio as given, checked: known modules, 0-100 each, adding up to 100. Throws a message for the screen. */
export function checkFinalWeights(value: unknown): FinalWeights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Give a percentage for each module.')
  const out: FinalWeights = {}
  let total = 0
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const module = SCORE_MODULES.find((m) => m.id === key)
    if (!module) throw new Error(`There is no module called "${key}".`)
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${module.label}: give a percentage from 0 to 100.`)
    const rounded = Math.round(n * 100) / 100
    if (rounded > 0) out[module.id] = rounded
    total += rounded
  }
  if (Math.abs(total - 100) > 0.001) throw new Error(`The percentages add up to ${Math.round(total * 100) / 100}%; they must add up to 100%.`)
  return out
}

/** A module's score on the final score's 0-100 scale; null when it has none. */
export function finalPart(e: Pick<ScoreEntry, 'module' | 'score'>): number | null {
  if (e.score === null || e.score === undefined) return null
  return e.module === 'robi' ? 100 + e.score : e.score
}

/**
 * One coordinator's final score for a period, from their module entries.
 *
 * Without a ratio it is the plain average of the modules that have a score.
 * With the administrator's ratio it is each module's score times its share,
 * a module with no score counting as 0 out of 100 (-100) for its share; a
 * module with no share does not count. Nobody with no score at all has a
 * final score.
 */
export function finalScoreOf(
  entries: readonly Pick<ScoreEntry, 'module' | 'score' | 'na'>[],
  weights?: FinalWeights | null
): { score: number | null; parts: { module: ScoreModule; value: number }[]; weights?: FinalWeights; na?: ScoreModule[] } {
  // Switched off for this coordinator: N/A, not counted at all (the other modules' shares fill 100%).
  const na = [...new Set(entries.filter((e) => e.na).map((e) => e.module))]
  const parts = entries
    .filter((e) => !e.na)
    .map((e) => ({ module: e.module, value: finalPart(e) }))
    .filter((p): p is { module: ScoreModule; value: number } => p.value !== null)
  if (!parts.length) return { score: null, parts, ...(na.length ? { na } : {}) }
  if (weights) {
    let sum = 0
    let total = 0
    for (const m of SCORE_MODULES) {
      const share = weights[m.id] ?? 0
      if (share <= 0 || na.includes(m.id)) continue
      total += share
      sum += (share * (parts.find((p) => p.module === m.id)?.value ?? 0)) / 100
    }
    if (total <= 0) return { score: null, parts, weights, na }
    return { score: Math.round(((sum * 100) / total) * 10) / 10, parts, weights, ...(na.length ? { na } : {}) }
  }
  return { score: Math.round((parts.reduce((a, p) => a + p.value, 0) / parts.length) * 10) / 10, parts }
}

/**
 * The periods as a viewer sees them with the module switches applied: every
 * score of a module switched off for that coordinator is marked N/A (an entry
 * is added where the module had none), so it shows N/A and is left out of the
 * final score, in every period, locked ones included.
 */
export function markSwitchedOff(periods: readonly PeriodScores[], offOf: (coordinatorId: string) => ReadonlySet<string>, people: readonly string[]): PeriodScores[] {
  const off = new Map(people.map((id) => [id, offOf(id)]))
  if (![...off.values()].some((s) => s.size)) return periods as PeriodScores[]
  return periods.map((p) => {
    const entries: ScoreEntry[] = p.entries.map((e) => (off.get(e.coordinatorId)?.has(e.module) ? { ...e, score: null, na: true } : e))
    for (const [id, set] of off) {
      for (const module of set) {
        if (!entries.some((e) => e.coordinatorId === id && e.module === module)) {
          entries.push({ coordinatorId: id, name: id, module: module as ScoreModule, score: null, detail: {}, na: true })
        }
      }
    }
    return { ...p, entries }
  })
}

/** A Self Leads target as the administrator set it, by dates like the final score ratio (16 Nov 2026). */
export interface LeadTarget {
  id: string
  from: string
  to: string | null
  /** New leads in a week for full marks (100%). */
  full: number
  /** The score (0-100) for at least one lead but fewer than `full`. */
  partial: number
  updatedAt: string
  updatedBy: string
}

/** Before the administrator sets any: 3 leads for 100%, 1-2 for 30%. */
export const DEFAULT_LEAD_TARGET = { full: 3, partial: 30 } as const

/** The target in force on a day (the ratio's rule for dates); none set: the default. */
export function leadTargetOn(targets: readonly LeadTarget[], day: string): Pick<LeadTarget, 'full' | 'partial'> {
  return ratioOn(targets, day) ?? DEFAULT_LEAD_TARGET
}

/** A target as given, checked. Throws a message for the screen. */
export function checkLeadTarget(value: unknown): { from: string; to: string | null; full: number; partial: number } {
  const v = (value ?? {}) as { from?: unknown; to?: unknown; full?: unknown; partial?: unknown }
  if (!isDay(v.from)) throw new Error('Give the date the target starts from.')
  const to = v.to === null || v.to === undefined || v.to === '' ? null : v.to
  if (to !== null && !isDay(to)) throw new Error('The To date is not a date.')
  if (to !== null && to < v.from) throw new Error('The To date is before the From date.')
  const full = Number(v.full)
  const partial = Number(v.partial)
  if (!Number.isInteger(full) || full < 1 || full > 100) throw new Error('Leads for full marks must be a whole number from 1 to 100.')
  if (!Number.isFinite(partial) || partial < 0 || partial > 100) throw new Error('The score for fewer leads must be 0 to 100%.')
  return { from: v.from, to, full, partial }
}

/** Days after a month or year ends before it is locked, so entries made late for its last days still count. */
export const LOCK_GRACE_DAYS = 2

/**
 * A week (Saturday to Friday) locks on the Tuesday after it ends: Saturday and
 * Monday stay open for late entries (Sunday is off), and Monday's automatic
 * Weekly KPI score lands in its week before the week is locked.
 */
export const WEEK_LOCK_GRACE_DAYS = 3

/** The days of grace before a period of this kind is locked. */
export const lockGraceDays = (kind: PeriodKind) => (kind === 'week' ? WEEK_LOCK_GRACE_DAYS : LOCK_GRACE_DAYS)

export interface ScoreEntry {
  coordinatorId: string
  /** Kept with the entry, so the history still names someone who has left. */
  name: string
  module: ScoreModule
  /** The score as the module writes it; null when there is nothing to score. */
  score: number | null
  /** The figures behind it, for the tooltip and the Excel sheet. */
  detail: Record<string, number | null>
  /**
   * The module is switched off for this coordinator (Admin Panel, 16 Nov 2026):
   * shown N/A and left out of their final score. Set when the scores are shown
   * (markSwitchedOff), never stored, so it follows the switches in every period.
   */
  na?: boolean
}

export interface PeriodScores {
  /** "week:2026-10-31" (its Saturday), "month:2026-10", "year:2026". */
  id: string
  kind: PeriodKind
  key: string
  start: string
  end: string
  /** When it was locked; null while it is still open and worked out live. */
  lockedAt: string | null
  /** 'auto', or the administrator who worked it out again. */
  lockedBy: string | null
  /**
   * The ratio its final score uses: the one in force on its first day, as it
   * stood when the period locked (an open period: as it stands now). Absent or
   * null: the plain average (every period locked before a ratio was set).
   */
  finalWeights?: FinalWeights | null
  /** Coordinators scored by a ratio of their own (PersonRatio), by id: as it stood when the period locked (open: as it stands now). */
  personWeights?: Record<string, FinalWeights>
  /** Which score each module counts in, as it stood when the period locked (open: now). Absent: today's. */
  scoreGroups?: ScoreGroupMap
  /** Each score's own ratio in force on its first day. */
  groupWeights?: Partial<Record<ScoreGroup, FinalWeights>>
  /** Coordinators' own ratios for each score. */
  personGroupWeights?: Partial<Record<ScoreGroup, Record<string, FinalWeights>>>
  entries: ScoreEntry[]
}

export interface ScoreHistoryResponse {
  kind: PeriodKind
  today: string
  graceDays: number
  periods: PeriodScores[]
  /** The administrator's ratios by dates, oldest first; empty while none is set. */
  finalRatios: FinalRatio[]
  /** The administrator's ratios for particular coordinators (20 Nov 2026). */
  personRatios?: PersonRatio[]
  /** Which score (Payments or Operations) each module counts in now. */
  scoreGroups?: ScoreGroupMap
  /** The administrator's Self Leads targets by dates, oldest first; empty: the default (3 leads, 30%). */
  leadTargets?: LeadTarget[]
}

/* ===================== Periods ===================== */

const utc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => iso(utc(day) + n * 86_400_000)

/**
 * The Saturday that starts the week a day falls in. The company's week runs
 * Saturday to Friday (the user's rule, 7 Nov 2026; Monday to Sunday before).
 */
export function weekOf(day: string): string {
  const dow = new Date(utc(day)).getUTCDay() // 0 Sunday … 6 Saturday
  return addDays(day, -((dow + 1) % 7)) // Saturday 0 days back, Sunday 1, … Friday 6
}

/**
 * The week a Weekly KPI score measured: the one holding the middle of its two
 * saved days (local time). A Saturday-to-Saturday score (the rule since 6 Nov
 * 2026) lands in the week starting on its first Saturday, the week whose
 * collections it counts; an older Monday-to-Monday score in the week holding
 * its Thursday.
 */
export function kpiWeekOf(oldSavedAt: string, newSavedAt: string): string {
  const middle = new Date((new Date(oldSavedAt).getTime() + new Date(newSavedAt).getTime()) / 2)
  const pad = (n: number) => String(n).padStart(2, '0')
  return weekOf(`${middle.getFullYear()}-${pad(middle.getMonth() + 1)}-${pad(middle.getDate())}`)
}

export function periodKey(kind: PeriodKind, day: string): string {
  if (kind === 'week') return weekOf(day)
  if (kind === 'month') return day.slice(0, 7)
  return day.slice(0, 4)
}

export function periodRange(kind: PeriodKind, key: string): { start: string; end: string } {
  if (kind === 'week') return { start: key, end: addDays(key, 6) }
  if (kind === 'month') {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    return { start: `${key}-01`, end: iso(Date.UTC(y, m, 0)) }
  }
  return { start: `${key}-01-01`, end: `${key}-12-31` }
}

export function nextKey(kind: PeriodKind, key: string): string {
  if (kind === 'week') return addDays(key, 7)
  if (kind === 'month') {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return String(Number(key) + 1)
}

export function previousKey(kind: PeriodKind, key: string): string {
  if (kind === 'week') return addDays(key, -7)
  if (kind === 'month') {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }
  return String(Number(key) - 1)
}

/** Every period from the one holding `from` to the one holding `to`, oldest first. */
export function keysBetween(kind: PeriodKind, from: string, to: string): string[] {
  const out: string[] = []
  const last = periodKey(kind, to)
  for (let k = periodKey(kind, from); k <= last && out.length < 1000; k = nextKey(kind, k)) out.push(k)
  return out
}

/** The last `count` periods up to the one holding `today`, oldest first. */
export function recentKeys(kind: PeriodKind, today: string, count: number): string[] {
  const out = [periodKey(kind, today)]
  while (out.length < count) out.unshift(previousKey(kind, out[0]))
  return out
}

/** A period is locked once it ended more than its grace days ago (a week: on the Tuesday after it). */
export function lockable(kind: PeriodKind, key: string, today: string): boolean {
  return addDays(periodRange(kind, key).end, lockGraceDays(kind)) < today
}

export const periodId = (kind: PeriodKind, key: string) => `${kind}:${key}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMonth = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

/** "31 Oct – 6 Nov 2026", "Oct 2026", "2026". */
export function periodLabel(kind: PeriodKind, key: string, short = false): string {
  if (kind === 'year') return key
  if (kind === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
  const { end } = periodRange('week', key)
  return short ? dayMonth(key) : `${dayMonth(key)} – ${dayMonth(end)} ${end.slice(0, 4)}`
}

/* ===================== Inputs ===================== */

/** Robi's day score for one coordinator on one day (see assistant/scores.ts). */
export interface RobiDay {
  score: number
  done: number
  given: number
  extra: number
  credited: number
}

/** A saved Weekly KPI score, per coordinator. */
export interface KpiWeek {
  book: 'regular' | 'dispute'
  /** The Saturday starting the week it measured (the week holding the middle of its two saved days, kpiWeekOf). */
  weekStart: string
  generatedAt: string
  rows: { coordinatorId: string | null; kpiScore: number }[]
}

export interface ScoreInputs {
  /** Today's coordinators: id and name. */
  coordinators: readonly { id: string; name: string }[]
  /** Robi day scores by `${coordinatorId}|${date}`. */
  robiDays: ReadonlyMap<string, RobiDay>
  kpiWeeks: readonly KpiWeek[]
  quotations: readonly Quotation[]
  billingIssues: readonly BillingIssue[]
  serviceRecords: readonly ServiceRecord[]
  serviceTargets: readonly ServiceCustomerTarget[]
  /** Total Customers from the OTIF file, November 2026 on (shared/service-otif.ts); null when it could not be read. */
  serviceOtif?: OtifCustomerCounts | null
  /** The same by week (its Saturday), for a week's Service score (16 Nov 2026); left out: weeks show the mails only. */
  serviceOtifWeeks?: OtifCustomerCounts | null
  /** The administrator's Self Leads targets by dates (16 Nov 2026); none: 3 leads for full marks, 30% for fewer. */
  selfLeadTargets?: readonly LeadTarget[]
  selfLeads: readonly SelfLead[]
}

/** Who was away on a day: a Robi day off counts as leave for everyone (as demoCompanyStore.getAttendance). */
export function attendanceLookup(attendance: readonly AttendanceEntry[], robiOffDays: readonly RobiOffDay[]) {
  const off = new Set(robiOffDays.map((d) => d.date))
  const status = new Map(attendance.map((a) => [`${a.userId}|${a.date}`, a.status]))
  return (userId: string, date: string): AttendanceEntry['status'] | null => (off.has(date) ? 'leave' : status.get(`${userId}|${date}`) ?? null)
}

/** The first day any module has data for; null with no data at all. */
export function earliestDay(inputs: ScoreInputs): string | null {
  const days: string[] = []
  for (const key of inputs.robiDays.keys()) days.push(key.slice(key.indexOf('|') + 1))
  for (const w of inputs.kpiWeeks) days.push(w.weekStart)
  for (const q of inputs.quotations) {
    const d = dayFor(q, 'enquiry')
    if (d) days.push(d)
  }
  for (const b of inputs.billingIssues) days.push(b.date)
  for (const s of inputs.serviceRecords) days.push(s.date)
  for (const l of inputs.selfLeads) days.push(l.date)
  const valid = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  return valid[0] ?? null
}

/* ===================== Scoring a period ===================== */

const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places
const average = (values: number[]) => (values.length ? values.reduce((a, v) => a + v, 0) / values.length : null)
/** Halves away from zero (-12.5 → -13), as Robi's weekly average rounds. */
const roundAway = (v: number) => Math.sign(v) * Math.round(Math.abs(v)) || 0

/** Robi's week is Saturday to Friday with Sunday off (as Overview → Scores): a plan made on a Sunday is not scored. */
const isSunday = (day: string) => new Date(utc(day)).getUTCDay() === 0

function robiEntries(inputs: ScoreInputs, start: string, end: string, nameOf: (id: string) => string): ScoreEntry[] {
  const per = new Map<string, RobiDay[]>()
  for (const [key, day] of inputs.robiDays) {
    const cut = key.indexOf('|')
    const date = key.slice(cut + 1)
    if (date < start || date > end || isSunday(date)) continue
    const id = key.slice(0, cut)
    per.set(id, [...(per.get(id) ?? []), day])
  }
  return [...per.entries()].map(([id, days]) => ({
    coordinatorId: id,
    name: nameOf(id),
    module: 'robi' as const,
    score: roundAway(days.reduce((a, d) => a + d.score, 0) / days.length),
    detail: {
      days: days.length,
      done: days.reduce((a, d) => a + d.done, 0),
      given: days.reduce((a, d) => a + d.given, 0),
      extra: days.reduce((a, d) => a + d.extra, 0),
    },
  }))
}

function kpiEntries(inputs: ScoreInputs, book: 'regular' | 'dispute', start: string, end: string, nameOf: (id: string) => string): ScoreEntry[] {
  // The latest score generated for each week.
  const latest = new Map<string, KpiWeek>()
  for (const w of inputs.kpiWeeks) {
    if (w.book !== book || w.weekStart < start || w.weekStart > end) continue
    const held = latest.get(w.weekStart)
    if (!held || w.generatedAt > held.generatedAt) latest.set(w.weekStart, w)
  }
  const per = new Map<string, number[]>()
  for (const w of latest.values()) {
    for (const r of w.rows) {
      if (!r.coordinatorId || !Number.isFinite(r.kpiScore)) continue
      per.set(r.coordinatorId, [...(per.get(r.coordinatorId) ?? []), r.kpiScore])
    }
  }
  return [...per.entries()].map(([id, scores]) => ({
    coordinatorId: id,
    name: nameOf(id),
    module: book === 'regular' ? ('kpi' as const) : ('kpi_dispute' as const),
    score: round(average(scores)!, 2),
    detail: { weeks: scores.length },
  }))
}

function quotationEntries(inputs: ScoreInputs, start: string, end: string, nameOf: (id: string) => string): ScoreEntry[] {
  const per = new Map<string, Quotation[]>()
  for (const q of inputs.quotations) {
    const day = dayFor(q, 'enquiry')
    if (!q.coordinator_id || !day || day < start || day > end) continue
    per.set(q.coordinator_id, [...(per.get(q.coordinator_id) ?? []), q])
  }
  return [...per.entries()].map(([id, list]) => {
    const c = conversionsOf(list)
    return {
      coordinatorId: id,
      name: nameOf(id),
      module: 'quotations' as const,
      score: c.averageScore,
      detail: {
        quotations: c.quotations,
        conversions: c.conversions,
        newConversions: c.newConversions,
        existingConversions: c.existingConversions,
        totalScore: c.score,
        customers: c.customers,
        amount: c.amount,
      },
    }
  })
}

/** Billing scores for a week or month: everyone gets a line from the day the log starts (no issues is 100). */
function billingEntries(inputs: ScoreInputs, start: string, end: string, firstIssue: string | null, nameOf: (id: string) => string): ScoreEntry[] {
  if (!firstIssue || end < firstIssue) return []
  const counts = new Map(inputs.coordinators.map((c) => [c.id, 0]))
  for (const issue of inputs.billingIssues) {
    if (!issue.responsible_1 || issue.date < start || issue.date > end || !counts.has(issue.responsible_1)) continue
    counts.set(issue.responsible_1, (counts.get(issue.responsible_1) ?? 0) + 1)
  }
  return [...counts.entries()].map(([id, issues]) => ({
    coordinatorId: id,
    name: nameOf(id),
    module: 'billing' as const,
    score: billingIssueScore(issues),
    detail: { issues },
  }))
}

function serviceMonthEntries(inputs: ScoreInputs, month: string, nameOf: (id: string) => string): ScoreEntry[] {
  const { start, end } = periodRange('month', month)
  return serviceScores(inputs.serviceRecords, inputs.serviceTargets, inputs.coordinators.map((c) => c.id), start, end, inputs.serviceOtif)
    .filter((s) => s.mails > 0 || s.totalCustomers !== null)
    .map((s) => ({
      coordinatorId: s.coordinatorId,
      name: nameOf(s.coordinatorId),
      module: 'service' as const,
      score: s.finalScore === null ? null : round(s.finalScore),
      detail: { mails: s.mails, points: s.sumOfScore, customers: s.totalCustomers },
    }))
}

function serviceWeekEntries(inputs: ScoreInputs, start: string, end: string, nameOf: (id: string) => string): ScoreEntry[] {
  // Since 16 Nov 2026 a week has a score of its own: (points ÷ the week's OTIF customers) × 10, at most 100.
  if (inputs.serviceOtifWeeks !== undefined) {
    const weeks = inputs.serviceOtifWeeks
    return serviceScoresBy(inputs, start, end, (id) => (weeks ? (weeks[start]?.[id] ?? 0) : null)).map((s) => ({
      coordinatorId: s.coordinatorId,
      name: nameOf(s.coordinatorId),
      module: 'service' as const,
      score: s.finalScore === null ? null : round(s.finalScore, 2),
      detail: { mails: s.mails, points: s.sumOfScore, customers: s.totalCustomers },
    }))
  }
  const per = new Map<string, { mails: number; points: number }>()
  for (const r of inputs.serviceRecords) {
    if (!r.coordinator_id || r.date < start || r.date > end) continue
    const t = per.get(r.coordinator_id) ?? { mails: 0, points: 0 }
    t.mails++
    t.points += r.information_date ? 10 : 0
    per.set(r.coordinator_id, t)
  }
  return [...per.entries()].map(([id, t]) => ({ coordinatorId: id, name: nameOf(id), module: 'service' as const, score: null, detail: { mails: t.mails, points: t.points } }))
}

/**
 * Each coordinator's Service figures for a stretch of days against a customer
 * count (null: none known): mails, points, and the score as the month's rule
 * works it out.
 */
function serviceScoresBy(inputs: ScoreInputs, start: string, end: string, customersOf: (id: string) => number | null) {
  return inputs.coordinators.map((c) => {
    let mails = 0
    let points = 0
    for (const r of inputs.serviceRecords) {
      if (r.coordinator_id !== c.id || r.date < start || r.date > end) continue
      mails++
      points += r.information_date ? 10 : 0
    }
    const customers = customersOf(c.id)
    const usable = customers !== null && customers > 0
    return { coordinatorId: c.id, mails, sumOfScore: points, totalCustomers: customers, finalScore: usable ? Math.min(100, (points / customers) * 10) : null }
  })
}

/**
 * Self Leads (16 Nov 2026, the user's rule): each Saturday-to-Friday week is
 * scored on the coordinator's new leads (by lead date) against the target in
 * force on its Saturday: the target or more 100% (0), at least one the
 * partial score (30%, -70), none 0% (-100). A month is the average of the
 * weeks starting in it (those begun by today); a year, of its months. Nothing
 * before the first lead was ever logged.
 */
export function selfLeadWeekScore(leads: number, target: Pick<LeadTarget, 'full' | 'partial'>): number {
  return leads >= target.full ? 100 : leads >= 1 ? target.partial : 0
}

function selfLeadWeeks(inputs: ScoreInputs, weekKeys: readonly string[]): Map<string, { scores: number[]; leads: number; target: Pick<LeadTarget, 'full' | 'partial'> }> {
  const first = inputs.selfLeads.reduce<string | null>((min, l) => (!min || l.date < min ? l.date : min), null)
  const out = new Map<string, { scores: number[]; leads: number; target: Pick<LeadTarget, 'full' | 'partial'> }>()
  if (!first) return out
  for (const week of weekKeys) {
    const end = addDays(week, 6)
    if (end < first) continue
    const target = leadTargetOn(inputs.selfLeadTargets ?? [], week)
    for (const c of inputs.coordinators) {
      const leads = inputs.selfLeads.filter((l) => l.coordinator_id === c.id && l.date >= week && l.date <= end).length
      const t = out.get(c.id) ?? { scores: [], leads: 0, target }
      t.scores.push(selfLeadWeekScore(leads, target))
      t.leads += leads
      out.set(c.id, t)
    }
  }
  return out
}

function selfLeadEntries(inputs: ScoreInputs, kind: PeriodKind, key: string, today: string, nameOf: (id: string) => string): ScoreEntry[] {
  if (kind === 'year') {
    return yearOfMonths((m) => selfLeadEntries(inputs, 'month', m, today, nameOf), key, today, nameOf)
  }
  const { start, end } = periodRange(kind, key)
  const weeks =
    kind === 'week'
      ? [weekOf(start)]
      : keysBetween('week', start, end).filter((w) => w >= start && w <= end && w <= today)
  return [...selfLeadWeeks(inputs, weeks).entries()].map(([id, t]) => ({
    coordinatorId: id,
    name: nameOf(id),
    module: 'self_leads' as const,
    score: round(average(t.scores)!, 2),
    detail: (kind === 'week' ? { leads: t.leads, target: t.target.full, partial: t.target.partial } : { leads: t.leads, weeks: t.scores.length }) as Record<string, number | null>,
  }))
}

/** A year's monthly scores averaged per coordinator (billing and service), months up to `today` only. */
function yearOfMonths(entriesFor: (month: string) => ScoreEntry[], year: string, today: string, nameOf: (id: string) => string): ScoreEntry[] {
  const last = today.slice(0, 4) === year ? today.slice(0, 7) : `${year}-12`
  const per = new Map<string, ScoreEntry[]>()
  for (const month of keysBetween('month', `${year}-01-01`, `${last}-01`)) {
    for (const e of entriesFor(month)) per.set(e.coordinatorId, [...(per.get(e.coordinatorId) ?? []), e])
  }
  return [...per.entries()].map(([id, list]) => {
    const scored = list.map((e) => e.score).filter((s): s is number => s !== null)
    const detail: Record<string, number | null> = { months: scored.length }
    for (const key of ['issues', 'mails', 'points']) {
      if (list.some((e) => e.detail[key] !== undefined)) detail[key] = list.reduce((a, e) => a + (e.detail[key] ?? 0), 0)
    }
    return { coordinatorId: id, name: nameOf(id), module: list[0].module, score: scored.length ? round(average(scored)!) : null, detail }
  })
}

/** Every module's scores for one period, worked out from the records as they are now. */
export function computePeriod(inputs: ScoreInputs, kind: PeriodKind, key: string, today: string): Omit<PeriodScores, 'lockedAt' | 'lockedBy'> {
  const { start, end } = periodRange(kind, key)
  const names = new Map(inputs.coordinators.map((c) => [c.id, c.name]))
  const nameOf = (id: string) => names.get(id) ?? id
  const firstIssue = inputs.billingIssues.reduce<string | null>((min, b) => (!min || b.date < min ? b.date : min), null)
  const firstService = inputs.serviceRecords.reduce<string | null>((min, r) => (!min || r.date < min ? r.date : min), null)

  const entries: ScoreEntry[] = [
    ...robiEntries(inputs, start, end, nameOf),
    ...kpiEntries(inputs, 'regular', start, end, nameOf),
    ...kpiEntries(inputs, 'dispute', start, end, nameOf),
    ...quotationEntries(inputs, start, end, nameOf),
    ...(kind === 'year'
      ? yearOfMonths((m) => billingEntries(inputs, periodRange('month', m).start, periodRange('month', m).end, firstIssue, nameOf), key, today, nameOf)
      : billingEntries(inputs, start, end, firstIssue, nameOf)),
    ...(kind === 'week'
      ? serviceWeekEntries(inputs, start, end, nameOf)
      : kind === 'month'
        ? firstService && end >= firstService
          ? serviceMonthEntries(inputs, key, nameOf)
          : []
        : yearOfMonths((m) => (firstService && periodRange('month', m).end >= firstService ? serviceMonthEntries(inputs, m, nameOf) : []), key, today, nameOf)),
    ...selfLeadEntries(inputs, kind, key, today, nameOf),
  ]
    // Coordinators' scores only: a quotation the team leader logged as herself is not a coordinator's score.
    .filter((e) => names.has(e.coordinatorId))
  entries.sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name))
  return { id: periodId(kind, key), kind, key, start, end, entries }
}
