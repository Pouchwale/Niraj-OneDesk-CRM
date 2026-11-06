/**
 * What a browser is allowed to ask the server to do.
 *
 * The browser no longer changes records itself — it says what it wants done and
 * the server does it. That only helps if the list of things it may ask for is
 * finite and written down, so here it is. Anything not in this table is
 * refused, which means a method added to the store later is unreachable from
 * outside until somebody deliberately lists it and says who may call it.
 *
 * Three levels, matching how the office actually works:
 *
 *   'team'    — the whole book: importing the workbook, retiring rows it no
 *               longer mentions, reassigning. The team leader and the
 *               administrator.
 *   'own'     — the daily work on an account: logging a call, recording a
 *               promise, updating a record. Anyone signed in.
 *   'account' — a decision about a customer: setting it aside with no
 *               follow-up, declaring it bankrupt, and undoing either. The
 *               coordinator on the phone is the one who finds out, so they
 *               may decide — but only on an account assigned to them, in their
 *               own name, and only undoing what they decided themselves. See
 *               accountRefusal.
 *
 * The administrator passes everything, the same rule the pages use.
 */

import type { AuthRole } from '../../../shared/auth'
import type { Company, OverduePayment } from '../../../src/lib/types'

export type OperationLevel = 'team' | 'own' | 'account'

/**
 * Every operation a browser may ask for, and who may ask.
 *
 * Read methods are absent on purpose: reading happens through the snapshot,
 * which is already scoped to whoever asked for it.
 */
export const OPERATIONS: Record<string, OperationLevel> = {
  /* ── The workbook: one person imports, everybody sees it ── */
  upsertCompany: 'team',
  upsertOverduePayment: 'team',
  supersedeCompany: 'team',
  settleCompanies: 'team',
  settleOverduePayments: 'team',
  deleteCompany: 'team',
  deleteOverduePayment: 'team',
  addUpload: 'team',
  addUploadError: 'team',
  refreshStatuses: 'team',
  /*
   * Clearing the sample rows the app ships with, which the first real import
   * replaces. Not a reset: it only removes seeded records nobody has touched.
   * `resetToSeeds` is deliberately absent — it throws the whole book away, and
   * nothing in the app asks for it.
   */
  dropUntouchedSeeds: 'team',

  /* ── Decisions about a customer, which change what everyone else sees ── */
  // The team leader and the administrator apply these. A coordinator asks
  // (addDecisionRequest) and the team leader approves - since 7 Oct 2026.
  // Never without a reason (see accountRefusal).
  setNoFollowup: 'account',
  clearNoFollowup: 'team',
  declareCustomerBankrupt: 'account',
  reinstateCustomer: 'team',
  addDecisionRequest: 'own',
  reviewDecisionRequest: 'team',
  // Who is in the office: the team leader and the administrator decide.
  setAttendance: 'team',
  clearAttendance: 'team',
  // The RFD sheet, synced by the team leader's screen like the other books.
  replaceRfdRows: 'team',
  // Quotations: a coordinator keeps their own (see quotationRefusal).
  saveQuotation: 'own',
  addQuotationFollowup: 'own',
  deleteQuotation: 'team',
  importQuotations: 'team',

  // Billing issues: anyone logs one; a coordinator edits only what they logged (see billingIssueRefusal).
  saveBillingIssue: 'own',
  deleteBillingIssue: 'team',
  importBillingIssues: 'team',

  // Service log: a coordinator keeps their own rows (see serviceRecordRefusal); the leader sets Total Customers.
  saveServiceRecord: 'own',
  deleteServiceRecord: 'team',
  importServiceRecords: 'team',
  setServiceCustomers: 'team',

  // Self leads: a coordinator keeps their own (see selfLeadRefusal).
  saveSelfLead: 'own',
  addSelfLeadRemark: 'own',
  deleteSelfLead: 'team',

  // Robi days off: the administrator only (see robiOffDayRefusal).
  setRobiOffDay: 'team',
  clearRobiOffDay: 'team',

  // Festival celebrations: the administrator only (see festivalConfigRefusal).
  saveFestivalConfig: 'team',
  /*
   * The ageing-row-only forms of the two above, which a browser still open on
   * the previous version sends. Left with the team, since they carry no
   * account check of their own.
   */
  declareBankrupt: 'team',
  reinstateOverduePayment: 'team',
  reassignCompany: 'team',

  /* ── The daily chase ── */
  addFollowup: 'own',
  editFollowup: 'own',
  touchOverduePayment: 'own',
  updateCompany: 'own',
  updateOverduePayment: 'own',
  addAuditEntry: 'own',

  /* ── Learning a coordinator's name from a sheet ── */
  addAlias: 'team',
  removeAlias: 'team',

  /*
   * ── Robi's daily plans ──
   * Made by whichever screen opens first on the day - the coordinator's own,
   * or the leader's, which plans the whole team. A coordinator only ever
   * touches their own (see planRefusal).
   */
  /* ── Messages through Robi: the team leader and the administrator send ── */
  addDirectedMessages: 'team',

  /* ── Robi's proof checks: the coordinator answers, the leader reviews ── */
  addProofRequest: 'own',
  submitProof: 'own',
  markProofMissed: 'own',
  reviewProof: 'team',

  recordDailyPlan: 'own',
  addDailyPlanRound: 'own',
  setDailyPlanItemSkipped: 'own',
  closeDailyPlan: 'own',
}

