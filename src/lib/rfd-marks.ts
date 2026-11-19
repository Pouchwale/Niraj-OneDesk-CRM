/**
 * Setting a Ready for Dispatch line aside (19 Nov 2026, the user's request):
 * No physical quantity, Dispute, or Need to destroy - each with a reason.
 *
 * Like the payments set-asides: a coordinator asks and the team leader or the
 * administrator approves (Overview → Approvals); they themselves mark it
 * directly and can put it back. Once marked, the line leaves the RFD list, the
 * pending total and Robi's tasks, and is listed in the RFD page's own register.
 * Per line, and RFD only: the customer's other lines and payments are untouched.
 */

import { demoCompanyStore } from './demo-companies'
import { whenSaved } from './shared-data'
import type { DecisionRequest, RfdDecisionKind, RfdMark, RfdMarkKind, RfdRow } from './types'

export const RFD_MARK_LABEL: Record<RfdMarkKind, string> = {
  no_physical_qty: 'No physical quantity',
  dispute: 'Dispute',
  destroy: 'Need to destroy',
}

export const RFD_MARK_KINDS: RfdMarkKind[] = ['no_physical_qty', 'dispute', 'destroy']

export const rfdDecisionKind = (kind: RfdMarkKind): RfdDecisionKind => `rfd_${kind}` as RfdDecisionKind
export const isRfdDecision = (r: Pick<DecisionRequest, 'kind'>): r is DecisionRequest & { kind: RfdDecisionKind } => r.kind.startsWith('rfd_')
export const rfdMarkKindOf = (kind: RfdDecisionKind): RfdMarkKind => kind.slice(4) as RfdMarkKind

/** The lines still to work on: everything not set aside. */
export function openRfdRows<T extends Pick<RfdRow, 'id'>>(rows: readonly T[], marks: readonly Pick<RfdMark, 'lineId'>[] = demoCompanyStore.rfdMarks): T[] {
  if (marks.length === 0) return [...rows]
  const held = new Set(marks.map((m) => m.lineId))
  return rows.filter((r) => !held.has(r.id))
}

export function rfdMarkOf(lineId: string): RfdMark | undefined {
  return demoCompanyStore.rfdMarks.find((m) => m.lineId === lineId)
}

export function pendingRfdRequest(lineId: string): DecisionRequest | undefined {
  return demoCompanyStore.decisionRequests.find((r) => r.status === 'pending' && isRfdDecision(r) && r.rfdLineId === lineId)
}

function markFor(line: RfdRow, kind: RfdMarkKind, note: string, by: string, approvedBy: string | null): RfdMark {
  return {
    lineId: line.id,
    kind,
    note: note.trim(),
    by,
    at: new Date().toISOString(),
    approvedBy,
    customer_name: line.customer_name,
    bp_code: line.bp_code,
    sales_order: line.sales_order,
    item_code: line.item_code,
    item_name: line.item_name,
    pending_value: line.pending_value,
    coordinator_id: line.assigned_coordinator_id,
  }
}

/** The team leader or administrator: marked at once, in their name. */
export async function markRfdLine(line: RfdRow, kind: RfdMarkKind, note: string, by: string): Promise<void> {
  demoCompanyStore.setRfdMark(markFor(line, kind, note, by, null))
  await whenSaved()
}

/** A coordinator: sent for approval; the line stays in the list until then. */
export async function requestRfdMark(line: RfdRow, kind: RfdMarkKind, note: string, requestedBy: string): Promise<void> {
  demoCompanyStore.addDecisionRequest({
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: rfdDecisionKind(kind),
    entityType: line.anchor_type ?? 'overdue_payment',
    entityId: line.anchor_id ?? line.id,
    bpCode: line.bp_code,
    name: `${line.customer_name}${line.sales_order ? ` · SO ${line.sales_order}` : ''}`,
    amount: line.pending_value,
    reason: note.trim(),
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    rfdLineId: line.id,
  })
  await whenSaved()
}

/** Approving a coordinator's request: the mark in their name with their reason, and who approved it. */
export function applyRfdDecision(request: DecisionRequest, approverId: string): void {
  if (!isRfdDecision(request) || !request.rfdLineId) return
  const line = demoCompanyStore.rfdRows.find((r) => r.id === request.rfdLineId)
  const kind = rfdMarkKindOf(request.kind)
  const mark: RfdMark = line
    ? markFor(line, kind, request.reason, request.requestedBy, approverId)
    : {
        lineId: request.rfdLineId, kind, note: request.reason, by: request.requestedBy, at: new Date().toISOString(), approvedBy: approverId,
        customer_name: request.name, bp_code: request.bpCode, sales_order: null, item_code: null, item_name: null,
        pending_value: request.amount, coordinator_id: request.requestedBy,
      }
  demoCompanyStore.setRfdMark(mark)
}

/** The team leader or administrator puts the line back into the list. */
export async function clearRfdLineMark(lineId: string): Promise<void> {
  demoCompanyStore.clearRfdMark(lineId)
  await whenSaved()
}
