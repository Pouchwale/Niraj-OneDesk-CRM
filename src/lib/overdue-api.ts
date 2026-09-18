import type { OverduePayment, OverdueStatus } from './types'
import { demoCompanyStore } from './demo-companies'
import { isBankrupt, isNoFollowup } from './no-followup'

export interface OverdueStats {
  total: number
  critical: number
  overdue: number
  inProgress: number
  settled: number
  /**
   * Declared bankrupt. Held out of totalBalance and of `total` exactly like no
   * follow-up, and listed only in the Bankrupt register (since 11 Sept 2026).
   */
  bankrupt: number
  bankruptBalance: number
  /** Set aside: neither chased nor counted in totalBalance. */
  noFollowup: number
  noFollowupAmount: number
  totalBalance: number
}

/**
 * Overdue balances, optionally scoped to one coordinator. Previously this always
 * hit Supabase, so the page threw in demo mode.
 */
export async function getOverduePayments(coordinatorId?: string): Promise<OverduePayment[]> {
  const payments = coordinatorId
    ? demoCompanyStore.getOverduePaymentsForCoordinator(coordinatorId)
    : demoCompanyStore.getAllOverduePayments()

  return [...payments].sort((a, b) => (b.balance_due || 0) - (a.balance_due || 0))

}

export async function getOverduePaymentById(id: string): Promise<OverduePayment | null> {
  return demoCompanyStore.getOverduePaymentById(id) ?? null

}

export async function getOverdueStats(coordinatorId?: string): Promise<OverdueStats> {
  return demoCompanyStore.getOverdueStats(coordinatorId)

}

export async function updateOverduePayment(
  id: string,
  updates: Partial<OverduePayment>
): Promise<void> {
  demoCompanyStore.updateOverduePayment(id, updates)
  return

}

/**
 * Brings a batch of ageing rows to nil, for a sync reconciling against the file.
 *
 * The buckets go to nil with the balance. Leaving them behind would keep the
 * row counted as critical on a screen that reads the buckets rather than the
 * status, which is most of them.
 */
export async function settleOverduePayments(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0

  return demoCompanyStore.settleOverduePayments(ids)

}

/** Reassigns an overdue balance to a different coordinator, with an audit trail. */
export async function reassignOverduePayment(
  paymentId: string,
  newCoordinatorId: string,
  actorId: string
): Promise<void> {
  const current = await getOverduePaymentById(paymentId)
  if (!current) throw new Error('Overdue payment not found')

  demoCompanyStore.updateOverduePayment(paymentId, { assigned_coordinator_id: newCoordinatorId })
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: 'overdue_payment',
    entity_id: paymentId,
    action: 'reassign',
    actor_id: actorId,
    before: { assigned_coordinator_id: current.assigned_coordinator_id },
    after: { assigned_coordinator_id: newCoordinatorId },
    created_at: new Date().toISOString(),
  })
  return

}

/**
 * Marks a customer bankrupt, and records who decided it.
 *
 * Audited like a reassignment, because it is the same kind of act: somebody
 * changed what the team will do about a debt, and in six months the question
 * will be who, and on what basis.
 */
export async function declareBankrupt(
  paymentId: string,
  actorId: string,
  note?: string | null
): Promise<void> {
  const current = await getOverduePaymentById(paymentId)
  if (!current) throw new Error('Overdue payment not found')

  const after = {
    status: 'bankrupt' as const,
    bankrupt_declared_at: new Date().toISOString(),
    bankrupt_declared_by: actorId,
    bankrupt_note: note?.trim() || null,
  }

  demoCompanyStore.declareBankrupt(paymentId, actorId, note)
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: 'overdue_payment',
    entity_id: paymentId,
    action: 'declare_bankrupt',
    actor_id: actorId,
    before: { status: current.status },
    after,
    created_at: new Date().toISOString(),
  })
  return

}

/** Undoes a declaration made in error, back to what the ageing itself says. */
export async function reinstateOverduePayment(paymentId: string, actorId: string): Promise<void> {
  const current = await getOverduePaymentById(paymentId)
  if (!current) throw new Error('Overdue payment not found')

  demoCompanyStore.reinstateOverduePayment(paymentId)
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: 'overdue_payment',
    entity_id: paymentId,
    action: 'reinstate',
    actor_id: actorId,
    before: { status: current.status, bankrupt_note: current.bankrupt_note ?? null },
    after: { status: 'reinstated' },
    created_at: new Date().toISOString(),
  })
  return

}

export async function deleteOverduePayment(id: string): Promise<void> {
  demoCompanyStore.deleteOverduePayment(id)
  return

}
