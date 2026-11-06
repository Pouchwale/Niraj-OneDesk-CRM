/**
 * Score history (6 Nov 2026): every module's score for each coordinator, by
 * week (Monday to Sunday), month and year, so the team can be reviewed over
 * time. The server keeps each period once it has ended (two days' grace for
 * late entries) and locks it: later edits to old records do not change it.
 * The current week, month and year are worked out live until they end.
 *
 * Each module is scored the way its own screen scores it:
 * - Robi tasks: the average of the day scores (gap from 100%, 0% is all done).
 * - Weekly KPI, Regular and Dispute: the saved weekly scores (out of 100); a
 *   week belongs to the Monday it was measured from, a month or year is the
 *   average of its weeks.
 * - Quotations: score ÷ customers (the sheet's AVG SCORE), by enquiry date.
 * - Billing Issues: the stepped score from the number of issues as
 *   Responsible Person 1; a year is the average of its months.
 * - Service: the monthly Final score; a week shows the mails only (Total
 *   Customers is a monthly number) and a year is the average of its months.
 * - Self Leads: conversion, closed ÷ connected, by lead date.
 *
 * Pure and shared by the server and the browser; relative imports only, so
 * the server bundle can read it.
 */

import { billingIssueScore } from './billing-issues'
import { conversionsOf, dayFor } from './quotation-stats'
import { leadSummary } from './self-leads'
import { serviceScores } from './service-records'
import type { AttendanceEntry, BillingIssue, Quotation, RobiOffDay, SelfLead, ServiceCustomerTarget, ServiceRecord } from './types'

export type PeriodKind = 'week' | 'month' | 'year'
export type ScoreModule = 'robi' | 'kpi' | 'kpi_dispute' | 'quotations' | 'billing' | 'service' | 'self_leads'

export const SCORE_MODULES: { id: ScoreModule; label: string; short: string; hint: string }[] = [
  { id: 'robi', label: 'Robi tasks', short: 'Robi tasks', hint: 'Average of the daily scores: Robi’s tasks done, as the gap from 100% (0% is everything done).' },
  { id: 'kpi', label: 'Weekly KPI (Regular)', short: 'Weekly KPI', hint: 'The saved weekly KPI score as the gap from 100%; a month or year is the average of its weeks.' },
  { id: 'kpi_dispute', label: 'Weekly KPI (Dispute)', short: 'Dispute KPI', hint: 'The dispute accounts’ weekly KPI score as the gap from 100%; a month or year is the average of its weeks.' },
  { id: 'quotations', label: 'Quotations', short: 'Quotations', hint: 'Average score per customer (Closed + New 100, Closed + Existing 50), counted by enquiry date.' },
  { id: 'billing', label: 'Billing Issues', short: 'Billing', hint: 'From the number of issues as Responsible Person 1: 0 → 100, 1 → 50, 2 → 0, 3-5 → -25, 6-10 → -50, more → -100. A year is the average of its months.' },
  { id: 'service', label: 'Service', short: 'Service', hint: 'The monthly Final score (capped at 100). A week shows the mails only; a year is the average of its months.' },
  { id: 'self_leads', label: 'Self Leads', short: 'Self Leads', hint: 'Conversion: closed ÷ connected leads, by lead date.' },
]

export const SCORE_HISTORY_ROUTE = '/api/score-history'

/** Days after a period ends before it is locked, so entries made late for its last days still count. */
export const LOCK_GRACE_DAYS = 2

export interface ScoreEntry {
  coordinatorId: string
  /** Kept with the entry, so the history still names someone who has left. */
  name: string
  module: ScoreModule
  /** The score as the module writes it; null when there is nothing to score. */
  score: number | null
  /** The figures behind it, for the tooltip and the Excel sheet. */
  detail: Record<string, number | null>
}

export interface PeriodScores {
  /** "week:2026-10-26", "month:2026-10", "year:2026". */
  id: string
  kind: PeriodKind
  key: string
  start: string
  end: string
  /** When it was locked; null while it is still open and worked out live. */
  lockedAt: string | null
  /** 'auto', or the administrator who worked it out again. */
  lockedBy: string | null
  entries: ScoreEntry[]
}

export interface ScoreHistoryResponse {
  kind: PeriodKind
  today: string
  graceDays: number
  periods: PeriodScores[]
}

/* ===================== Periods ===================== */

const utc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => iso(utc(day) + n * 86_400_000)

/** The Monday of the week (Monday to Sunday) a day falls in. */
export function weekOf(day: string): string {
  const dow = new Date(utc(day)).getUTCDay()
  return addDays(day, dow === 0 ? -6 : 1 - dow)
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

/** A period is locked once it ended more than the grace days ago. */
export function lockable(kind: PeriodKind, key: string, today: string): boolean {
  return addDays(periodRange(kind, key).end, LOCK_GRACE_DAYS) < today
}

export const periodId = (kind: PeriodKind, key: string) => `${kind}:${key}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMonth = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

/** "26 Oct – 1 Nov 2026", "Oct 2026", "2026". */
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
  /** Monday of the week it measured (the week of its older saved day). */
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

/** Robi's week is Monday to Saturday (as Overview → Scores): a plan made on a Sunday is not scored. */
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
  return serviceScores(inputs.serviceRecords, inputs.serviceTargets, inputs.coordinators.map((c) => c.id), start, end)
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

function selfLeadEntries(inputs: ScoreInputs, start: string, end: string, nameOf: (id: string) => string): ScoreEntry[] {
  const per = new Map<string, SelfLead[]>()
  for (const l of inputs.selfLeads) {
    if (!l.coordinator_id || l.date < start || l.date > end) continue
    per.set(l.coordinator_id, [...(per.get(l.coordinator_id) ?? []), l])
  }
  return [...per.entries()].map(([id, list]) => {
    const s = leadSummary(list)
    return {
      coordinatorId: id,
      name: nameOf(id),
      module: 'self_leads' as const,
      score: s.conversion,
      detail: { leads: s.leads, connected: s.connected, closed: s.closed, lost: s.lost, valueWon: s.valueWon },
    }
  })
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
    ...selfLeadEntries(inputs, start, end, nameOf),
  ]
    // Coordinators' scores only: a quotation the team leader logged as herself is not a coordinator's score.
    .filter((e) => names.has(e.coordinatorId))
  entries.sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name))
  return { id: periodId(kind, key), kind, key, start, end, entries }
}
