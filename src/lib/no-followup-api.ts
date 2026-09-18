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
import { deleteCompany } from './companies-api'
import { deleteOverduePayment } from './overdue-api'
import { isNoFollowup } from './no-followup'
import { CLEAR_NO_FOLLOWUP, markNoFollowup } from './no-followup'
import { normalizeBpCode } from './bp-code'

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
  note?: string | null
): Promise<number> {
  const fields = markNoFollowup(actorId, note)

  const touched = demoCompanyStore.setNoFollowup(target.bpCode, target.entityId, actorId, note)
  demoCompanyStore.addAuditEntry({
    id: `audit-${Date.now()}`,
    entity_type: target.entityType,
    entity_id: target.entityId,
    action: 'set_no_followup',
    actor_id: actorId,
    before: { no_followup_at: null },
    after: { ...fields, rows: touched },
    created_at: fields.no_followup_at ?? new Date().toISOString(),
  })
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
  return touched

}