const PLAN_OPERATIONS = new Set(['recordDailyPlan', 'addDailyPlanRound', 'setDailyPlanItemSkipped', 'closeDailyPlan'])

/**
 * Why this person may not change that plan, or null when they may.
 *
 * The team leader and the administrator plan for the whole team. A coordinator
 * keeps their own plan and nobody else's - otherwise one coordinator could
 * rewrite another's day, or the record of what they finished.
 */
export function planRefusal(role: AuthRole | undefined, userId: string, method: string, args: unknown[]): string | null {
  if (!PLAN_OPERATIONS.has(method)) return null
  if (role === 'admin' || role === 'team_leader') return null
  const first = args[0]
  const owner = method === 'recordDailyPlan' ? (first as { userId?: unknown } | null)?.userId : first
  return owner === userId ? null : 'You can only change your own plan.'
}

/**
 * Why this person may not touch that proof request, or null when they may. A
 * coordinator answers their own requests and nobody else's.
 */
export function proofRefusal(
  role: AuthRole | undefined,
  userId: string,
  method: string,
  args: unknown[],
  requests: { id: string; coordinatorId: string }[]
): string | null {
  if (!['addProofRequest', 'submitProof', 'markProofMissed'].includes(method)) return null
  if (role === 'admin' || role === 'team_leader') return null
  const owner =
    method === 'addProofRequest'
      ? (args[0] as { coordinatorId?: unknown } | null)?.coordinatorId
      : requests.find((r) => r.id === args[0])?.coordinatorId
  return owner === userId ? null : 'You can only answer your own proof requests.'
}

/**
 * Why a coordinator may not change this quotation, or null when they may:
 * only their own, and they cannot hand one to somebody else.
 */
export function quotationRefusal(
  role: AuthRole | undefined,
  userId: string,
  method: string,
  args: unknown[],
  quotations: { id: string; coordinator_id: string | null }[]
): string | null {
  if (method !== 'saveQuotation' && method !== 'addQuotationFollowup') return null
  if (role === 'admin' || role === 'team_leader') return null
  const id = method === 'saveQuotation' ? (args[0] as { id?: unknown } | null)?.id : args[0]
  const held = quotations.find((q) => q.id === id)
  if (held && held.coordinator_id !== userId) return 'You can only change your own quotations.'
  if (method === 'saveQuotation' && (args[0] as { coordinator_id?: unknown } | null)?.coordinator_id !== userId) {
    return 'A quotation you save must be your own.'
  }
  return null
}

/**
 * Why a coordinator may not save this billing issue, or null when they may:
 * they log new ones in their own name and change only the ones they logged.
 */
export function billingIssueRefusal(
  role: AuthRole | undefined,
  userId: string,
  method: string,
  args: unknown[],
  issues: { id: string; created_by: string | null }[]
): string | null {
  if (method !== 'saveBillingIssue') return null
  if (role === 'admin' || role === 'team_leader') return null
  const issue = (args[0] ?? null) as { id?: unknown; created_by?: unknown } | null
  const held = issues.find((i) => i.id === issue?.id)
  if (held) return held.created_by === userId ? null : 'You can only change billing issues you logged.'
  return issue?.created_by === userId ? null : 'A billing issue you log must be in your own name.'
}

/**
 * Why a coordinator may not save this service record, or null when they may:
 * only their own rows, and they cannot hand one to somebody else.
 */
export function serviceRecordRefusal(
  role: AuthRole | undefined,
  userId: string,
  method: string,
  args: unknown[],
  records: { id: string; coordinator_id: string | null }[]
): string | null {
  if (method !== 'saveServiceRecord') return null
  if (role === 'admin' || role === 'team_leader') return null
  const record = (args[0] ?? null) as { id?: unknown; coordinator_id?: unknown } | null
  const held = records.find((r) => r.id === record?.id)
  if (held && held.coordinator_id !== userId) return 'You can only change your own service records.'
  return record?.coordinator_id === userId ? null : 'A service record you save must be your own.'
}

