/**
 * Setting a customer aside, and putting them back.
 *
 * Deliberately not part of companies-api or overdue-api, because it is not an
 * edit to either record: it is a decision about the customer, and the customer
 * usually exists in both books. Calling it from either screen reaches both, so
 * a coordinator cannot silence one list while the other keeps chasing.
 *
 * The distinction from bankruptcy is the money. A bankrupt customer still owes
 * what they owe - the debt is real and stays in the totals, there is just
 * nobody left to call. A customer set aside is written out of the totals
 * entirely, which is a bigger claim, so it is audited the same way and the
 * excluded amount is shown on screen rather than quietly disappearing.
 */

import { demoCompanyStore } from './demo-companies'
import { isNoFollowup } from './no-followup'
import { CLEAR_NO_FOLLOWUP, markNoFollowup } from './no-followup'
import { normalizeBpCode, sameBpCode } from './bp-code'
import type { DecisionRequest } from './types'
import { whenSaved } from './shared-data'

export type NoFollowupEntity = 'company' | 'overdue_payment'

/** The customer's identity in both books: the row you acted on, and its BP code. */
export interface NoFollowupTarget {
  entityType: NoFollowupEntity
  entityId: string
  bpCode: string | null
}

/**
 * Stops the follow-up and takes the balance out of what is owed.
 *
 * Returns how many rows moved, so the screen can say "and the ageing row too"
 * rather than leaving the coordinator to wonder whether the other book heard.
 */
export async function setNoFollowup(
  target: NoFollowupTarget,
  actorId: string,
  note?: string | null,
  kind?: 'dispute' | null
): Promise<number> {
  const fields = markNoFollowup(actorId, note, kind)

  const touched = demoCompanyStore.setNoFollowup(target.bpCode, target.entityId, actorId, note, kind ?? null)
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: target.entityType,
    entity_id: target.entityId,
    action: kind === 'dispute' ? 'set_dispute' : 'set_no_followup',
    actor_id: actorId,
    before: { no_followup_at: null },
    after: { ...fields, rows: touched },
    created_at: fields.no_followup_at ?? new Date().toISOString(),
  })
  // Resolves once the server has accepted it; a refusal rejects with its reason.
  await whenSaved()
  return touched

}

/**
 * Removes a set-aside customer from the CRM entirely.
 *
 * Every record for them, in both books, because setting aside was a decision
 * about the customer rather than about a row.
 *
 * Deliberately not a suppression list: the invoices are still in the workbook,
 * so a later sync will import them again, without the set-aside mark. That was
 * the choice made when this was asked for, and the dialog says it in as many
 * words — a delete that quietly comes back is only a problem when nobody was
 * told it would.
 *
 * Guarded on the record actually being set aside. This deletes real money from
 * the book, and it should not be reachable for an account nobody has made that
 * decision about.
 */
export async function deleteNoFollowup(
  target: NoFollowupTarget,
  actorId: string
): Promise<number> {
  const code = normalizeBpCode(target.bpCode)

  const companies = demoCompanyStore
    .getAllCompanies()
    .filter((c) => isNoFollowup(c) && (c.id === target.entityId || (code && normalizeBpCode(c.sap_bp_code) === code)))
  const ageing = demoCompanyStore
    .getAllOverduePayments()
    .filter((o) => isNoFollowup(o) && (o.id === target.entityId || (code && normalizeBpCode(o.bp_code) === code)))

  for (const company of companies) demoCompanyStore.deleteCompany(company.id)
  for (const row of ageing) demoCompanyStore.deleteOverduePayment(row.id)

  const removed = companies.length + ageing.length
  if (removed > 0) {
    demoCompanyStore.addAuditEntry({
      id: `audit-${Date.now()}`,
      entity_type: target.entityType,
      entity_id: target.entityId,
      action: 'delete_no_followup',
      actor_id: actorId,
      before: { records: removed, bp_code: target.bpCode },
      after: { deleted: true },
      created_at: new Date().toISOString(),
    })
  }
  await whenSaved()
  return removed

}

