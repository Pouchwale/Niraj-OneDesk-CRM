/**
 * What a browser is allowed to ask the server to do.
 *
 * The browser no longer changes records itself — it says what it wants done and
 * the server does it. That only helps if the list of things it may ask for is
 * finite and written down, so here it is. Anything not in this table is
 * refused, which means a method added to the store later is unreachable from
 * outside until somebody deliberately lists it and says who may call it.
 *
 * Two levels, matching how the office actually works:
 *
 *   'team'  — the whole book: importing the workbook, retiring rows it no
 *             longer mentions, declaring a customer bankrupt. The team leader
 *             and the administrator.
 *   'own'   — the daily work on an account: logging a call, recording a
 *             promise, updating a record. Anyone signed in.
 *
 * The administrator passes everything, the same rule the pages use.
 */

import type { AuthRole } from '../../../shared/auth'

export type OperationLevel = 'team' | 'own'

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
  declareBankrupt: 'team',
  reinstateOverduePayment: 'team',
  setNoFollowup: 'team',
  clearNoFollowup: 'team',
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
}

/** True when this role may ask for that operation. */
export function mayCall(role: AuthRole | undefined, operation: string): boolean {
  const level = OPERATIONS[operation]
  if (!level || !role) return false
  if (role === 'admin') return true
  if (level === 'own') return true
  return role === 'team_leader'
}

/** True when the store has an operation by this name at all. */
export function isOperation(name: unknown): name is string {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(OPERATIONS, name)
}
