/**
 * Team performance rolled up from the coordinators' own daily entries.
 *
 * The daily entry form is the only place this activity is recorded, so it is
 * the only honest source for it. A coordinator who has not submitted shows as
 * not submitted rather than as a zero, because the two mean very different
 * things to whoever is reading the page.
 */

import type { DailyEntry, Profile } from '@/lib/types'

export interface CoordinatorActivity {
  coordinatorId: string
  name: string
  /** Whether today's entry is in, and what it said. */
  todayStatus: 'green' | 'red' | 'leave' | 'missing'
  /** Entries submitted inside the window, excluding leave days. */
  entriesSubmitted: number
  daysOnLeave: number
  calls: number
  emails: number
  freshLeads: number
  quotations: number
  orders: number
  salesAmount: number
  paymentCollected: number
  customerVisits: number
  pendingWork: number
  /** Every error column this desk records, added together. */
  errorCount: number
}

export interface TeamActivity {
  coordinators: CoordinatorActivity[]
  /** Days in the window, used to describe the totals. */
  windowDays: number
  submittedToday: number
  onLeaveToday: number
  headcount: number
  totalSales: number
  totalCollected: number
  totalCalls: number
  totalEmails: number
  totalOrders: number
  totalPending: number
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Aggregates a team's daily entries over a rolling window.
 *
 * Every coordinator on the roster appears, whether or not they have submitted
 * anything - a team view whose rows depend on who bothered to file would hide
 * exactly the people it should surface.
 */
export function summariseTeam(
  roster: Profile[],
  entries: DailyEntry[],
  today: string,
  windowDays = 30
): TeamActivity {
  const from = shiftDays(today, -(windowDays - 1))

  const coordinators = roster.map<CoordinatorActivity>((profile) => {
    const mine = entries.filter(
      (entry) =>
        entry.employee_id === profile.id && entry.entry_date >= from && entry.entry_date <= today
    )
    const todayEntry = mine.find((entry) => entry.entry_date === today)
    const worked = mine.filter((entry) => !entry.is_leave)

    const sum = (pick: (entry: DailyEntry) => number | null | undefined): number =>
      worked.reduce((total, entry) => total + (Number(pick(entry)) || 0), 0)

    return {
      coordinatorId: profile.id,
      name: profile.full_name,
      todayStatus: todayEntry ? todayEntry.overall_status : 'missing',
      entriesSubmitted: worked.length,
      daysOnLeave: mine.length - worked.length,
      calls: sum((e) => e.payment_calls_advance) + sum((e) => e.overdue_calls),
      emails: sum((e) => e.payment_email_advance) + sum((e) => e.overdue_emails),
      freshLeads: sum((e) => e.fresh_leads),
      quotations: sum((e) => e.quotations_given),
      orders: sum((e) => e.orders_received),
      salesAmount: sum((e) => e.sales_amount),
      paymentCollected: sum((e) => e.payment_collected),
      customerVisits: sum((e) => e.customer_visits),
      errorCount:
        sum((e) => e.errors) + sum((e) => e.order_errors) + sum((e) => e.konica_errors),
      // Pending work is a standing backlog, not a running total, so the latest
      // entry is what matters rather than the sum of every day.
      pendingWork: worked.length
        ? Number(
            [...worked].sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0].pending_work
          ) || 0
        : 0,
    }
  })

  return {
    coordinators,
    windowDays,
    headcount: roster.length,
    submittedToday: coordinators.filter(
      (c) => c.todayStatus === 'green' || c.todayStatus === 'red'
    ).length,
    onLeaveToday: coordinators.filter((c) => c.todayStatus === 'leave').length,
    totalSales: coordinators.reduce((sum, c) => sum + c.salesAmount, 0),
    totalCollected: coordinators.reduce((sum, c) => sum + c.paymentCollected, 0),
    totalCalls: coordinators.reduce((sum, c) => sum + c.calls, 0),
    totalEmails: coordinators.reduce((sum, c) => sum + c.emails, 0),
    totalOrders: coordinators.reduce((sum, c) => sum + c.orders, 0),
    totalPending: coordinators.reduce((sum, c) => sum + c.pendingWork, 0),
  }
}

