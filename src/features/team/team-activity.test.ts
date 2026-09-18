import { describe, expect, it } from 'vitest'
import { contactEffort, deskThroughput, submissionTrend, summariseTeam } from './team-activity'
import type { DailyEntry, Profile } from '@/lib/types'
import { toLocalISODate } from '@/lib/utils'

const TODAY = '2026-09-03'

function day(offset: number): string {
  const date = new Date(`${TODAY}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return toLocalISODate(date)
}

function person(id: string, name: string): Profile {
  return {
    id,
    email: `${id}@gp3.com`,
    full_name: name,
    role: 'coordinator',
    module: 'GP3',
    relation_manager_name: name,
    created_at: TODAY,
    updated_at: TODAY,
  }
}

function entry(overrides: Partial<DailyEntry> & { employee_id: string }): DailyEntry {
  return {
    id: `e-${Math.random()}`,
    entry_date: TODAY,
    is_leave: false,
    payment_calls_advance: 0,
    payment_email_advance: 0,
    overdue_calls: 0,
    overdue_emails: 0,
    fresh_leads: 0,
    mode_of_leads: null,
    leads_connected: 0,
    expected_business: 0,
    quotations_given: 0,
    quotations_followed: 0,
    orders_received: 0,
    sales_amount: 0,
    payment_collected: 0,
    customer_visits: 0,
    cross_selling: 0,
    cross_selling_value: 0,
    extraordinary_work: null,
    pending_work: 0,
    overall_status: 'green',
    created_at: TODAY,
    updated_at: TODAY,
    ...overrides,
  }
}

const ROSTER = [person('coord-1', 'Pragati Patel'), person('coord-2', 'Diya Prajapati')]

describe('team roll-up', () => {
  it('lists every coordinator, including those who filed nothing', () => {
    const team = summariseTeam(ROSTER, [], TODAY)

    expect(team.coordinators).toHaveLength(2)
    expect(team.headcount).toBe(2)
    // Not submitted is distinct from a day of zeroes.
    expect(team.coordinators.every((c) => c.todayStatus === 'missing')).toBe(true)
    expect(team.submittedToday).toBe(0)
  })

  it('adds up activity across the window', () => {
    const team = summariseTeam(
      ROSTER,
      [
        entry({ employee_id: 'coord-1', entry_date: day(-2), overdue_calls: 5, payment_calls_advance: 3, sales_amount: 100000 }),
        entry({ employee_id: 'coord-1', entry_date: day(-1), overdue_calls: 2, payment_collected: 50000 }),
      ],
      TODAY
    )

    const pragati = team.coordinators[0]
    expect(pragati.calls).toBe(10)
    expect(pragati.salesAmount).toBe(100000)
    expect(pragati.paymentCollected).toBe(50000)
    expect(pragati.entriesSubmitted).toBe(2)
    expect(team.totalSales).toBe(100000)
  })

  it('keeps one coordinator\'s numbers off another\'s row', () => {
    const team = summariseTeam(
      ROSTER,
      [
        entry({ employee_id: 'coord-1', sales_amount: 100000 }),
        entry({ employee_id: 'coord-2', sales_amount: 900000 }),
      ],
      TODAY
    )

    expect(team.coordinators[0].salesAmount).toBe(100000)
    expect(team.coordinators[1].salesAmount).toBe(900000)
  })

  it('ignores an entry from outside the window', () => {
    const team = summariseTeam(
      ROSTER,
      [entry({ employee_id: 'coord-1', entry_date: day(-45), sales_amount: 500000 })],
      TODAY
    )
    expect(team.totalSales).toBe(0)
    expect(team.coordinators[0].entriesSubmitted).toBe(0)
  })

  it('ignores an entry belonging to another team', () => {
    const team = summariseTeam(
      ROSTER,
      [entry({ employee_id: 'coord-9', sales_amount: 500000 })],
      TODAY
    )
    expect(team.totalSales).toBe(0)
  })

  it('counts leave without counting it as work', () => {
    const team = summariseTeam(
      ROSTER,
      [entry({ employee_id: 'coord-1', is_leave: true, overall_status: 'leave' })],
      TODAY
    )

    const pragati = team.coordinators[0]
    expect(pragati.todayStatus).toBe('leave')
    expect(pragati.daysOnLeave).toBe(1)
    expect(pragati.entriesSubmitted).toBe(0)
    expect(team.onLeaveToday).toBe(1)
    // On leave is not a missing entry.
    expect(team.submittedToday).toBe(0)
  })

  it('reports today separately from the window', () => {
    const team = summariseTeam(
      ROSTER,
      [
        entry({ employee_id: 'coord-1', entry_date: TODAY, overall_status: 'red' }),
        entry({ employee_id: 'coord-2', entry_date: day(-3) }),
      ],
      TODAY
    )

    expect(team.coordinators[0].todayStatus).toBe('red')
    expect(team.coordinators[1].todayStatus).toBe('missing')
    expect(team.submittedToday).toBe(1)
  })

  it('takes pending work from the latest day, not the sum of every day', () => {
    // A backlog of 5 carried for three days is 5 outstanding, not 15.
    const team = summariseTeam(
      ROSTER,
      [
        entry({ employee_id: 'coord-1', entry_date: day(-2), pending_work: 5 }),
        entry({ employee_id: 'coord-1', entry_date: day(-1), pending_work: 5 }),
        entry({ employee_id: 'coord-1', entry_date: TODAY, pending_work: 3 }),
      ],
      TODAY
    )
    expect(team.coordinators[0].pendingWork).toBe(3)
    expect(team.totalPending).toBe(3)
  })
})

describe('chart series', () => {
  it('returns one submission point per day, oldest first', () => {
    const points = submissionTrend(ROSTER, [], TODAY, 7)
    expect(points).toHaveLength(7)
    expect(points[0].date).toBe(day(-6))
    expect(points[6].date).toBe(TODAY)
  })

  it('separates filed from on-leave, and lowers the day\'s expectation', () => {
    const points = submissionTrend(
      ROSTER,
      [
        entry({ employee_id: 'coord-1', entry_date: TODAY }),
        entry({ employee_id: 'coord-2', entry_date: TODAY, is_leave: true }),
      ],
      TODAY,
      1
    )
    expect(points[0].submitted).toBe(1)
    expect(points[0].onLeave).toBe(1)
    // Someone on leave is not expected to file.
    expect(points[0].expected).toBe(1)
  })

  it('ignores another team\'s entries in the trend', () => {
    const points = submissionTrend(ROSTER, [entry({ employee_id: 'coord-9' })], TODAY, 1)
    expect(points[0].submitted).toBe(0)
  })

  it('splits contact by kind and ranks the busiest first', () => {
    const rows = contactEffort(
      ROSTER,
      [
        entry({ employee_id: 'coord-1', overdue_calls: 2 }),
        entry({ employee_id: 'coord-2', payment_calls_advance: 9, overdue_emails: 1 }),
      ],
      TODAY,
      () => true
    )
    expect(rows[0].name).toBe('Diya Prajapati')
    expect(rows[0].total).toBe(10)
    expect(rows[1].total).toBe(2)
  })

  it('leaves out desks that do not record contact at all', () => {
    // A dispatch desk showing zero calls would read as someone doing nothing.
    const rows = contactEffort(ROSTER, [], TODAY, (p) => p.id === 'coord-1')
    expect(rows.map((r) => r.name)).toEqual(['Pragati Patel'])
  })

  it('reads each desk\'s own headline field', () => {
    const series = deskThroughput(
      ROSTER,
      [
        entry({ employee_id: 'coord-1', entry_date: TODAY, sales_orders: 5 } as never),
        entry({ employee_id: 'coord-2', entry_date: TODAY, dispatches: 8 } as never),
      ],
      TODAY,
      (profile) =>
        profile.id === 'coord-1'
          ? { field: 'sales_orders', label: 'Sales Orders' }
          : { field: 'dispatches', label: 'Dispatches' },
      3
    )

    expect(series[0].metricLabel).toBe('Sales Orders')
    expect(series[0].total).toBe(5)
    expect(series[1].metricLabel).toBe('Dispatches')
    expect(series[1].total).toBe(8)
    expect(series[0].points).toHaveLength(3)
  })

  it('does not count a headline recorded on a leave day', () => {
    const series = deskThroughput(
      ROSTER.slice(0, 1),
      [entry({ employee_id: 'coord-1', entry_date: TODAY, is_leave: true, sales_orders: 9 } as never)],
      TODAY,
      () => ({ field: 'sales_orders', label: 'Sales Orders' }),
      1
    )
    expect(series[0].total).toBe(0)
  })
})
