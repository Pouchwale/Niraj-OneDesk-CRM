/**
 * Coordinators who work only on Ready for Dispatch (since 15 Oct 2026): they
 * see the RFD page and nothing of Active or Overdue Payments. Avani handles
 * every FGPO (FG-Pouch) line, so that is her whole job in the CRM.
 */

export const RFD_ONLY_USERNAMES: readonly string[] = ['avani']

export function isRfdOnly(user: { role?: string | null; username?: string | null } | null | undefined): boolean {
  return !!user && user.role === 'coordinator' && RFD_ONLY_USERNAMES.includes((user.username ?? '').toLowerCase())
}
