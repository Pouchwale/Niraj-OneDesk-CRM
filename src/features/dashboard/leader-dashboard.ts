/**
 * The team leader's and administrator's Dashboard (21 Nov 2026, the user's
 * brief): overall figures only, nobody's individual score.
 *
 *   Scores: each team's Payments and Operations averages, the two averaged into
 *   the team's score, and the two teams averaged into the team leader's score.
 *   Money received: from regular customers whose balance fell in the week,
 *   taken from their oldest dues first, in 31-120 days and 121+ days.
 *   Quotations: given, converted and converted value, each split New / Repeat.
 *   Ready for Dispatch: the value waiting 30 days or more, by product.
 *
 * Pure: the page gathers the records.
 */

import { countsTowardsScore } from '@/features/snapshots/transform'
import { quotationDay } from '@/lib/quotation-stats'
import { groupFinalOf, type PeriodScores, type ScoreGroup, type ScoreGroupMap } from '@/lib/score-history'
import type { OverduePayment, Quotation, RfdRow, TeamModule } from '@/lib/types'

export const LEADER_TEAMS: readonly TeamModule[] = ['Pouchwale', 'GP3']
export const RFD_WAITING_DAYS = 30

/** One decimal at every step, so the figures on screen add up by hand. */
const tenth = (v: number) => Math.round(v * 10) / 10
const paise = (v: number) => Math.round(v * 100) / 100
const amount = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const codeOf = (v: unknown) => String(v ?? '').trim().toUpperCase()

function averageOf(values: readonly (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null)
  return known.length ? tenth(known.reduce((a, v) => a + v, 0) / known.length) : null
}

export interface TeamScore {
  team: TeamModule
  /** Average of the team's coordinators who have that score (0-100; N/A left out). */
  payments: number | null
  operations: number | null
  /** Average of the two. */
  final: number | null
}

export function leaderScores(
  period: PeriodScores | null | undefined,
  people: readonly { id: string; module?: TeamModule | null }[],
  scoreGroups?: ScoreGroupMap
): { teams: TeamScore[]; leader: number | null } {
  const teams = LEADER_TEAMS.map((team) => {
    const ids = people.filter((p) => p.module === team).map((p) => p.id)
    const of = (group: ScoreGroup) => averageOf(ids.map((id) => (period ? groupFinalOf(period, id, group, scoreGroups).score : null)))
    const payments = of('payments')
    const operations = of('operations')
    return { team, payments, operations, final: averageOf([payments, operations]) }
  })
  return { teams, leader: averageOf(teams.map((t) => t.final)) }
}

export interface MoneyReceived {
  days31to120: number
  days121Plus: number
  /** The rest of what came in: money under 31 days old. Not shown, kept so the parts add up. */
  upTo30: number
  customers: number
}

/**
 * What regular customers actually paid between two books. A customer counts
 * only when their balance fell; the fall is taken from their oldest dues first.
 * Money that merely got older and moved bucket is not a payment, and customers
 * set aside (no follow-up, dispute, export, bankrupt) or already settled at the
 * start are left out.
 */
export function moneyReceived(start: readonly OverduePayment[], end: readonly OverduePayment[]): MoneyReceived {
  const after = new Map<string, number>()
  for (const row of end) {
    const key = codeOf(row.bp_code)
    // A settled row is gone from the file: nothing is owed on it, whatever it last said.
    after.set(key, (after.get(key) ?? 0) + (row.status === 'settled' ? 0 : amount(row.balance_due)))
  }

  const before = new Map<string, { all: number; regular: number; oldest: number; middle: number }>()
  for (const row of start) {
    const key = codeOf(row.bp_code)
    if (!key) continue
    const held = before.get(key) ?? { all: 0, regular: 0, oldest: 0, middle: 0 }
    if (row.status !== 'settled') held.all += amount(row.balance_due)
    if (countsTowardsScore(row, 'regular')) {
      held.regular += amount(row.balance_due)
      held.oldest += Math.max(0, amount(row.due_121_plus))
      held.middle += Math.max(0, amount(row.due_31_60) + amount(row.due_61_90) + amount(row.due_91_120))
    }
    before.set(key, held)
  }

  let days121Plus = 0
  let days31to120 = 0
  let upTo30 = 0
  let customers = 0
  for (const [key, held] of before) {
    if (held.regular <= 0) continue
    let fell = Math.min(held.regular, held.all - (after.get(key) ?? 0))
    if (fell <= 0) continue
    customers++
    const oldest = Math.min(fell, held.oldest)
    days121Plus += oldest
    fell -= oldest
    const middle = Math.min(fell, held.middle)
    days31to120 += middle
    fell -= middle
    upTo30 += fell
  }
  return { days31to120: paise(days31to120), days121Plus: paise(days121Plus), upTo30: paise(upTo30), customers }
}

export interface NewRepeat {
  total: number
  new: number
  repeat: number
  /** Saved with no customer type: in the total, in neither side. */
  unmarked: number
}

function splitBy(list: readonly Quotation[], value: (q: Quotation) => number): NewRepeat {
  const add = (rows: readonly Quotation[]) => paise(rows.reduce((a, q) => a + value(q), 0))
  return {
    total: add(list),
    new: add(list.filter((q) => q.customer_type === 'new')),
    repeat: add(list.filter((q) => q.customer_type === 'existing')),
    unmarked: add(list.filter((q) => q.customer_type !== 'new' && q.customer_type !== 'existing')),
  }
}

/**
 * The week's quotations, counted the way the Quotations page counts them:
 * given = quoted in the week; converted = closed in the week, whenever quoted;
 * value = the order value of those converted (only won quotations carry one).
 */
export function quotationsOfWeek(list: readonly Quotation[], from: string, to: string) {
  const inWeek = (day: string | null | undefined) => Boolean(day) && day! >= from && day! <= to
  const given = list.filter((q) => inWeek(quotationDay(q)))
  const converted = list.filter((q) => q.status === 'closed' && inWeek(q.closing_date))
  return {
    given: splitBy(given, () => 1),
    converted: splitBy(converted, () => 1),
    value: splitBy(converted, (q) => q.amount ?? 0),
    /** Converted with no order value typed in. */
    convertedWithoutValue: converted.filter((q) => !((q.amount ?? 0) > 0)).length,
  }
}

export interface RfdGroup {
  lines: number
  value: number
}

/** The full RFD value of lines waiting 30 days or more: Pouches, Labels, Sleeves, and all of them. */
export function rfdWaiting(rows: readonly Pick<RfdRow, 'item_group' | 'days' | 'rfd_value'>[]) {
  const old = rows.filter((r) => (r.days ?? -1) >= RFD_WAITING_DAYS)
  const group = (test?: RegExp): RfdGroup => {
    const lines = test ? old.filter((r) => test.test(r.item_group ?? '')) : old
    return { lines: lines.length, value: paise(lines.reduce((a, r) => a + amount(r.rfd_value), 0)) }
  }
  return { pouches: group(/pouch/i), labels: group(/label/i), sleeves: group(/sleeve/i), all: group() }
}
