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
import type { Company, OverduePayment, RfdRow } from '../../../src/lib/types'

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
  // An RFD line set aside (19 Nov 2026): the leader marks it, a coordinator asks (addDecisionRequest).
  setRfdMark: 'account',
  clearRfdMark: 'team',
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

  // Quotations → Flexo Rate Sheets: a coordinator keeps their own (see flexoRateSheetRefusal); the leader sets the rates.
  saveFlexoRateSheet: 'own',
  deleteFlexoRateSheet: 'team',
  setFlexoRate: 'team',
  // The Quotation Sheet settings: the administrator only (see quotationConfigRefusal).
  saveQuotationConfig: 'team',

  // Self leads: a coordinator keeps their own (see selfLeadRefusal).
  saveSelfLead: 'own',
  addSelfLeadRemark: 'own',
  deleteSelfLead: 'team',

  // Robi days off: the administrator only (see robiOffDayRefusal).
  setRobiOffDay: 'team',
  clearRobiOffDay: 'team',

  // Which modules each coordinator uses: the administrator only (see moduleAccessRefusal).
  setModuleAccess: 'team',

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
  // Active Payments credit lines, replaced by the leader's / administrator's sync (28 Nov 2026).
  replaceActiveCredits: 'team',
  // Notifications read: only one's own (see notificationReadRefusal).
  markNotificationsRead: 'own',
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

/**
 * Why a coordinator may not save this Flexo Rate Sheet, or null when they may:
 * a new one, in their own name. Once made, a sheet is changed only by the
 * administrator or the team leader (27 Nov 2026, the user's request).
 */
export function flexoRateSheetRefusal(
  role: AuthRole | undefined,
  userId: string,
  method: string,
  args: unknown[],
  sheets: { id: string; coordinator_id: string | null }[]
): string | null {
  if (method !== 'saveFlexoRateSheet') return null
  if (role === 'admin' || role === 'team_leader') return null
  const sheet = (args[0] ?? null) as { id?: unknown; coordinator_id?: unknown } | null
  const held = sheets.find((s) => s.id === sheet?.id)
  // Since 27 Nov 2026 (the user): a coordinator may update the saved sheets they made; other people's stay the leader's and the administrator's.
  if (held && held.coordinator_id !== userId) return 'You can only change the quotation sheets you made; this one is someone else’s.'
  return sheet?.coordinator_id === userId ? null : 'A rate sheet you save must be your own.'
}

/**
 * A new quotation sheet's DocEntry (28 Nov 2026, the user): typed in, a whole
 * number, used by no other sheet (its reports are opened by it). A saved sheet
 * keeps its own, so an update is not checked.
 */
export function flexoDocEntryRefusal(method: string, args: unknown[], sheets: { id: string; docEntry: number }[]): string | null {
  if (method !== 'saveFlexoRateSheet') return null
  const sheet = (args[0] ?? null) as { id?: unknown; docEntry?: unknown } | null
  if (sheets.some((s) => s.id === sheet?.id)) return null
  const n = sheet?.docEntry
  // 0: a page still on older code, numbered by the store as before.
  if (n === 0) return null
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return 'Fill in the DocEntry: a whole number.'
  return sheets.some((s) => s.docEntry === n) ? `DocEntry ${n} is already used by another quotation sheet.` : null
}

/**
 * An Active Payments row read by a screen on older code (28 Nov 2026): the
 * file's "Ref No" (the invoice number) was left over unused, so the row came
 * with a wrong invoice number and the amount before GST. Refused, so a screen
 * that has not reloaded yet cannot write such rows again.
 */
export function staleImportRefusal(method: string, args: unknown[]): string | null {
  if (method !== 'upsertCompany') return null
  const extra = (args[0] as { extra_fields?: Record<string, unknown> } | undefined)?.extra_fields
  return extra && Object.prototype.hasOwnProperty.call(extra, 'Ref No')
    ? 'This screen is on an older version of the CRM that reads the Active Payment file wrongly; it reloads itself in a moment (or press F5).'
    : null
}

/** Everyone marks only their own notifications read (28 Nov 2026). */
export function notificationReadRefusal(userId: string, method: string, args: unknown[]): string | null {
  if (method !== 'markNotificationsRead') return null
  return args[0] === userId ? null : 'You can only mark your own notifications read.'
}

/** Only the administrator switches Robi's tasks off for a day, or back on. */
export function robiOffDayRefusal(role: AuthRole | undefined, method: string): string | null {
  if (method !== 'setRobiOffDay' && method !== 'clearRobiOffDay') return null
  return role === 'admin' ? null : 'Only the administrator can switch Robi off for a day.'
}

/** Only the administrator switches a coordinator's modules on or off. */
export function moduleAccessRefusal(role: AuthRole | undefined, method: string): string | null {
  if (method !== 'setModuleAccess') return null
  return role === 'admin' ? null : 'Only the administrator can switch modules on or off.'
}

/** Only the administrator changes how Robi celebrates festivals. */
/** Only the administrator changes the Quotation Sheet settings (formula numbers, lists, texts). */
export function quotationConfigRefusal(role: AuthRole | undefined, method: string): string | null {
  // The rate table is the administrator's only, like the settings (27 Nov 2026, the user's request).
  if (method === 'setFlexoRate') return role === 'admin' ? null : 'Only the administrator can change the rate table.'
  if (method !== 'saveQuotationConfig') return null
  return role === 'admin' ? null : 'Only the administrator can change the Quotation Sheet settings.'
}

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
  /** The RFD sheet, for requests about an RFD line. */
  rfdRows?: RfdRow[]
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
  if (method === 'setRfdMark') {
    const note = String((args[0] as { note?: string } | undefined)?.note ?? '').trim()
    if (note.length < MIN_REASON) return `Give a reason (at least ${MIN_REASON} characters).`
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
  const r = (args[0] ?? {}) as { entityType?: string; entityId?: string; requestedBy?: string; reason?: string; kind?: string; rfdLineId?: string }
  if (String(r.reason ?? '').trim().length < MIN_REASON) return `Give a reason (at least ${MIN_REASON} characters).`
  if (role === 'admin' || role === 'team_leader') return null
  if (r.requestedBy !== userId) return 'A request can only be sent in your own name.'
  // An RFD line: it must be one of theirs on the sheet (19 Nov 2026).
  if (String(r.kind ?? '').startsWith('rfd_')) {
    const line = (book.rfdRows ?? []).find((l) => l.id === r.rfdLineId)
    if (!line) return 'That Ready for Dispatch line could not be found.'
    if (line.assigned_coordinator_id !== userId) return 'You can only ask about a Ready for Dispatch line assigned to you.'
    return null
  }
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
