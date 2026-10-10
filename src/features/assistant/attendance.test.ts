import { beforeEach, describe, expect, it } from 'vitest'

import type { Company, Followup, OverduePayment } from '@/lib/types'
import { demoCompanyStore } from '@/lib/demo-companies'
import { mayCall } from '../../../server/modules/data/operations'
import { balanceLookup, customerLookup, openAccountKeys, resolvePlan } from './daily-plan'
import { ensurePlan, judgedOnAttendance, resetPlansForTests } from './plan-store'
import { planHistory } from './plan-history'
import { buildAssistantTasks } from './rules'

const ME = 'coord-1'
const DAY1 = '2026-10-12'
const DAY2 = '2026-10-13'
const DAY3 = '2026-10-14'

const invoice = (id: string): Company =>
  ({
    id, sap_bp_code: `INV-${id}`, name: `Active ${id}`, invoice_no: id, contact_person: null, contact_number: '',
    email: null, payment_terms: '30 days', total_amount: 50000, invoice_date: '2026-06-01', due_date: '2026-07-01',
    status: 'critical', assigned_coordinator_id: ME, module: null, remarks: null, extra_fields: {},
    created_at: '2026-06-01', updated_at: '2026-06-01',
  }) as Company

const ageing = (id: string): OverduePayment =>
  ({
    id, bp_code: `OVD-${id}`, customer_name: `Overdue ${id}`, balance_due: 80000, due_0_30: 0, due_31_60: 0,
    due_61_90: 0, due_91_120: 0, due_121_plus: 80000, assigned_coordinator_id: ME, status: 'critical',
    extra_fields: {},
  }) as unknown as OverduePayment

const companies = 'abcdefghij'.split('').map(invoice)
const overdue = 'pqrstuvwxy'.split('').map(ageing)

function evidence(followups: Followup[] = []) {
  const open = openAccountKeys(companies, overdue)
  return {
    followups, open, mine: open,
    customerOf: customerLookup(companies, overdue),
    balanceOf: balanceLookup(companies, overdue),
    overduePayments: overdue,
    companies,
  }
}
const tasksFor = (date: string, followups: Followup[] = []) => buildAssistantTasks({ companies, overduePayments: overdue, followups, today: date })
const planFor = (date: string, followups: Followup[] = []) => ensurePlan(ME, date, tasksFor(date, followups), evidence(followups))
const resolved = (date: string, followups: Followup[] = []) => {
  const ev = evidence(followups)
  return judgedOnAttendance(planFor(date, followups), (p) =>
    resolvePlan(p, tasksFor(date, followups), followups, ME, ev.open, ev.mine, undefined, ev.customerOf)
  )
}
const mark = (date: string, status: 'leave' | 'half_day') =>
  demoCompanyStore.setAttendance({ userId: ME, date, status, by: 'admin-1', at: `${date}T03:00:00.000Z` })
const call = (entityType: 'company' | 'overdue_payment', entityId: string, at: string): Followup =>
  ({
    id: `fu-${entityId}`, entity_type: entityType, entity_id: entityId, coordinator_id: ME, followup_date: at,
    mode: 'call', notes: null, customer_response: null, committed_date: null, committed_amount: null, status: 'pending',
    proof_attachment_url: null, next_reminder_date: null, created_at: at, edited_at: null,
  }) as Followup

beforeEach(() => {
  resetPlansForTests()
  demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), attendance: [] })
})

describe('attendance: leave and half days', () => {
  it('gives no plan on leave, and the next working day brings the open work forward', () => {
    const before = planFor(DAY1)
    expect(before.items).toHaveLength(8)
    mark(DAY2, 'leave')
    expect(planFor(DAY2).items).toHaveLength(0)
    expect(demoCompanyStore.getDailyPlan(ME, DAY2)).toBeNull()
    const after = planFor(DAY3)
    expect(after.items.filter((i) => i.carriedFrom === DAY1)).toHaveLength(8)
  })

  it('sets aside a plan already made when leave is marked the same day', () => {
    planFor(DAY1)
    mark(DAY1, 'leave')
    expect(resolved(DAY1).items).toHaveLength(0)
    // Still open, so it comes forward to the next working day.
    expect(planFor(DAY2).items.filter((i) => i.carriedFrom === DAY1)).toHaveLength(8)
  })

  it('gives four fresh tasks and one proof check on a half day marked ahead', () => {
    mark(DAY1, 'half_day')
    const plan = planFor(DAY1)
    expect(plan.items).toHaveLength(4)
    expect(plan.items.filter((i) => i.entityType === 'company')).toHaveLength(2)
    expect(plan.proofTaskIds).toHaveLength(1)
  })

  it('cuts a full plan to four when the half day is marked late, keeping what was done', () => {
    const plan = planFor(DAY1)
    // The sixth task was done before the half day was marked: it stays.
    const sixth = plan.items[5]
    const followups = [call(sixth.entityType!, sixth.entityId!, `${DAY1}T10:00:00.000Z`)]
    mark(DAY1, 'half_day')
    const day = resolved(DAY1, followups)
    expect(day.items).toHaveLength(4)
    expect(day.items.map((i) => i.taskId)).toContain(sixth.taskId)
    // The four cut tasks come forward.
    const next = planFor(DAY2, followups)
    expect(next.items.filter((i) => i.carriedFrom === DAY1)).toHaveLength(7)
  })

  it('leaves leave days out of the history and scores, and judges a half day on its four', () => {
    planFor(DAY1)
    planFor(DAY2)
    const attendanceOf = (_u: string, d: string) => (d === DAY1 ? 'leave' : d === DAY2 ? 'half_day' : null)
    const rows = planHistory(demoCompanyStore.getDailyPlans(), [], DAY3, undefined, undefined, undefined, attendanceOf)
    expect(rows.filter((r) => r.date === DAY1)).toHaveLength(0)
    const day2 = rows.filter((r) => r.date === DAY2)
    expect(day2.filter((r) => !r.item.carriedFrom)).toHaveLength(4)
  })

  it('lets only the team leader and the administrator mark attendance', () => {
    expect(mayCall('coordinator', 'setAttendance')).toBe(false)
    expect(mayCall('coordinator', 'clearAttendance')).toBe(false)
    expect(mayCall('team_leader', 'setAttendance')).toBe(true)
    expect(mayCall('admin', 'clearAttendance')).toBe(true)
  })
})
