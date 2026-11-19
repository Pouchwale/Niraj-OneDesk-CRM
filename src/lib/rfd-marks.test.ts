/**
 * Setting a Ready for Dispatch line aside (19 Nov 2026): No physical quantity,
 * Dispute, Need to destroy - with a reason; a coordinator asks, the team
 * leader approves; per line, RFD only.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { accountRefusal, decisionRequestRefusal, mayCall, type Book } from '../../server/modules/data/operations'
import { ensurePlan, rfdEvidence, resetPlansForTests } from '../features/assistant/plan-store'
import { resolvePlan } from '../features/assistant/daily-plan'
import { demoCompanyStore } from './demo-companies'
import { approveDecision, pendingDecisionFor, rejectDecision } from './no-followup-api'
import { clearRfdLineMark, markRfdLine, openRfdRows, pendingRfdRequest, requestRfdMark } from './rfd-marks'
import type { OverduePayment, RfdRow } from './types'

const AVANI = 'coord-11'
const LEADER = 'leader-1'
const THU = '2026-11-19'

const line = (id: string, customer: string, pending: number, days = 50, owner = AVANI): RfdRow => ({
  id, customer_name: customer, production_order: `P-${id}`, po_status: 'Closed', sales_order: `S-${id}`, item_code: `FGPO-${id}`,
  item_name: 'Pouch', item_group: 'FG-Pouch', planned_qty: 1, rfd_qty: 1, uom: 'PCS', so_rate: 1, rfd_value: pending, paid_1: 0, paid_2: 0,
  pending_value: pending, warehouse: 'FG-01', batches: 1, ready_since: '2026-09-30', days, bp_code: `BP-${customer}`,
  assigned_coordinator_id: owner, coordinator_name: 'Avani Patel', anchor_type: 'overdue_payment', anchor_id: `ovd-${customer}`,
  imported_at: `${THU}T06:00:00Z`,
})

const rows = () => [line('a1', 'ALPHA', 50_000), line('a2', 'ALPHA', 20_000, 30), line('b1', 'BETA', 40_000), line('h1', 'HERS', 9_000, 50, 'coord-1')]
const ageing = { id: 'ovd-ALPHA', bp_code: 'BP-ALPHA', customer_name: 'ALPHA', balance_due: 80_000, assigned_coordinator_id: 'coord-1' } as unknown as OverduePayment

beforeEach(() => {
  resetPlansForTests()
  demoCompanyStore.replaceAll({
    ...demoCompanyStore.getSnapshot(),
    rfdRows: rows(), rfdMarks: [], decisionRequests: [], overduePayments: [ageing], companies: [], followups: [], attendance: [], robiOffDays: [], moduleAccess: [],
  })
})

describe('Setting an RFD line aside', () => {
  it('the team leader marks a line at once: it leaves the list and Robi, the other lines stay', async () => {
    await markRfdLine(demoCompanyStore.rfdRows[0], 'no_physical_qty', 'Stock not found in FG-01', LEADER)
    expect(openRfdRows(demoCompanyStore.rfdRows).map((r) => r.id)).toEqual(['a2', 'b1', 'h1'])
    const mark = demoCompanyStore.rfdMarks[0]
    expect(mark).toMatchObject({ lineId: 'a1', kind: 'no_physical_qty', note: 'Stock not found in FG-01', by: LEADER, approvedBy: null, pending_value: 50_000 })
    // ALPHA is still a customer through its other line, but with only that line's money.
    const plan = ensurePlan(AVANI, THU, [], rfdEvidence(AVANI, THU, []))
    expect(plan.items.find((i) => i.entityName === 'ALPHA')?.amount).toBe(20_000)
  })

  it('a task closes when its customer has nothing left that is not set aside', async () => {
    const plan = ensurePlan(AVANI, THU, [], rfdEvidence(AVANI, THU, []))
    await markRfdLine(demoCompanyStore.rfdRows.find((r) => r.id === 'b1')!, 'destroy', 'Print error, to be scrapped', LEADER)
    const ev = rfdEvidence(AVANI, THU, [])
    const resolved = resolvePlan(plan, [], [], AVANI, ev.open, ev.mine, undefined, ev.customerOf)
    expect(resolved.items.find((i) => i.entityName === 'BETA')?.status).toBe('closed')
    expect(resolved.items.find((i) => i.entityName === 'ALPHA')?.status).toBe('open')
  })

  it('a coordinator asks; nothing changes until approved, then it is marked in her name with the approver', async () => {
    await requestRfdMark(demoCompanyStore.rfdRows[0], 'dispute', 'Customer says rate is wrong', AVANI)
    expect(openRfdRows(demoCompanyStore.rfdRows)).toHaveLength(4)
    const request = pendingRfdRequest('a1')!
    expect(request).toMatchObject({ kind: 'rfd_dispute', rfdLineId: 'a1', requestedBy: AVANI, status: 'pending' })
    // Payments are not affected: no pending set-aside for the customer's ageing row.
    expect(pendingDecisionFor({ entityType: 'overdue_payment', entityId: 'ovd-ALPHA', bpCode: 'BP-ALPHA' })).toBeUndefined()

    await approveDecision(request, LEADER)
    expect(demoCompanyStore.rfdMarks[0]).toMatchObject({ lineId: 'a1', kind: 'dispute', by: AVANI, approvedBy: LEADER })
    expect(demoCompanyStore.decisionRequests[0].status).toBe('approved')
    expect(demoCompanyStore.getAllOverduePayments()[0].no_followup_at ?? null).toBeNull()
  })

  it('a rejected request leaves the line in the list', async () => {
    await requestRfdMark(demoCompanyStore.rfdRows[0], 'destroy', 'Damaged in rain', AVANI)
    await rejectDecision(pendingRfdRequest('a1')!, LEADER, 'Check with stores first')
    expect(demoCompanyStore.rfdMarks).toHaveLength(0)
    expect(pendingRfdRequest('a1')).toBeUndefined()
  })

  it('put back returns the line to the list', async () => {
    await markRfdLine(demoCompanyStore.rfdRows[0], 'dispute', 'Rate dispute', LEADER)
    await clearRfdLineMark('a1')
    expect(openRfdRows(demoCompanyStore.rfdRows)).toHaveLength(4)
  })

  it('survives the next sync of the RFD sheet', async () => {
    await markRfdLine(demoCompanyStore.rfdRows[0], 'dispute', 'Rate dispute', LEADER)
    demoCompanyStore.replaceRfdRows(rows())
    expect(openRfdRows(demoCompanyStore.rfdRows).map((r) => r.id)).not.toContain('a1')
  })
})

describe('Who may set an RFD line aside (server)', () => {
  const book: Book = { companies: [], overduePayments: [], rfdRows: rows() }
  const ask = (over: Record<string, unknown>) => [{ kind: 'rfd_dispute', rfdLineId: 'a1', requestedBy: AVANI, reason: 'Rate is wrong', entityType: 'overdue_payment', entityId: 'ovd-ALPHA', ...over }]

  it('a coordinator may ask about her own line, with a reason', () => {
    expect(decisionRequestRefusal('coordinator', AVANI, 'addDecisionRequest', ask({}), book)).toBeNull()
    expect(decisionRequestRefusal('coordinator', AVANI, 'addDecisionRequest', ask({ rfdLineId: 'h1' }), book)).toMatch(/assigned to you/)
    expect(decisionRequestRefusal('coordinator', AVANI, 'addDecisionRequest', ask({ rfdLineId: 'gone' }), book)).toMatch(/could not be found/)
    expect(decisionRequestRefusal('coordinator', AVANI, 'addDecisionRequest', ask({ reason: 'no' }), book)).toMatch(/reason/)
  })

  it('only the team leader or administrator marks directly or puts back, and never without a reason', () => {
    expect(accountRefusal('coordinator', AVANI, 'setRfdMark', [{ note: 'Rate is wrong' }], book)).toMatch(/approval/)
    expect(accountRefusal('team_leader', LEADER, 'setRfdMark', [{ note: 'Rate is wrong' }], book)).toBeNull()
    expect(accountRefusal('team_leader', LEADER, 'setRfdMark', [{ note: 'x' }], book)).toMatch(/reason/)
    expect(mayCall('coordinator', 'clearRfdMark')).toBe(false)
    expect(mayCall('team_leader', 'clearRfdMark')).toBe(true)
  })
})
