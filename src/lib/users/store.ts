/**
 * The roster, as this browser knows it.
 *
 * It used to be the roster itself — accounts and their passwords in
 * localStorage — which meant a user added on one PC did not exist on any
 * other, and anybody could read every password out of their own browser. The
 * accounts now live on the server; this is a cache of what it sent, so a name
 * can be drawn without waiting for a round trip.
 *
 * Nothing here holds a password. Changing the roster goes to the server, and
 * the cache is replaced with whatever it says afterwards.
 */

import type { AuthUser, UserDraftRequest } from '@shared/auth'
import { MIN_PASSWORD_LENGTH } from '@shared/auth'
import { SEED_PROFILES } from '@shared/roster'
import { createAccount, deleteAccount, setAccountPassword, updateAccount } from '@/lib/auth-api'
import { takesTeam } from './roles'

/** A profile as the app uses it. The server never sends password material. */
export type ManagedUser = AuthUser

const STORAGE_KEY = 'crm.roster'

/**
 * Something to draw before the server has answered.
 *
 * Only names and roles, so a page that paints while the session is still being
 * checked does not flash "Unknown" against every account.
 */
const fallback = (): ManagedUser[] =>
  SEED_PROFILES.map((profile) => ({
    ...profile,
    relation_manager_name: profile.relation_manager_name ?? null,
    builtIn: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  }))

function restore(): ManagedUser[] {
  if (typeof localStorage === 'undefined') return fallback()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as ManagedUser[]) : null
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback()
  } catch {
    return fallback()
  }
}

let roster: ManagedUser[] = restore()
const listeners = new Set<() => void>()

function announce(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roster))
  } catch {
    // A full or unavailable storage costs nothing here: the roster is fetched
    // again on the next sign-in.
  }
  for (const listener of listeners) listener()
}

/** Replaces the cache with the roster the server just sent. */
export function hydrateRoster(users: ManagedUser[]): void {
  roster = users
  announce()
}

export function subscribeToUsers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function listUsers(): ManagedUser[] {
  return roster
}

export function findUser(id: string): ManagedUser | undefined {
  return roster.find((user) => user.id === id)
}

/* ===================== The form's own checks ===================== */

export interface UserDraft {
  full_name: string
  username: string
  email: string
  password: string
  role: ManagedUser['role']
  module: ManagedUser['module']
  relation_manager_name?: string | null
  desk?: ManagedUser['desk'] | null
}

export interface DraftOptions {
  /** False on the edit form, where the password is only set if typed. */
  requirePassword?: boolean
  requireTeam?: boolean
  exceptId?: string
}

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,40}$/

/**
 * What the form can catch before asking the server.
 *
 * The server checks all of this again — this exists so a typo is answered
 * beside the field rather than by a round trip.
 */
export function validateDraft(
  draft: UserDraft,
  options: DraftOptions = {}
): Partial<Record<keyof UserDraft, string>> {
  const problems: Partial<Record<keyof UserDraft, string>> = {}
  const { requirePassword = true, requireTeam = true, exceptId } = options

  if (!draft.full_name.trim()) problems.full_name = 'Give the person a name.'

  const username = draft.username.trim().toLowerCase()
  if (!username) problems.username = 'A username is needed to sign in.'
  else if (!USERNAME.test(username)) problems.username = 'Letters, digits, dots, hyphens and underscores.'
  else if (roster.some((u) => u.username.toLowerCase() === username && u.id !== exceptId)) {
    problems.username = 'That username is taken.'
  }

  const email = draft.email.trim()
  if (!email) problems.email = 'An email address is needed.'
  else if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) problems.email = 'That does not look like an email address.'

  if (requirePassword || draft.password) {
    if (draft.password.length < MIN_PASSWORD_LENGTH) {
      problems.password = `At least ${MIN_PASSWORD_LENGTH} characters.`
    }
  }

  if (requireTeam && takesTeam(draft.role) && !draft.module) problems.module = 'A coordinator belongs to a team.'

  return problems
}

/** Why this account cannot be removed, or null when it can. */
export function blockedFromRemoval(id: string, actingUserId?: string): string | null {
  const user = findUser(id)
  if (!user) return 'That account is not there.'
  if (user.id === actingUserId) return 'You cannot remove the account you are signed in with.'
  if (user.builtIn) return 'Accounts the app ships with cannot be removed.'
  return null
}

/* ===================== Changes, which the server makes ===================== */

const toRequest = (draft: UserDraft, withPassword: boolean): UserDraftRequest => ({
  username: draft.username.trim().toLowerCase(),
  email: draft.email.trim().toLowerCase(),
  full_name: draft.full_name.trim(),
  role: draft.role,
  module: takesTeam(draft.role) ? draft.module : null,
  relation_manager_name: draft.relation_manager_name?.trim() || null,
  desk: draft.desk ?? null,
  ...(withPassword && draft.password ? { password: draft.password } : {}),
})

export async function createUser(draft: UserDraft): Promise<ManagedUser> {
  const { user, roster: next } = await createAccount(toRequest(draft, true))
  hydrateRoster(next)
  return user
}

export async function editUser(id: string, draft: UserDraft): Promise<ManagedUser> {
  const { user, roster: next } = await updateAccount(id, toRequest(draft, Boolean(draft.password)))
  hydrateRoster(next)
  return user
}

export async function deleteUser(id: string): Promise<void> {
  const { roster: next } = await deleteAccount(id)
  hydrateRoster(next)
}

/** An administrator setting somebody else's password needs no current one. */
export async function changePassword(
  id: string,
  newPassword: string,
  currentPassword?: string
): Promise<void> {
  await setAccountPassword(id, { newPassword, ...(currentPassword ? { currentPassword } : {}) })
}
