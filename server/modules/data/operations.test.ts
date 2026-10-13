import { describe, expect, it } from 'vitest'

import { accountRefusal, decisionRequestRefusal, mayCall, quotationRefusal, type Book } from './operations'
import type { Company, OverduePayment } from '../../../src/lib/types'

const ME = 'coord-1'
const HER = 'coord-4'

const book: Book = {
  companies: [
    { id: 'mine', sap_bp_code: 'BP-1', assigned_coordinator_id: ME } as Company,
    { id: 'hers', sap_bp_code: 'BP-2', assigned_coordinator_id: HER } as Company,
    {
      id: 'mine-leader-set-aside',
      sap_bp_code: 'BP-3',
      assigned_coordinator_id: ME,
      no_followup_at: '2026-09-10T00:00:00Z',
      no_followup_by: 'admin-1',
    } as Company,
    {
      id: 'mine-i-set-aside',
      sap_bp_code: 'BP-4',
      assigned_coordinator_id: ME,
      no_followup_at: '2026-09-10T00:00:00Z',
      no_followup_by: ME,
    } as Company,
  ],
  overduePayments: [
    { id: 'my-row', bp_code: 'BP-1', assigned_coordinator_id: ME, status: 'critical' } as OverduePayment,
    {
      id: 'my-bankrupt-row',
      bp_code: 'BP-5',
      assigned_coordinator_id: ME,
      status: 'bankrupt',
      bankrupt_declared_by: ME,
    } as OverduePayment,
    {
      id: 'my-row-leader-declared',
      bp_code: 'BP-6',
      assigned_coordinator_id: ME,
      status: 'bankrupt',
      bankrupt_declared_by: 'admin-1',
    } as OverduePayment,
  ],
}

const coordinator = (method: string, args: unknown[]) => accountRefusal('coordinator', ME, method, args, book)

describe('who may make an account decision', () => {
  const R = 'customer closed down'

  it('lets a coordinator only ask; the team leader and the admin apply and undo', () => {
    for (const method of ['setNoFollowup', 'declareCustomerBankrupt', 'addDecisionRequest']) {
      expect(mayCall('coordinator', method), method).toBe(true)
    }
    for (const method of ['clearNoFollowup', 'reinstateCustomer', 'reviewDecisionRequest', 'declareBankrupt']) {
      expect(mayCall('coordinator', method), method).toBe(false)
    }
    expect(coordinator('setNoFollowup', ['BP-1', 'mine', ME, R])).toMatch(/approval/)
    expect(coordinator('declareCustomerBankrupt', ['company', 'mine', ME, R])).toMatch(/approval/)
  })

  it('refuses anyone, the team leader included, without a reason', () => {
    expect(coordinator('setNoFollowup', ['BP-1', 'mine', ME])).toMatch(/reason/)
    expect(coordinator('declareCustomerBankrupt', ['company', 'mine', ME, ''])).toMatch(/reason/)
    expect(accountRefusal('team_leader', 'admin-1', 'setNoFollowup', ['BP-2', 'hers', 'admin-1'], book)).toMatch(/reason/)
    expect(accountRefusal('admin', 'admin-1', 'setNoFollowup', ['BP-2', 'hers', 'admin-1', '  .  '], book)).toMatch(/reason/)
  })

  it('leaves the team leader and the admin free to decide for anyone, with a reason', () => {
    for (const role of ['team_leader', 'admin'] as const) {
      expect(accountRefusal(role, 'admin-1', 'setNoFollowup', ['BP-2', 'hers', 'admin-1', R, 'dispute'], book)).toBeNull()
      expect(accountRefusal(role, 'admin-1', 'declareCustomerBankrupt', ['company', 'hers', 'admin-1', R], book)).toBeNull()
    }
  })

  it('has nothing to say about operations that are not account decisions', () => {
    expect(coordinator('addFollowup', [{}])).toBeNull()
  })
})

describe('a coordinator asking for a decision', () => {
  const ask = (over: Record<string, unknown>) => [
    { id: 'dr-1', kind: 'no_followup', entityType: 'company', entityId: 'mine', requestedBy: ME, reason: 'customer closed down', ...over },
  ]
  const asks = (args: unknown[]) => decisionRequestRefusal('coordinator', ME, 'addDecisionRequest', args, book)

  it('may ask about their own account, from either book, with a reason', () => {
    expect(asks(ask({}))).toBeNull()
    expect(asks(ask({ kind: 'bankrupt', entityType: 'overdue_payment', entityId: 'my-row' }))).toBeNull()
  })

  it('must give a reason, ask in their own name, about their own account', () => {
    expect(asks(ask({ reason: 'no' }))).toMatch(/reason/)
    expect(asks(ask({ requestedBy: 'admin-1' }))).toMatch(/own name/)
    expect(asks(ask({ entityId: 'hers' }))).toMatch(/assigned to you/)
    expect(asks(ask({ entityId: 'nowhere' }))).toMatch(/could not be found/)
  })

  it('has nothing to say about other operations', () => {
    expect(decisionRequestRefusal('coordinator', ME, 'addFollowup', [{}], book)).toBeNull()
  })
})

describe('quotations', () => {
  const held = [{ id: 'q1', coordinator_id: ME }, { id: 'q2', coordinator_id: HER }]
  const coord = (method: string, args: unknown[]) => quotationRefusal('coordinator', ME, method, args, held)

  it('lets a coordinator add and work only their own', () => {
    expect(mayCall('coordinator', 'saveQuotation')).toBe(true)
    expect(mayCall('coordinator', 'deleteQuotation')).toBe(false)
    expect(mayCall('coordinator', 'importQuotations')).toBe(false)
    expect(coord('saveQuotation', [{ id: 'new', coordinator_id: ME }])).toBeNull()
    expect(coord('saveQuotation', [{ id: 'new', coordinator_id: HER }])).toMatch(/your own/)
    expect(coord('saveQuotation', [{ id: 'q2', coordinator_id: ME }])).toMatch(/your own/)
    expect(coord('addQuotationFollowup', ['q1', {}])).toBeNull()
    expect(coord('addQuotationFollowup', ['q2', {}])).toMatch(/your own/)
    expect(quotationRefusal('team_leader', 'admin-1', 'saveQuotation', [{ id: 'q2', coordinator_id: HER }], held)).toBeNull()
  })
})
