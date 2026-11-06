/**
 * Score history: weeks run Monday to Sunday, a period locks two days after it
 * ends, and each module is scored the way its own screen scores it.
 */

import { describe, expect, it } from 'vitest'

import {
  attendanceLookup,
  computePeriod,
  earliestDay,
  finalScoreOf,
  keysBetween,
  lockable,
  periodLabel,
  periodRange,
  recentKeys,
  weekOf,
  type RobiDay,
  type ScoreEntry,
  type ScoreInputs,
} from './score-history'
import type { BillingIssue, Quotation, SelfLead, ServiceRecord } from './types'

const robi = (score: number, done = 8, given = 8): RobiDay => ({ score, done, given, extra: 0, credited: 0 })
const quote = (id: string, coordinator: string, inquiry: string, status: Quotation['status'], type: Quotation['customer_type'], customer: string, amount: number | null = null) =>
  ({ id, coordinator_id: coordinator, inquiry_date: inquiry, quotation_date: inquiry, closing_date: null, created_at: `${inquiry}T09:00:00.000Z`, status, customer_type: type, customer_name: customer, amount }) as unknown as Quotation
const issue = (date: string, who: string) => ({ id: `b-${date}-${who}`, date, responsible_1: who }) as unknown as BillingIssue
const mail = (date: string, who: string, informed: boolean) => ({ id: `s-${date}-${who}`, date, coordinator_id: who, information_date: informed ? date : null }) as unknown as ServiceRecord
const lead = (date: string, who: string, connected: boolean, status: SelfLead['status']) =>
  ({ id: `l-${date}-${status}`, date, coordinator_id: who, connected, status, value: null, referred_by_name: null }) as unknown as SelfLead

const inputs: ScoreInputs = {
  coordinators: [
    { id: 'c1', name: 'Asha' },
    { id: 'c2', name: 'Bina' },
  ],
  robiDays: new Map([
    ['c1|2026-10-26', robi(-25, 6)],
    ['c1|2026-10-27', robi(0)],
    ['c2|2026-10-28', robi(-50, 4)],
    ['c1|2026-11-03', robi(-10)],
  ]),
  kpiWeeks: [
    { book: 'regular', weekStart: '2026-10-26', generatedAt: '2026-11-02T10:00:00.000Z', rows: [{ coordinatorId: 'c1', kpiScore: 80 }] },
    // Generated again later the same week: the later one counts.
    { book: 'regular', weekStart: '2026-10-26', generatedAt: '2026-11-02T12:00:00.000Z', rows: [{ coordinatorId: 'c1', kpiScore: 90 }] },
    { book: 'regular', weekStart: '2026-10-19', generatedAt: '2026-10-26T12:00:00.000Z', rows: [{ coordinatorId: 'c1', kpiScore: 70 }] },
    { book: 'dispute', weekStart: '2026-10-26', generatedAt: '2026-11-02T12:00:00.000Z', rows: [{ coordinatorId: 'c2', kpiScore: 50 }, { coordinatorId: null, kpiScore: 10 }] },
  ],
  quotations: [quote('q1', 'c1', '2026-10-27', 'closed', 'new', 'Alpha Foods', 50000), quote('q2', 'c1', '2026-10-28', 'open', 'existing', 'Beta Ltd')],
  billingIssues: [issue('2026-10-28', 'c2'), issue('2026-10-29', 'c2')],
  serviceRecords: [mail('2026-10-27', 'c1', true), mail('2026-10-28', 'c1', false)],
  serviceTargets: [{ coordinatorId: 'c1', month: '2026-10', customers: 2, updatedBy: 'admin-0', updatedAt: '2026-10-01T00:00:00.000Z' }],
  selfLeads: [lead('2026-10-27', 'c1', true, 'closed'), lead('2026-10-28', 'c1', true, 'open'), lead('2026-10-29', 'c1', false, 'open')],
}

const pick = (entries: ScoreEntry[], module: ScoreEntry['module'], who: string) => entries.find((e) => e.module === module && e.coordinatorId === who)

