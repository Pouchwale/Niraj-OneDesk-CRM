import { describe, expect, it } from 'vitest'
import type { PeriodScores } from '@/lib/score-history'
import type { OverduePayment, Quotation } from '@/lib/types'
import { leaderScores, moneyReceived, quotationsOfWeek, rfdWaiting } from './leader-dashboard'

const entry = (coordinatorId: string, module: string, score: number | null, na = false) => ({ coordinatorId, name: coordinatorId, module, score, detail: {}, ...(na ? { na } : {}) })
const period = (entries: ReturnType<typeof entry>[]) => ({ key: '2026-11-14', entries }) as unknown as PeriodScores

const row = (over: Partial<OverduePayment> & { bp_code: string }): OverduePayment =>
  ({ status: 'overdue', assigned_coordinator_id: 'coord-1', balance_due: 0, due_0_30: 0, due_31_60: 0, due_61_90: 0, due_91_120: 0, due_121_plus: 0, ...over }) as OverduePayment

const quote = (over: Partial<Quotation>): Quotation =>
  ({ id: 'q', status: 'open', quotation_date: '2026-11-15', inquiry_date: null, closing_date: null, amount: null, customer_type: 'new', created_at: '2026-11-15T00:00:00Z', ...over }) as Quotation

describe('team and team leader scores', () => {
  const people = [
    { id: 'a', module: 'Pouchwale' as const },
    { id: 'b', module: 'Pouchwale' as const },
    { id: 'c', module: 'GP3' as const },
  ]

  it('averages Payments and Operations for each team, then the two teams', () => {
    const scores = leaderScores(
      period([entry('a', 'kpi', 40), entry('b', 'kpi', 60), entry('a', 'billing', 100), entry('b', 'billing', 100), entry('c', 'kpi', 20), entry('c', 'billing', 60)]),
      people
    )
    expect(scores.teams[0]).toEqual({ team: 'Pouchwale', payments: 50, operations: 100, final: 75 })
    expect(scores.teams[1]).toEqual({ team: 'GP3', payments: 20, operations: 60, final: 40 })
    expect(scores.leader).toBe(57.5)
  })

  it('leaves out anyone with no score or a module switched off', () => {
    const scores = leaderScores(period([entry('a', 'kpi', 40), entry('b', 'kpi', null, true), entry('c', 'kpi', 20)]), people)
    expect(scores.teams[0].payments).toBe(40)
    expect(scores.teams[0].operations).toBeNull()
    expect(scores.teams[0].final).toBe(40)
    expect(scores.leader).toBe(30)
  })

  it('has no score when the period has none', () => {
    expect(leaderScores(null, people).leader).toBeNull()
  })
})

describe('money received', () => {
  it('takes what a customer paid from their oldest dues first', () => {
    const got = moneyReceived(
      [row({ bp_code: 'C1', balance_due: 100, due_0_30: 10, due_31_60: 20, due_91_120: 20, due_121_plus: 50 })],
      [row({ bp_code: 'C1', balance_due: 30 })]
    )
    expect(got).toEqual({ days121Plus: 50, days31to120: 20, upTo30: 0, customers: 1 })
  })

  it('counts money that only got older as no payment', () => {
    const got = moneyReceived([row({ bp_code: 'C1', balance_due: 100, due_91_120: 100 })], [row({ bp_code: 'C1', balance_due: 100, due_121_plus: 100 })])
    expect(got).toEqual({ days121Plus: 0, days31to120: 0, upTo30: 0, customers: 0 })
  })

  it('counts a customer who settled or left the file as paid in full', () => {
    const got = moneyReceived(
      [row({ bp_code: 'C1', balance_due: 40, due_31_60: 40 }), row({ bp_code: 'C2', balance_due: 60, due_121_plus: 60 })],
      [row({ bp_code: 'C1', balance_due: 40, status: 'settled' })]
    )
    expect(got).toMatchObject({ days31to120: 40, days121Plus: 60, customers: 2 })
  })

  it('leaves out set-aside, already settled and unassigned customers', () => {
    const got = moneyReceived(
      [
        row({ bp_code: 'C1', balance_due: 50, due_121_plus: 50, no_followup_at: '2026-11-01' }),
        row({ bp_code: 'C2', balance_due: 50, due_121_plus: 50, bankrupt_declared_at: '2026-11-01' }),
        row({ bp_code: 'C3', balance_due: 50, due_121_plus: 50, status: 'settled' }),
        row({ bp_code: 'C4', balance_due: 50, due_121_plus: 50, assigned_coordinator_id: null }),
      ],
      []
    )
    expect(got).toEqual({ days121Plus: 0, days31to120: 0, upTo30: 0, customers: 0 })
  })

  it('does not count a balance that rose, or a credit balance', () => {
    const got = moneyReceived(
      [row({ bp_code: 'C1', balance_due: 50, due_31_60: 50 }), row({ bp_code: 'C2', balance_due: -20, due_0_30: -20 })],
      [row({ bp_code: 'C1', balance_due: 80 }), row({ bp_code: 'C2', balance_due: 0 })]
    )
    expect(got.customers).toBe(0)
  })
})

describe('quotations of the week', () => {
  it('splits given, converted and value into New and Repeat', () => {
    const q = quotationsOfWeek(
      [
        quote({ id: '1' }),
        quote({ id: '2', customer_type: 'existing' }),
        quote({ id: '3', customer_type: 'existing', status: 'closed', closing_date: '2026-11-16', amount: 800 }),
        quote({ id: '4', quotation_date: '2026-10-01', status: 'closed', closing_date: '2026-11-17', amount: 200 }),
        quote({ id: '5', quotation_date: '2026-10-01', status: 'closed', closing_date: '2026-10-05', amount: 999 }),
        quote({ id: '6', customer_type: null }),
      ],
      '2026-11-14',
      '2026-11-20'
    )
    expect(q.given).toEqual({ total: 4, new: 1, repeat: 2, unmarked: 1 })
    expect(q.converted).toEqual({ total: 2, new: 1, repeat: 1, unmarked: 0 })
    expect(q.value).toEqual({ total: 1000, new: 200, repeat: 800, unmarked: 0 })
    expect(q.convertedWithoutValue).toBe(0)
  })

  it('notes a converted quotation with no value', () => {
    const q = quotationsOfWeek([quote({ status: 'closed', closing_date: '2026-11-16', amount: null })], '2026-11-14', '2026-11-20')
    expect(q.convertedWithoutValue).toBe(1)
  })
})

describe('Ready for Dispatch 30+ days', () => {
  it('adds the RFD value of lines 30 days or older, by product and combined', () => {
    const rfd = rfdWaiting([
      { item_group: 'FG-Pouch', days: 30, rfd_value: 100 },
      { item_group: 'FG-Pouch', days: 29, rfd_value: 999 },
      { item_group: 'FG-Label', days: 45, rfd_value: 200 },
      { item_group: 'FG-Sleeve', days: 90, rfd_value: 300 },
      { item_group: 'FG-Other', days: 90, rfd_value: 50 },
      { item_group: 'FG-Label', days: null, rfd_value: 999 },
    ])
    expect(rfd.pouches).toEqual({ lines: 1, value: 100 })
    expect(rfd.labels).toEqual({ lines: 1, value: 200 })
    expect(rfd.sleeves).toEqual({ lines: 1, value: 300 })
    expect(rfd.all).toEqual({ lines: 4, value: 650 })
  })
})