/* ===== Series for the charts ===== */

export interface SubmissionPoint {
  date: string
  /** Short label for the axis, e.g. "3 Sep". */
  label: string
  submitted: number
  onLeave: number
  /** People expected to file that day, i.e. headcount less those on leave. */
  expected: number
}

/** Daily filing history for the team, oldest first. */
export function submissionTrend(
  roster: Profile[],
  entries: DailyEntry[],
  today: string,
  windowDays = 30
): SubmissionPoint[] {
  const ids = new Set(roster.map((p) => p.id))
  const points: SubmissionPoint[] = []

  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const date = shiftDays(today, -offset)
    const onDay = entries.filter((entry) => entry.entry_date === date && ids.has(entry.employee_id))
    const onLeave = onDay.filter((entry) => entry.is_leave).length

    points.push({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      }),
      submitted: onDay.length - onLeave,
      onLeave,
      expected: Math.max(roster.length - onLeave, 0),
    })
  }

  return points
}

export interface ContactEffortRow {
  name: string
  advanceCalls: number
  advanceEmails: number
  overdueCalls: number
  overdueEmails: number
  total: number
}

/**
 * Customer contact by coordinator, split by kind.
 *
 * Only people whose desk actually records these columns are included - a desk
 * that never chases payment would otherwise appear as a coordinator doing
 * nothing, which is the opposite of the truth.
 */
export function contactEffort(
  roster: Profile[],
  entries: DailyEntry[],
  today: string,
  recordsContact: (profile: Profile) => boolean,
  windowDays = 30
): ContactEffortRow[] {
  const from = shiftDays(today, -(windowDays - 1))

  return roster
    .filter(recordsContact)
    .map((profile) => {
      const mine = entries.filter(
        (entry) =>
          entry.employee_id === profile.id &&
          !entry.is_leave &&
          entry.entry_date >= from &&
          entry.entry_date <= today
      )
      const sum = (pick: (entry: DailyEntry) => number | null | undefined) =>
        mine.reduce((total, entry) => total + (Number(pick(entry)) || 0), 0)

      const row = {
        name: profile.full_name,
        advanceCalls: sum((e) => e.payment_calls_advance),
        advanceEmails: sum((e) => e.payment_email_advance),
        overdueCalls: sum((e) => e.overdue_calls),
        overdueEmails: sum((e) => e.overdue_emails),
        total: 0,
      }
      row.total = row.advanceCalls + row.advanceEmails + row.overdueCalls + row.overdueEmails
      return row
    })
    .sort((a, b) => b.total - a.total)
}

export interface DeskSeries {
  coordinatorId: string
  name: string
  /** What this desk's headline number actually measures. */
  metricLabel: string
  total: number
  points: { label: string; value: number }[]
}

/**
 * Each coordinator's own headline metric over the window.
 *
 * Deliberately small multiples rather than one shared axis: dispatches and
 * artworks are not the same unit, and stacking them in a single bar chart would
 * invent a comparison that does not exist.
 */
export function deskThroughput(
  roster: Profile[],
  entries: DailyEntry[],
  today: string,
  headlineFor: (profile: Profile) => { field: string; label: string },
  windowDays = 30
): DeskSeries[] {
  return roster.map((profile) => {
    const headline = headlineFor(profile)
    const points: { label: string; value: number }[] = []
    let total = 0

    for (let offset = windowDays - 1; offset >= 0; offset--) {
      const date = shiftDays(today, -offset)
      const entry = entries.find(
        (row) => row.employee_id === profile.id && row.entry_date === date && !row.is_leave
      )
      const value = entry
        ? Number((entry as unknown as Record<string, unknown>)[headline.field]) || 0
        : 0
      total += value
      points.push({
        label: new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        }),
        value,
      })
    }

    return {
      coordinatorId: profile.id,
      name: profile.full_name,
      metricLabel: headline.label,
      total,
      points,
    }
  })
}
