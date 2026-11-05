/**
 * The Overdue book over time: how much sits in each part of it, week by week.
 *
 * Read-only. It sums what the book already holds and changes nothing in it;
 * the rules for what counts are the ones every other screen uses:
 *
 *   - a settled balance is gone (the Excel file no longer carries it);
 *   - "Regular" is the working book: not set aside, not bankrupt - the same
 *     rows the Overdue Payments list and the Weekly KPI count;
 *   - Dispute, No follow-up and Export are the three set-aside registers;
 *   - a bankrupt customer is in none of the four (it keeps its own register).
 *
 * The history comes from the Overdue days Weekly KPI saves every Monday, one
 * save per week, so the week-wise figures are the Monday-morning book.
 */

import { API_PREFIX } from '../../shared/api'
import { isBankrupt, isNoFollowup, setAsideKindOf } from './no-followup'
import type { OverduePayment } from './types'

export const AGEING_TREND_ROUTE = `${API_PREFIX}/ageing-trend`

export type BookSegment = 'regular' | 'dispute' | 'no_followup' | 'export'

export const BOOK_SEGMENTS: { key: BookSegment; label: string }[] = [
  { key: 'regular', label: 'Regular' },
  { key: 'dispute', label: 'Dispute' },
  { key: 'no_followup', label: 'No follow-up' },
  { key: 'export', label: 'Export' },
]

export const SEGMENT_LABEL: Record<BookSegment, string> = {
  regular: 'Regular',
  dispute: 'Dispute',
  no_followup: 'No follow-up',
  export: 'Export',
}

/** The fields a row needs to be placed and summed; saved days carry the same. */
export type BookRow = Pick<
  OverduePayment,
  'status' | 'assigned_coordinator_id' | 'due_0_30' | 'due_31_60' | 'due_61_90' | 'due_91_120' | 'due_121_plus'
> &
  Partial<Pick<OverduePayment, 'no_followup_at' | 'no_followup_kind' | 'bankrupt_declared_at'>>

/** Which of the four a balance is in, or null when it is settled or bankrupt. */
export function segmentOf(row: BookRow): BookSegment | null {
  if (row.status === 'settled' || isBankrupt(row)) return null
  if (!isNoFollowup(row)) return 'regular'
  const kind = setAsideKindOf(row)
  return kind === 'plain' ? 'no_followup' : kind
}

/** Amounts by age group, and how many accounts hold them. */
export interface AgeFigures {
  accounts: number
  d0_30: number
  d31_120: number
  d121_plus: number
}

/** One coordinator's figures in one segment. `coordinatorId` null = not assigned in the CRM. */
export interface PersonSegmentRow extends AgeFigures {
  coordinatorId: string | null
  segment: BookSegment
}

/** One week's book: the save that stands for it, summed. */
export interface BookWeek {
  /** The saved day it was summed from. */
  dayId: string
  savedAt: string
  /** Local yyyy-mm-dd of the Monday that starts the week. */
  weekStart: string
  rows: PersonSegmentRow[]
}

/**
 * A month's closing book: the live book summed by the server every half hour
 * while the month runs, so once it is over the last sum stands as its close.
 */
export interface MonthClose {
  /** yyyy-mm */
  month: string
  /** When it was last summed. */
  savedAt: string
  rows: PersonSegmentRow[]
}

export interface AgeingTrendResponse {
  weeks: BookWeek[]
  /** Month closes, recorded since 5 Nov 2026; older months fall back to their last saved week. */
  months: MonthClose[]
}

export const EMPTY_FIGURES: AgeFigures = { accounts: 0, d0_30: 0, d31_120: 0, d121_plus: 0 }

const money = (value: unknown) => Number(value) || 0
const round2 = (value: number) => Math.round(value * 100) / 100

/** 31-120 days: the three buckets between a month and four months. */
export function due31to120(row: BookRow): number {
  return money(row.due_31_60) + money(row.due_61_90) + money(row.due_91_120)
}

