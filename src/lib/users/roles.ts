import type { UserRole } from '@/lib/types'

/**
 * What each role is called on screen.
 *
 * The stored value is a snake_case key, so it cannot simply be capitalised the
 * way the old two-word-free roles could.
 */
export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrator',
  team_leader: 'Team Leader',
  coordinator: 'Coordinator',
}

/** One line on what the role is for, shown when picking one. */
export const ROLE_BLURB: Record<UserRole, string> = {
  admin: 'Full access to every module, plus user accounts and credentials.',
  team_leader: 'Runs the coordinators: all accounts, uploads, team activity and settings.',
  coordinator: 'Own accounts only, with daily entries and follow-ups.',
}

export const ASSIGNABLE_ROLES: UserRole[] = ['coordinator', 'team_leader', 'admin']

/**
 * Whether the role sees the whole book rather than just its own accounts.
 *
 * The team leader was the admin until the roles were split, so everything she
 * could already reach keys off this rather than off `admin` — otherwise the
 * split would have quietly taken her team away from her.
 */
export function seesAllAccounts(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'team_leader'
}

/** Administration proper: accounts, credentials, role changes. */
export function administersSystem(role: UserRole | undefined): boolean {
  return role === 'admin'
}

/** Only coordinators sit on a team; everyone else is org-wide. */
export function takesTeam(role: UserRole): boolean {
  return role === 'coordinator'
}