/**
 * Why a coordinator may not change this self lead, or null when they may:
 * only their own, and they cannot hand one to somebody else.
 */
export function selfLeadRefusal(
  role: AuthRole | undefined,
  userId: string,
  method: string,
  args: unknown[],
  leads: { id: string; coordinator_id: string | null }[]
): string | null {
  if (method !== 'saveSelfLead' && method !== 'addSelfLeadRemark') return null
  if (role === 'admin' || role === 'team_leader') return null
  const id = method === 'saveSelfLead' ? (args[0] as { id?: unknown } | null)?.id : args[0]
  const held = leads.find((l) => l.id === id)
  if (held && held.coordinator_id !== userId) return 'You can only change your own leads.'
  if (method === 'addSelfLeadRemark' && !held) return 'That lead is not here.'
  if (method === 'saveSelfLead' && (args[0] as { coordinator_id?: unknown } | null)?.coordinator_id !== userId) {
    return 'A lead you save must be your own.'
  }
  return null
}

/** Only the administrator switches Robi's tasks off for a day, or back on. */
export function robiOffDayRefusal(role: AuthRole | undefined, method: string): string | null {
  if (method !== 'setRobiOffDay' && method !== 'clearRobiOffDay') return null
  return role === 'admin' ? null : 'Only the administrator can switch Robi off for a day.'
}

/** Only the administrator changes how Robi celebrates festivals. */
export function festivalConfigRefusal(role: AuthRole | undefined, method: string): string | null {
  if (method !== 'saveFestivalConfig') return null
  return role === 'admin' ? null : 'Only the administrator can change the festival settings.'
}

/** True when this role may ask for that operation. */
export function mayCall(role: AuthRole | undefined, operation: string): boolean {
  const level = OPERATIONS[operation]
  if (!level || !role) return false
  if (role === 'admin') return true
  if (level === 'own' || level === 'account') return true
  return role === 'team_leader'
}

/** The records an account decision is checked against. */
export interface Book {
  companies: Company[]
  overduePayments: OverduePayment[]
}

/**
 * Why this person may not make this account decision, or null when they may.
 *
 * The team leader and the administrator decide about any customer. A
 * coordinator decides about their own:
 *
 *   - the record named must be assigned to them — a decision reaches every
 *     record of the customer, so it has to start from one that is theirs;
 *   - it is made in their name, never someone else's, because the name on it
 *     is who answers for it;
 *   - a BP code, where one is given, must be that record's, or a coordinator
 *     could name their own invoice and set aside somebody else's customer;
 *   - an undo takes back only what they decided. A call the team leader made
 *     is hers to take back.
 */
/** The shortest reason accepted for setting a customer aside: a full stop is not a reason. */
export const MIN_REASON = 5

export function accountRefusal(
  role: AuthRole | undefined,
  _userId: string,
  method: string,
  args: unknown[],
  _book: Book
): string | null {
  if (OPERATIONS[method] !== 'account') return null

  // Nobody sets a customer aside, disputes or declares one bankrupt without
  // saying why - the team leader and the administrator included.
  if (method === 'setNoFollowup' || method === 'declareCustomerBankrupt') {
    const reason = String(args[3] ?? '').trim()
    if (reason.length < MIN_REASON) return `Give a reason (at least ${MIN_REASON} characters).`
  }

  if (role === 'admin' || role === 'team_leader') return null
  // A coordinator asks instead (addDecisionRequest); the team leader applies it.
  return 'Send it to your team leader for approval.'
}

/**
 * Why a coordinator may not send this request, or null when they may: it must
 * be about an account assigned to them, in their own name, with a reason.
 */
export function decisionRequestRefusal(
  role: AuthRole | undefined,
  userId: string,
  method: string,
  args: unknown[],
  book: Book
): string | null {
  if (method !== 'addDecisionRequest') return null
  const r = (args[0] ?? {}) as { entityType?: string; entityId?: string; requestedBy?: string; reason?: string }
  if (String(r.reason ?? '').trim().length < MIN_REASON) return `Give a reason (at least ${MIN_REASON} characters).`
  if (role === 'admin' || role === 'team_leader') return null
  if (r.requestedBy !== userId) return 'A request can only be sent in your own name.'
  const record =
    r.entityType === 'company'
      ? book.companies.find((c) => c.id === r.entityId)
      : book.overduePayments.find((p) => p.id === r.entityId)
  if (!record) return 'That account could not be found.'
  if (record.assigned_coordinator_id !== userId) return 'You can only ask about an account assigned to you.'
  return null
}


/** True when the store has an operation by this name at all. */
export function isOperation(name: unknown): name is string {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(OPERATIONS, name)
}