/** Sums a book by coordinator and segment. Settled and bankrupt rows are left out. */
export function summariseBook(rows: readonly BookRow[]): PersonSegmentRow[] {
  const groups = new Map<string, PersonSegmentRow>()
  for (const row of rows) {
    const segment = segmentOf(row)
    if (!segment) continue
    const coordinatorId = row.assigned_coordinator_id || null
    const key = `${coordinatorId ?? ''}|${segment}`
    const group = groups.get(key) ?? { coordinatorId, segment, ...EMPTY_FIGURES }
    group.accounts += 1
    group.d0_30 += money(row.due_0_30)
    group.d31_120 += due31to120(row)
    group.d121_plus += money(row.due_121_plus)
    groups.set(key, group)
  }
  return [...groups.values()].map((g) => ({
    ...g,
    d0_30: round2(g.d0_30),
    d31_120: round2(g.d31_120),
    d121_plus: round2(g.d121_plus),
  }))
}

/** Who to count: everyone, or one coordinator ('' = not assigned in the CRM). */
export const PERSON_ALL = '__all__'
export const PERSON_UNASSIGNED = ''

/** Adds up the rows of one segment (or all four) for one person (or everyone). */
export function figuresFor(
  rows: readonly PersonSegmentRow[],
  segment: BookSegment | 'all',
  person: string = PERSON_ALL
): AgeFigures {
  const total = { ...EMPTY_FIGURES }
  for (const row of rows) {
    if (segment !== 'all' && row.segment !== segment) continue
    if (person !== PERSON_ALL && (row.coordinatorId ?? PERSON_UNASSIGNED) !== person) continue
    total.accounts += row.accounts
    total.d0_30 += row.d0_30
    total.d31_120 += row.d31_120
    total.d121_plus += row.d121_plus
  }
  return {
    accounts: total.accounts,
    d0_30: round2(total.d0_30),
    d31_120: round2(total.d31_120),
    d121_plus: round2(total.d121_plus),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The Monday (local time) of the week a moment falls in, as yyyy-mm-dd. */
export function weekStartOf(iso: string): string {
  const d = new Date(iso)
  const back = (d.getDay() + 6) % 7 // Monday 0 ... Sunday 6
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back))
}

/**
 * One save per week: the earliest of the week, closest to the Monday morning
 * Weekly KPI compares against. Latest week first.
 */
