/**
 * Robi's Ready for Dispatch list for Avani (19 Nov 2026): seven customers a
 * day, four or five of them with a line waiting 47-52 days, the rest half
 * older, half newer, biggest pending first; nothing under ₹1,000; a follow-up
 * with a next date waits for it, without one the customer rests five days
 * (three when a line is 80+ days old).
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { Followup, RfdRow } from '@/lib/types'
import { demoCompanyStore } from '@/lib/demo-companies'
import { addDaysISO } from '@/lib/utils'
import { resolvePlan } from './daily-plan'
import { ensurePlan, rfdEvidence, resetPlansForTests, teamPlans } from './plan-store'
import { rfdDaysOn } from './rfd-plan'
import { planHistory } from './plan-history'

const AVANI = 'coord-11'
const THU = '2026-11-19'
const FRI = '2026-11-20'
const SAT = '2026-11-21'
const MON = '2026-11-23'

let n = 0
const line = (customer: string, days: number, pending: number, on = THU, extra: Partial<RfdRow> = {}): RfdRow => {
  n += 1
  return {
    id: `rfd:${customer}:${n}`, customer_name: customer, production_order: `P${n}`, po_status: 'Closed', sales_order: `S${n}`,
    item_code: `FGPO${n}`, item_name: 'Pouch', item_group: 'FG-Pouch', planned_qty: 1000, rfd_qty: 1000, uom: 'PCS', so_rate: 1,
    rfd_value: pending, paid_1: 0, paid_2: 0, pending_value: pending, warehouse: 'FG-01', batches: 1,
    ready_since: addDaysISO(on, -days), days, bp_code: `BP-${customer}`, assigned_coordinator_id: AVANI, coordinator_name: 'Avani Patel',
    anchor_type: 'overdue_payment', anchor_id: `ovd-${customer}`, imported_at: `${on}T06:30:00.000Z`, ...extra,
  }
}

const rows = (): RfdRow[] => [
  line('B1', 47, 10_000), line('B2', 48, 20_000), line('B3', 50, 30_000), line('B4', 51, 40_000), line('B5', 52, 50_000), line('B6', 49, 60_000),
  line('O1', 130, 90_000), line('O2', 60, 70_000), line('O3', 85, 5_000),
  line('N1', 30, 40_000), line('N2', 10, 80_000),
  line('TINY', 150, 500),
  // Someone else's line, and one with no record to log on: never Avani's tasks.
  line('OTHER', 50, 99_000, THU, { assigned_coordinator_id: 'coord-1' }),
  line('NOANCHOR', 50, 99_000, THU, { anchor_id: null, anchor_type: null }),
]

const followup = (customer: string, at: string, next: string | null = null): Followup =>
  ({
    id: `f-${customer}-${at}`, entity_type: 'overdue_payment', entity_id: `ovd-${customer}`, coordinator_id: AVANI,
    followup_date: `${at}T10:00:00.000Z`, created_at: `${at}T10:00:00.000Z`, next_reminder_date: next, committed_date: null,
    status: 'pending', notes: 'rang',
  }) as unknown as Followup

const names = (plan: { items: { entityName?: string }[] }) => plan.items.map((i) => i.entityName)
const planOn = (date: string, followups: Followup[] = []) => ensurePlan(AVANI, date, [], rfdEvidence(AVANI, date, followups))

beforeEach(() => {
  resetPlansForTests()
  demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), attendance: [], robiOffDays: [], moduleAccess: [], followups: [] })
  demoCompanyStore.replaceRfdRows(rows())
})

describe("Avani's Ready for Dispatch list", () => {
  it('opens a band customer on their 47-52 day line, and names the oldest', () => {
    demoCompanyStore.replaceRfdRows([line('MIX', 127, 100_000), line('MIX', 48, 50_000)])
    const [item] = planOn(THU).items
    expect(item.rfdLineId).toBe(demoCompanyStore.rfdRows[1].id)
    expect(item.message).toContain('waiting 48 days (oldest 127)')
  })

  it('counts days from Ready Since, so the list moves on even before the next sync', () => {
    expect(rfdDaysOn({ ready_since: '2026-10-01', days: 49, imported_at: `${THU}T06:00:00Z` }, THU)).toBe(49)
    expect(rfdDaysOn({ ready_since: null, days: 49, imported_at: `${THU}T06:00:00Z` }, MON)).toBe(53)
  })

  it('gives seven: five from 47-52 days, then one older and one newer, biggest pending first', () => {
    const plan = planOn(THU)
    expect(names(plan)).toEqual(['B6', 'B5', 'B4', 'B3', 'B2', 'O1', 'N2'])
    expect(plan.items.every((i) => i.kind === 'rfd_followup')).toBe(true)
    // Opens the customer's line on the RFD page.
    expect(plan.items[0].rfdLineId).toMatch(/^rfd:B6:/)
    expect(plan.items[0].message).toContain('Ready for Dispatch')
  })

  it('never plans under ₹1,000, someone else\'s line, or a line with no record to log on', () => {
    const all = names(ensurePlan(AVANI, THU, [], rfdEvidence(AVANI, THU, [])))
    expect(all).not.toContain('TINY')
    expect(all).not.toContain('OTHER')
    expect(all).not.toContain('NOANCHOR')
  })

  it('splits the rest half and half when the band is short, and fills up to seven', () => {
    demoCompanyStore.replaceRfdRows([
      line('B1', 50, 10_000), line('B2', 51, 20_000),
      line('O1', 130, 90_000), line('O2', 60, 70_000), line('O3', 85, 60_000), line('O4', 200, 1_500),
      line('N1', 30, 40_000), line('N2', 10, 80_000),
    ])
    // 2 from the band, 5 left: 3 older, 2 newer.
    expect(names(planOn(THU))).toEqual(['B2', 'B1', 'O1', 'O2', 'O3', 'N2', 'N1'])
  })

  it('fills from the other groups when one runs out', () => {
    demoCompanyStore.replaceRfdRows([
      line('B1', 50, 10_000), line('B2', 51, 20_000), line('B3', 52, 30_000), line('B4', 47, 40_000),
      line('O1', 130, 90_000), line('O2', 60, 70_000), line('O3', 85, 60_000), line('O4', 200, 1_500),
    ])
    // No newer customers: the older ones take their place.
    expect(names(planOn(THU))).toEqual(['B4', 'B3', 'B2', 'B1', 'O1', 'O2', 'O3'])
  })

  it('gives four on a half day', () => {
    demoCompanyStore.setAttendance({ userId: AVANI, date: THU, status: 'half_day', by: 'leader', at: `${THU}T03:00:00Z` })
    expect(planOn(THU).items).toHaveLength(4)
  })

  it('ticks a task when she logs a follow-up on the customer, and closes it when the lines leave the sheet', () => {
    const plan = planOn(THU)
    const ev = rfdEvidence(AVANI, THU, [followup('B6', THU)])
    const resolved = resolvePlan(plan, [], ev.followups, AVANI, ev.open, ev.mine, undefined, ev.customerOf)
    expect(resolved.items.find((i) => i.entityName === 'B6')?.status).toBe('done')
    expect(resolved.items.find((i) => i.entityName === 'B5')?.status).toBe('open')

    demoCompanyStore.replaceRfdRows(rows().filter((r) => r.customer_name !== 'B5'))
    const after = resolvePlan(plan, [], ev.followups, AVANI, ev.open, ev.mine, undefined, ev.customerOf)
    expect(after.items.find((i) => i.entityName === 'B5')?.status).toBe('closed')
  })

  it('carries what was left on top (from her fresh start on 20 Nov), and a followed-up customer rests five days', () => {
    planOn(THU)
    const done = [followup('B6', THU), followup('B5', THU), followup('B4', THU), followup('B3', THU), followup('B2', THU), followup('O1', THU)]
    const fri = planOn(FRI, done)
    // N2 was not done: it comes back on top; the six rung rest, so only the four left come fresh.
    // Friday 20 Nov is Avani's fresh start (ROBI_FRESH_START): Thursday's N2 is not carried in.
    expect(fri.items.some((i) => i.carriedFrom)).toBe(false)
    // From then on, what is left comes back on top: Friday's list into Saturday.
    const friDone = fri.items.slice(1).map((i) => followup(i.entityName!, FRI))
    const sat = planOn(SAT, [...done, ...friDone])
    expect(sat.items[0]).toMatchObject({ entityName: fri.items[0].entityName, carriedFrom: FRI })
    // N2, left on Thursday, can still be picked fresh; the six rung on Thursday rest.
    expect(names(fri)).toEqual(['B1', 'O2', 'O3', 'N2', 'N1'])
    expect(names(sat)).toEqual(['B1'])
  })

  it('brings an 80+ day customer back three days after a follow-up, others after five', () => {
    // O1 (130 days) and B6 (49 days) rung on Thursday, no next date.
    const rung = [followup('O1', THU), followup('B6', THU)]
    const on = (date: string) => {
      resetPlansForTests()
      return names(ensurePlan(AVANI, date, [], rfdEvidence(AVANI, date, rung)))
    }
    expect(on(SAT)).not.toContain('O1')
    // Monday (Sunday is Robi's day off): O1 is back after three days, B6 still rests till Tuesday.
    const mon = on(MON)
    expect(mon).toContain('O1')
    expect(mon).not.toContain('B6')
  })

  it('waits for a next follow-up date she gave, whatever the age', () => {
    const dated = [followup('O1', THU, '2026-11-30')]
    expect(names(ensurePlan(AVANI, MON, [], rfdEvidence(AVANI, MON, dated)))).not.toContain('O1')
  })

  it('shows her tasks open, not moved, in the leader report (the payments book does not hold them)', () => {
    const plan = planOn(THU)
    const out = planHistory([plan], [followup('B6', THU)], THU, new Set(), new Map([[AVANI, new Set<string>()]]))
    expect(out.find((r) => r.item.entityName === 'B6')?.result).toBe('done')
    expect(out.filter((r) => r.result === 'open')).toHaveLength(6)
  })

  it('makes the same list on the leader\'s screens (teamPlans) for the RFD-only user', () => {
    const [mine] = teamPlans([{ id: AVANI, full_name: 'Avani Patel', username: 'avani', role: 'coordinator' }], [], [], [], THU)
    expect(mine.plan.items.map((i) => i.entityName)).toEqual(['B6', 'B5', 'B4', 'B3', 'B2', 'O1', 'N2'])
    expect(mine.plan.items.every((i) => i.status === 'open')).toBe(true)
  })
})
