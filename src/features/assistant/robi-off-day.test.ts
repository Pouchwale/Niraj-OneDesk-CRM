/**
 * A Robi day off (Admin Panel): nobody gets tasks, a plan already made is set
 * aside with its open work coming forward, and the day is N/A in the scores.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { Company, OverduePayment } from '@/lib/types'
import { demoCompanyStore } from '@/lib/demo-companies'
import { mayCall, robiOffDayRefusal } from '../../../server/modules/data/operations'
import { balanceLookup, customerLookup, openAccountKeys, resolvePlan } from './daily-plan'
import { ensurePlan, judgedOnAttendance, resetPlansForTests } from './plan-store'
import { buildAssistantTasks } from './rules'
import { buildOverviewReport } from '../companies/overview-report'

const ME = 'coord-1'
const HER = 'coord-2'
const DAY1 = '2026-10-12'
const DAY2 = '2026-10-13'
const DAY3 = '2026-10-14'

const invoice = (id: string, owner = ME): Company =>
  ({
    id, sap_bp_code: `INV-${id}`, name: `Active ${id}`, invoice_no: id, contact_person: null, contact_number: '',
    email: null, payment_terms: '30 days', total_amount: 50000, invoice_date: '2026-06-01', due_date: '2026-07-01',
    status: 'critical', assigned_coordinator_id: owner, module: null, remarks: null, extra_fields: {},
    created_at: '2026-06-01', updated_at: '2026-06-01',
  }) as Company

const ageing = (id: string, owner = ME): OverduePayment =>
  ({
    id, bp_code: `OVD-${id}`, customer_name: `Overdue ${id}`, balance_due: 80000, due_0_30: 0, due_31_60: 0,
    due_61_90: 0, due_91_120: 0, due_121_plus: 80000, assigned_coordinator_id: owner, status: 'critical',
    extra_fields: {},
  }) as unknown as OverduePayment

const companies = 'abcdefghij'.split('').map((id) => invoice(id))
const overdue = 'pqrstuvwxy'.split('').map((id) => ageing(id))

function evidence() {
  const open = openAccountKeys(companies, overdue)
  return { followups: [], open, mine: open, customerOf: customerLookup(companies, overdue), balanceOf: balanceLookup(companies, overdue), overduePayments: overdue, companies }
}
const tasksFor = (date: string) => buildAssistantTasks({ companies, overduePayments: overdue, followups: [], today: date })
const planFor = (date: string, who = ME) => ensurePlan(who, date, tasksFor(date), evidence())
const resolved = (date: string) => {
  const ev = evidence()
  return judgedOnAttendance(planFor(date), (p) => resolvePlan(p, tasksFor(date), [], ME, ev.open, ev.mine, undefined, ev.customerOf))
}
const dayOff = (date: string) => demoCompanyStore.setRobiOffDay({ date, by: 'admin-0', at: `${date}T03:00:00.000Z`, note: 'Diwali' })

beforeEach(() => {
  resetPlansForTests()
  demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), attendance: [], robiOffDays: [] })
})

describe('Robi days off', () => {
  it('gives nobody a plan that day, and the next working day brings the open work forward', () => {
    planFor(DAY1)
    dayOff(DAY2)
    expect(planFor(DAY2).items).toHaveLength(0)
    expect(planFor(DAY2, HER).items).toHaveLength(0)
    expect(demoCompanyStore.getDailyPlan(ME, DAY2)).toBeNull()
    expect(planFor(DAY3).items.filter((i) => i.carriedFrom === DAY1)).toHaveLength(8)
  })

  it('sets aside a plan already made when the day is switched off the same day', () => {
    planFor(DAY1)
    dayOff(DAY1)
    expect(resolved(DAY1).items).toHaveLength(0)
    expect(planFor(DAY2).items.filter((i) => i.carriedFrom === DAY1)).toHaveLength(8)
  })

  it('marks every coordinator as away that day, as N/A rather than leave, and back on clears it', () => {
    dayOff(DAY2)
    expect(demoCompanyStore.getAttendance(ME, DAY2)).toMatchObject({ status: 'leave', robiOff: true })
    expect(demoCompanyStore.getAttendance(HER, DAY2)?.robiOff).toBe(true)
    expect(demoCompanyStore.getAttendance(ME, DAY1)).toBeNull()
    expect(demoCompanyStore.getRobiOffDays()).toEqual([{ date: DAY2, by: 'admin-0', at: `${DAY2}T03:00:00.000Z`, note: 'Diwali' }])
    demoCompanyStore.clearRobiOffDay(DAY2)
    expect(demoCompanyStore.getAttendance(ME, DAY2)).toBeNull()
    expect(planFor(DAY2).items).toHaveLength(8)
  })

  it('shows the day as N/A in the Overview report', () => {
    const report = buildOverviewReport({
      from: DAY1,
      to: DAY3,
      today: DAY3,
      coordinators: [{ id: ME, full_name: 'Pragati Patel' }],
      companies,
      overduePayments: overdue,
      followups: [],
      plans: [],
      proofRequests: [],
      decisionRequests: [],
      attendance: [],
      robiOffDays: [DAY2],
      nameOf: (id) => id ?? '',
    } as Parameters<typeof buildOverviewReport>[0])
    const flat = JSON.stringify(report)
    expect(flat).toContain('N/A (Robi day off)')
  })

  it('lets only the administrator switch a day off or back on', () => {
    expect(robiOffDayRefusal('admin', 'setRobiOffDay')).toBeNull()
    expect(robiOffDayRefusal('team_leader', 'setRobiOffDay')).toMatch(/administrator/)
    expect(robiOffDayRefusal('coordinator', 'clearRobiOffDay')).toMatch(/administrator/)
    expect(mayCall('coordinator', 'setRobiOffDay')).toBe(false)
  })
})