/** Puts the customer back into the working lists and back into the totals. */
export async function clearNoFollowup(
  target: NoFollowupTarget,
  actorId: string
): Promise<number> {
  const touched = demoCompanyStore.clearNoFollowup(target.bpCode, target.entityId)
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: target.entityType,
    entity_id: target.entityId,
    action: 'clear_no_followup',
    actor_id: actorId,
    before: { no_followup_at: 'set' },
    after: { ...CLEAR_NO_FOLLOWUP, rows: touched },
    created_at: new Date().toISOString(),
  })
  await whenSaved()
  return touched

}

/**
 * Declares the customer bankrupt, from an invoice or from the ageing row.
 *
 * Audited like a reassignment, because it is the same kind of act: somebody
 * changed what the team will do about a debt, and in six months the question
 * will be who, and on what basis. Returns how many records it marked.
 */
export async function declareCustomerBankrupt(
  target: NoFollowupTarget,
  actorId: string,
  note?: string | null
): Promise<number> {
  const touched = demoCompanyStore.declareCustomerBankrupt(target.entityType, target.entityId, actorId, note)
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: target.entityType,
    entity_id: target.entityId,
    action: 'declare_bankrupt',
    actor_id: actorId,
    before: { bankrupt: false },
    after: { bankrupt_declared_by: actorId, bankrupt_note: note?.trim() || null, rows: touched },
    created_at: new Date().toISOString(),
  })
  await whenSaved()
  return touched
}

/** Undoes a bankruptcy declared in error, for the whole customer. */
export async function reinstateBankruptCustomer(target: NoFollowupTarget, actorId: string): Promise<number> {
  const touched = demoCompanyStore.reinstateCustomer(target.entityType, target.entityId)
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: target.entityType,
    entity_id: target.entityId,
    action: 'reinstate',
    actor_id: actorId,
    before: { bankrupt: true },
    after: { status: 'reinstated', rows: touched },
    created_at: new Date().toISOString(),
  })
  await whenSaved()
  return touched
}

/* ===== A coordinator asks; the team leader or administrator approves ===== */

export type DecisionKind = DecisionRequest['kind']

/** A coordinator's request to set a customer aside. Nothing changes until it is approved. */
export async function requestDecision(
  target: NoFollowupTarget & { name: string; amount: number },
  kind: DecisionKind,
  requestedBy: string,
  reason: string
): Promise<void> {
  demoCompanyStore.addDecisionRequest({
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    entityType: target.entityType,
    entityId: target.entityId,
    bpCode: target.bpCode,
    name: target.name,
    amount: target.amount,
    reason: reason.trim(),
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  })
  await whenSaved()
}

/** The pending request about this customer (any of their records), if there is one. */
export function pendingDecisionFor(target: NoFollowupTarget): DecisionRequest | undefined {
  return demoCompanyStore
    .getDecisionRequests()
    .find(
      (r) =>
        r.status === 'pending' &&
        (r.entityId === target.entityId || (!!target.bpCode && !!r.bpCode && sameBpCode(r.bpCode, target.bpCode)))
    )
}

/** Applies the request in the coordinator's name, with their reason, and records who approved it. */
export async function approveDecision(request: DecisionRequest, approverId: string): Promise<void> {
  const target = { entityType: request.entityType, entityId: request.entityId, bpCode: request.bpCode }
  if (request.kind === 'bankrupt') {
    await declareCustomerBankrupt(target, request.requestedBy, request.reason)
  } else {
    await setNoFollowup(target, request.requestedBy, request.reason, request.kind === 'dispute' ? 'dispute' : null)
  }
  demoCompanyStore.reviewDecisionRequest(request.id, 'approved', approverId, new Date().toISOString())
  await whenSaved()
}

export async function rejectDecision(request: DecisionRequest, approverId: string, note: string | null): Promise<void> {
  demoCompanyStore.reviewDecisionRequest(request.id, 'rejected', approverId, new Date().toISOString(), note)
  await whenSaved()
}
