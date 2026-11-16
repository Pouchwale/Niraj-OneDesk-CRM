/**
 * Robi fixes (16 Nov 2026), found in the saved plans: tasks on a customer
 * handed to someone else ("a company"), a customer twice in one plan, and
 * carried tasks under the Rs 1,000 minimum.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { Company, Followup, OverduePayment } from '@/lib/types'
import { demoCompanyStore } from '@/lib/demo-companies'
import { balanceLookup, customerLookup, openAccountKeys, owedTasks, waitingCustomers, type PlanItem } from './daily-plan'
import { ensurePlan, oncePerCustomer, resetPlansForTests } from './plan-store'
import { buildAssistantTasks } from './rules'

const ME = 'coord-1'
const DAY1 = '2026-10-12'
const DAY2 = '2026-10-13'

const invoice = (id: string, amount = 50000, owner = ME): Company =>
  ({
    id, sap_bp_code: `INV-${id}`, name: `Active ${id}`, invoice_no: id, contact_person: null, contact_number: '',
    email: null, payment_terms: '30 days', total_amount: amount, invoice_date: '2026-06-01', due_date: '2026-07-01',
    status: 'critical', assigned_coordinator_id: owner, module: null, remarks: null, extra_fields: {},
    created_at: '2026-06-01', updated_at: '2026-06-01',
  }) as Company

const promise = (entityId: string, committed: string): Followup =>
  ({
    id: `f-${entityId}`, entity_type: 'company', entity_id: entityId, coordinator_id: ME, followup_date: '2026-10-01',
    created_at: '2026-10-01T05:00:00.000Z', status: 'promised', committed_date: committed, committed_amount: 10000, notes: null,
  }) as unknown as Followup

beforeEach(() => {
  resetPlansForTests()
  demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), attendance: [], robiOffDays: [], moduleAccess: [] })
})

describe('Robi fixes', () => {
  it('gives no task from a promise on a customer that is no longer this coordinator’s', () => {
    const mine = invoice('a')
    const tasks = buildAssistantTasks({ companies: [mine], overduePayments: [], followups: [promise('a', '2026-10-05'), promise('gone', '2026-10-05')], today: DAY1 })
    const broken = tasks.filter((t) => t.kind === 'commitment_broken')
    expect(broken.map((t) => t.entityId)).toEqual(['a'])
    expect(tasks.some((t) => t.entityName === 'a company')).toBe(false)
  })

  it('keeps a customer once in a plan', () => {
    const item = (taskId: string, entityId: string) => ({ taskId, kind: 'stale_contact', message: '', entityType: 'company', entityId }) as PlanItem
    const customerOf = (key: string) => (key === 'company:x1' || key === 'company:x2' ? 'bp:X' : key)
    expect(oncePerCustomer([item('t1', 'x1'), item('t2', 'y'), item('t3', 'x2')], customerOf).map((i) => i.taskId)).toEqual(['t1', 't2'])
  })

  it('does not carry a task whose customer now owes under Rs 1,000', () => {
    const companies = 'abcdefghij'.split('').map((id) => invoice(id))
    const overdue: OverduePayment[] = []
    const evidence = (list: Company[]) => {
      const open = openAccountKeys(list, overdue)
      return { followups: [], open, mine: open, customerOf: customerLookup(list, overdue), balanceOf: balanceLookup(list, overdue), overduePayments: overdue, companies: list }
    }
    const day1 = ensurePlan(ME, DAY1, buildAssistantTasks({ companies, overduePayments: overdue, followups: [], today: DAY1 }), evidence(companies))
    expect(day1.items.length).toBeGreaterThan(0)
    // Overnight one planned customer paid nearly everything: Rs 19 left.
    const small = day1.items[0].entityId!
    const after = companies.map((c) => (c.id === small ? { ...c, total_amount: 19 } : c))
    const day2 = ensurePlan(ME, DAY2, buildAssistantTasks({ companies: after, overduePayments: overdue, followups: [], today: DAY2 }), evidence(after))
    expect(day2.items.some((i) => i.entityId === small)).toBe(false)
    expect(day2.items.filter((i) => i.carriedFrom === DAY1).length).toBe(day1.items.length - 1)
  })

  it('treats Robi tasks switched off as a day off for that coordinator only', () => {
    demoCompanyStore.setModuleAccess(ME, ['robi_tasks'], 'admin-0', '2026-11-16T05:00:00.000Z')
    expect(demoCompanyStore.getAttendance(ME, DAY1)).toMatchObject({ status: 'leave', robiOff: true })
    expect(demoCompanyStore.getAttendance('coord-2', DAY1)).toBeNull()
  })

  it('rests a customer from the local day of the call, not its UTC date', () => {
    // 20:00 UTC on 15 Nov is 01:30 on 16 Nov in India: rest days count from 16 Nov.
    const call = { ...promise('a', ''), committed_date: null, next_reminder_date: null, created_at: '2026-11-15T20:00:00.000Z', followup_date: '2026-11-15T20:00:00.000Z' } as unknown as Followup
    const resting = waitingCustomers([call], '2026-11-20', undefined, true)
    expect(resting.has('company:a')).toBe(new Date('2026-11-15T20:00:00.000Z').getDate() === 16)
  })

  it('counts the tasks owed as the score does: closed and moved ones left out', () => {
    // Devyani on 16 Nov: 8 given, 4 set aside, 1 moved to Krupa: 2 done of 3.
    expect(owedTasks({ total: 8, closed: 4, moved: 1 })).toBe(3)
    expect(owedTasks({ total: 9, closed: 0, moved: 0 })).toBe(9)
  })
})