describe('periods', () => {
  it('runs weeks Monday to Sunday and months to their last day', () => {
    expect(weekOf('2026-11-06')).toBe('2026-11-02')
    expect(weekOf('2026-11-08')).toBe('2026-11-02')
    expect(weekOf('2026-11-09')).toBe('2026-11-09')
    expect(periodRange('week', '2026-11-02')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(periodRange('month', '2026-02').end).toBe('2026-02-28')
    expect(periodRange('month', '2028-02').end).toBe('2028-02-29')
    expect(periodRange('year', '2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('lists recent periods and every period between two days', () => {
    expect(recentKeys('week', '2026-11-06', 3)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
    expect(recentKeys('month', '2026-01-15', 2)).toEqual(['2025-12', '2026-01'])
    expect(keysBetween('month', '2026-10-30', '2027-01-02')).toEqual(['2026-10', '2026-11', '2026-12', '2027-01'])
    expect(keysBetween('year', '2025-03-01', '2026-11-06')).toEqual(['2025', '2026'])
  })

  it('locks a period two days after it ends', () => {
    // The week of 26 Oct ends on Sunday 1 Nov.
    expect(lockable('week', '2026-10-26', '2026-11-03')).toBe(false)
    expect(lockable('week', '2026-10-26', '2026-11-04')).toBe(true)
    expect(lockable('month', '2026-10', '2026-11-02')).toBe(false)
    expect(lockable('month', '2026-10', '2026-11-03')).toBe(true)
    expect(lockable('year', '2026', '2026-12-31')).toBe(false)
  })

  it('names periods for the screen', () => {
    expect(periodLabel('week', '2026-10-26')).toBe('26 Oct – 1 Nov 2026')
    expect(periodLabel('week', '2026-10-26', true)).toBe('26 Oct')
    expect(periodLabel('month', '2026-10')).toBe('Oct 2026')
  })
})

describe('scoring a week', () => {
  const week = computePeriod(inputs, 'week', '2026-10-26', '2026-11-06')

  it('averages Robi’s day scores, halves away from zero', () => {
    expect(pick(week.entries, 'robi', 'c1')).toMatchObject({ score: -13, name: 'Asha', detail: { days: 2, done: 14, given: 16 } })
    expect(pick(week.entries, 'robi', 'c2')?.score).toBe(-50)
  })

  it('leaves a Sunday plan out of Robi’s scores, as Overview → Scores does', () => {
    const withSunday = { ...inputs, robiDays: new Map([...inputs.robiDays, ['c2|2026-11-01', robi(-100, 0, 1)]]) }
    expect(pick(computePeriod(withSunday, 'week', '2026-10-26', '2026-11-06').entries, 'robi', 'c2')?.score).toBe(-50)
  })

  it('takes the latest Weekly KPI generated for the week, each book apart', () => {
    expect(pick(week.entries, 'kpi', 'c1')).toMatchObject({ score: 90, detail: { weeks: 1 } })
    expect(pick(week.entries, 'kpi_dispute', 'c2')?.score).toBe(50)
    expect(week.entries.filter((e) => e.module === 'kpi_dispute')).toHaveLength(1)
  })

  it('scores quotations as the sheet does: score ÷ customers, by enquiry date', () => {
    expect(pick(week.entries, 'quotations', 'c1')).toMatchObject({ score: 50, detail: { quotations: 2, conversions: 1, totalScore: 100, customers: 2, amount: 50000 } })
    expect(pick(week.entries, 'quotations', 'c2')).toBeUndefined()
  })

  it('gives everyone a billing score from the issue count: none is 100, two is 0', () => {
    expect(pick(week.entries, 'billing', 'c1')).toMatchObject({ score: 100, detail: { issues: 0 } })
    expect(pick(week.entries, 'billing', 'c2')).toMatchObject({ score: 0, detail: { issues: 2 } })
  })

  it('shows service mails for a week, the score itself being monthly', () => {
    expect(pick(week.entries, 'service', 'c1')).toMatchObject({ score: null, detail: { mails: 2, points: 10 } })
  })

  it('scores self leads as closed ÷ connected', () => {
    expect(pick(week.entries, 'self_leads', 'c1')).toMatchObject({ score: 50, detail: { leads: 3, connected: 2, closed: 1 } })
  })

  it('keeps coordinators’ scores only', () => {
    const withLeader = { ...inputs, quotations: [...inputs.quotations, quote('q9', 'leader-1', '2026-10-27', 'closed', 'new', 'Gamma Co')] }
    expect(computePeriod(withLeader, 'week', '2026-10-26', '2026-11-06').entries.some((e) => e.coordinatorId === 'leader-1')).toBe(false)
  })

  it('has nothing before the billing log starts', () => {
    const early = computePeriod(inputs, 'week', '2026-09-07', '2026-11-06')
    expect(early.entries.filter((e) => e.module === 'billing')).toEqual([])
  })
})

describe('scoring a month and a year', () => {
  it('gives the month’s service Final score from Total Customers', () => {
    const month = computePeriod(inputs, 'month', '2026-10', '2026-11-06')
    // 1 informed mail = 10 points; 10 ÷ 2 customers × 10 = 50.
    expect(pick(month.entries, 'service', 'c1')).toMatchObject({ score: 50, detail: { mails: 2, points: 10, customers: 2 } })
    expect(pick(month.entries, 'kpi', 'c1')).toMatchObject({ score: 80, detail: { weeks: 2 } })
  })

  it('averages a year’s monthly billing scores, months so far only', () => {
    const year = computePeriod(inputs, 'year', '2026', '2026-11-06')
    // Bina: October 0 (two issues), November 100 (none) → 50 over 2 months.
    expect(pick(year.entries, 'billing', 'c2')).toMatchObject({ score: 50, detail: { months: 2, issues: 2 } })
    expect(pick(year.entries, 'billing', 'c1')?.score).toBe(100)
    expect(pick(year.entries, 'service', 'c1')).toMatchObject({ score: 50, detail: { months: 1 } })
    expect(pick(year.entries, 'robi', 'c1')?.score).toBe(-12)
  })
})

describe('the final score', () => {
  it('averages the modules that have a score on a 0-100 scale: Robi as tasks done, billing as it is', () => {
    const final = finalScoreOf([
      { module: 'robi', score: -25 },
      { module: 'kpi', score: 60 },
      { module: 'quotations', score: 50 },
      { module: 'billing', score: -25 },
      { module: 'service', score: null },
    ])
    // (75 + 60 + 50 - 25) / 4 = 40; the service week without a score is left out.
    expect(final.score).toBe(40)
    expect(final.parts.map((p) => p.module)).toEqual(['robi', 'kpi', 'quotations', 'billing'])
  })

  it('has no final score when no module has one', () => {
    expect(finalScoreOf([{ module: 'service', score: null }]).score).toBeNull()
    expect(finalScoreOf([]).score).toBeNull()
  })

  it('works on a whole period for one coordinator', () => {
    const week = computePeriod(inputs, 'week', '2026-10-26', '2026-11-06')
    // Asha: Robi -13 → 87, KPI 90, quotations 50, billing 100, self leads 50 → 377 / 5 = 75.4.
    expect(finalScoreOf(week.entries.filter((e) => e.coordinatorId === 'c1')).score).toBe(75.4)
  })
})

describe('inputs', () => {
  it('counts a Robi day off as leave for everyone', () => {
    const away = attendanceLookup([{ userId: 'c1', date: '2026-11-05', status: 'half_day', by: 'x', at: 'x' }], [{ date: '2026-11-06', by: 'admin-0', at: 'x', note: 'Dhanteras' }])
    expect(away('c2', '2026-11-06')).toBe('leave')
    expect(away('c1', '2026-11-05')).toBe('half_day')
    expect(away('c1', '2026-11-04')).toBeNull()
  })

  it('finds the first day any module has data for', () => {
    expect(earliestDay(inputs)).toBe('2026-10-19')
    expect(earliestDay({ ...inputs, robiDays: new Map(), kpiWeeks: [], quotations: [], billingIssues: [], serviceRecords: [], selfLeads: [] })).toBeNull()
  })
})