export function pickWeekly<T extends { id: string; savedAt: string }>(days: readonly T[]): (T & { weekStart: string })[] {
  const byWeek = new Map<string, T>()
  for (const day of days) {
    const week = weekStartOf(day.savedAt)
    const held = byWeek.get(week)
    if (!held || day.savedAt < held.savedAt) byWeek.set(week, day)
  }
  return [...byWeek.entries()]
    .map(([weekStart, day]) => ({ ...day, weekStart }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

export type Period = 'month' | 'quarter' | 'year'

/** "2026-10", "2026-Q3" (calendar quarters: Jan-Mar is Q1) or "2026". */
export function periodKey(date: string, by: Period): string {
  const [year, month] = date.split('-').map(Number)
  if (by === 'year') return String(year)
  return by === 'month' ? `${year}-${pad(month)}` : `${year}-Q${Math.floor((month - 1) / 3) + 1}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Which months a quarter holds, "Jan–Mar". */
export function quarterMonths(quarter: number): string {
  const first = (quarter - 1) * 3
  return `${MONTHS[first]}–${MONTHS[first + 2]}`
}

/** "Oct 2026", "Q4 2026 (Oct–Dec)" or "2026". */
export function periodLabel(key: string): string {
  const [year, part] = key.split('-')
  if (!part) return year
  if (part.startsWith('Q')) {
    const quarter = Number(part.slice(1))
    return `Q${quarter} ${year} (${quarterMonths(quarter)})`
  }
  return `${MONTHS[Number(part) - 1]} ${year}`
}

/** A point in time and the book as it stood then. */
export interface BookPoint {
  /** yyyy-mm-dd */
  date: string
  rows: PersonSegmentRow[]
  /** True for today's live book rather than a saved week. */
  live?: boolean
  /** Where the figures come from, for saying so on screen. */
  source?: 'week' | 'month' | 'live'
}

/**
 * Month or quarter positions: each period shows the book at its last point -
 * the last saved week in it, or today for the period still running. Oldest first.
 */
export function rollUp(points: readonly BookPoint[], by: Period): (BookPoint & { key: string; label: string })[] {
  const last = new Map<string, BookPoint>()
  for (const point of points) {
    const key = periodKey(point.date, by)
    const held = last.get(key)
    if (!held || point.date > held.date || (point.date === held.date && point.live)) last.set(key, point)
  }
  return [...last.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, point]) => ({ ...point, key, label: periodLabel(key) }))
}

/** Today as yyyy-mm-dd, local time. */
export function todayLocal(now = new Date()): string {
  return localDate(now)
}

/** The local yyyy-mm a moment falls in. */
export function monthOf(iso: string | Date): string {
  return localDate(typeof iso === 'string' ? new Date(iso) : iso).slice(0, 7)
}

/** A chosen month ('m:2026-10') or quarter ('q:2026-Q4'), or every period. */
/**
 * What is chosen: every period, a year ('y:2026'), a quarter ('q:2026-Q4'),
 * a month ('m:2026-10') or one saved week ('w:2026-10-05', its Monday).
 */
export type PeriodChoice = 'all' | `y:${string}` | `q:${string}` | `m:${string}` | `w:${string}`

export function parsePeriod(choice: PeriodChoice): { by: Period | 'week'; key: string } | null {
  if (choice === 'all') return null
  const by = ({ y: 'year', q: 'quarter', m: 'month', w: 'week' } as const)[choice[0] as 'y' | 'q' | 'm' | 'w']
  return { by, key: choice.slice(2) }
}

/**
 * Whether a yyyy-mm-dd date falls in the chosen period. A chosen week keeps
 * its whole month in view, so the week is seen among its neighbours.
 */
export function inPeriod(date: string, choice: PeriodChoice): boolean {
  const period = parsePeriod(choice)
  if (!period) return true
  if (period.by === 'week') return periodKey(date, 'month') === periodKey(period.key, 'month')
  return periodKey(date, period.by) === period.key
}

/** Every year, quarter and month that has a point, latest first. */
export function periodChoices(points: readonly BookPoint[]): { years: string[]; months: string[]; quarters: string[] } {
  const years = new Set<string>()
  const months = new Set<string>()
  const quarters = new Set<string>()
  for (const p of points) {
    years.add(periodKey(p.date, 'year'))
    months.add(periodKey(p.date, 'month'))
    quarters.add(periodKey(p.date, 'quarter'))
  }
  const desc = (a: string, b: string) => b.localeCompare(a)
  return { years: [...years].sort(desc), months: [...months].sort(desc), quarters: [...quarters].sort(desc) }
}

/**
 * The points that stand for each period's close: every saved week, every
 * month close (dated the day it was last summed) and today's live book.
 * rollUp picks the latest of them in each period.
 */
export function closingPoints(weeks: readonly BookWeek[], months: readonly MonthClose[], live: BookPoint): BookPoint[] {
  /*
   * A close is only rewritten when the book changes, so it is dated at its
   * month's end (today for the month still running): it stands for the whole
   * month and outranks the saved weeks in it.
   */
  const monthEnd = (month: string) => {
    const [y, m] = month.split('-').map(Number)
    const end = localDate(new Date(y, m, 0))
    return end < live.date ? end : live.date
  }
  return [
    ...weeks.map((w) => ({ date: w.weekStart, rows: w.rows, source: 'week' as const })),
    ...months.map((m) => ({ date: monthEnd(m.month), rows: m.rows, source: 'month' as const })),
    { ...live, source: 'live' as const },
  ]
}
