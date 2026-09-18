/**
 * The leader's view of everybody's day.
 *
 * This is where the fault was seen: the Overview and the leader's robot both
 * read `teamPlans`, and it reported work as finished that nobody had touched.
 *
 * These check the day as it actually runs — a plan made in the morning and
 * read again later the same day, after the records have moved underneath it.
 * Checking it across a date boundary proves nothing: the plan is rebuilt when
 * the day turns, so every assertion passes over an empty list.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { Company, Followup, OverduePayment } from '@/lib/types'
import { resetPlansForTests, teamPlans } from './plan-store'

if (typeof globalThis.localStorage === 'undefined') {
  const kept = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => kept.set(k, String(v)),
      removeItem: (k: string) => kept.delete(k),
      clear: () => kept.clear(),
      key: (i: number) => [...kept.keys()][i] ?? null,
      get length() {
        return kept.size
      },
    },
  })
}

const TODAY = '2026-09-13'

const company = (id: string, coordinatorId: string): Company =>
  ({
    id,
    name: `Customer ${id}`,
    sap_bp_code: `BP-${id}`,
    invoice_no: `INV-${id}`,
    contact_person: 'Someone',
    contact_number: '9000000000',
    email: null,
    payment_terms: '30',
    total_amount: 100000,
    invoice_date: '2026-06-01',
    due_date: '2026-07-01',
    status: 'overdue',
    assigned_coordinator_id: coordinatorId,
    module: 'Pouchwale',
    remarks: null,
    extra_fields: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }) as Company

const VISHVA = [{ id: 'coord-9', full_name: 'Vishva Vyas' }]
const noOverdue: OverduePayment[] = []
const noFollowups: Followup[] = []

/** Her accounts, and the plan the morning made from them. */
function morning(ids: string[]) {
  const hers = ids.map((id) => company(id, 'coord-9'))
  const plan = teamPlans(VISHVA, hers, noOverdue, noFollowups, TODAY)[0].plan
  // Every check below depends on there being a real plan to disturb.
  expect(plan.total).toBeGreaterThan(0)
  expect(plan.done).toBe(0)
  return { hers, planned: plan.items.map((i) => i.entityId!) }
}

beforeEach(() => {
  resetPlansForTests()
})

describe('the day the desk changed hands', () => {
  it('does not tick the old owner’s plan when her accounts are reassigned', () => {
    const { hers, planned } = morning(['a1', 'a2', 'a3', 'a4', 'a5'])

    // Mid-morning the handover runs: every account she was given is now
    // somebody else's. Still owed — just not hers.
    const moved = hers.map((c) => ({ ...c, assigned_coordinator_id: 'coord-10' }) as Company)
    const after = teamPlans(VISHVA, moved, noOverdue, noFollowups, TODAY)[0].plan

    expect(after.total).toBe(planned.length)
    expect(after.done).toBe(0)
    expect(after.moved).toBe(planned.length)
    expect(after.items.some((i) => i.status === 'done')).toBe(false)
  })

  it('does not tick it when the accounts are simply paid off', () => {
    const { hers, planned } = morning(['b1', 'b2', 'b3', 'b4', 'b5'])

    const paid = hers.map((c) => ({ ...c, status: 'paid' }) as Company)
    const after = teamPlans(VISHVA, paid, noOverdue, noFollowups, TODAY)[0].plan

    expect(after.total).toBe(planned.length)
    expect(after.done).toBe(0)
    expect(after.closed).toBe(planned.length)
  })

  it('does not tick it when the nightly sync drops the rows entirely', () => {
    // The sync reconciles against the file; a row it no longer mentions is
    // retired. The plan still points at it, and used to call that done.
    const { planned } = morning(['c1', 'c2', 'c3', 'c4', 'c5'])

    const after = teamPlans(VISHVA, [], noOverdue, noFollowups, TODAY)[0].plan

    expect(after.total).toBe(planned.length)
    expect(after.done).toBe(0)
    expect(after.closed).toBe(planned.length)
  })

  it('ticks exactly the one she actually rang', () => {
    const { hers, planned } = morning(['d1', 'd2', 'd3', 'd4', 'd5'])
    const rang = planned[0]

    const call: Followup = {
      id: 'fu-1',
      entity_type: 'company',
      entity_id: rang,
      coordinator_id: 'coord-9',
      followup_date: `${TODAY}T11:00:00`,
      mode: 'call',
      notes: 'Rang them',
      customer_response: null,
      committed_date: null,
      committed_amount: null,
      status: 'pending',
      proof_attachment_url: null,
      next_reminder_date: null,
      // After the plan was made, which is what makes it count.
      created_at: new Date(Date.now() + 60_000).toISOString(),
      edited_at: null,
    }

    const after = teamPlans(VISHVA, hers, noOverdue, [call], TODAY)[0].plan
    expect(after.done).toBe(1)
    expect(after.items.find((i) => i.entityId === rang)?.status).toBe('done')
  })
})
