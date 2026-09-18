/**
 * Signing in.
 *
 * Until now the browser decided who you were: the roster and the passwords sat
 * in localStorage, and the session was `{"id":"admin-0"}` in the same place, so
 * anyone who opened the developer tools could be the administrator. A check the
 * person being checked can edit is not a check.
 *
 * So the server owns the accounts, holds only hashed passwords, and issues a
 * signed session cookie. The browser cannot mint one, and every route that
 * matters asks for it.
 */

import { API_PREFIX } from './api'

export const AUTH_ROUTES = {
  login: `${API_PREFIX}/auth/login`,
  logout: `${API_PREFIX}/auth/logout`,
  me: `${API_PREFIX}/auth/me`,
  users: `${API_PREFIX}/auth/users`,
} as const

export const authUserUrl = (id: string) => `${AUTH_ROUTES.users}/${encodeURIComponent(id)}`
export const authPasswordUrl = (id: string) => `${authUserUrl(id)}/password`

/** The cookie the session travels in. httpOnly, so no script can read it. */
export const SESSION_COOKIE = 'crm_session'

export type AuthRole = 'admin' | 'team_leader' | 'coordinator'
export type AuthModule = 'GP3' | 'Pouchwale' | null
export type AuthDesk = 'artworks' | 'orders' | 'updates' | 'dispatch'

/** An account as everyone else may see it: no password, hashed or otherwise. */
export interface AuthUser {
  id: string
  username: string
  email: string
  full_name: string
  role: AuthRole
  module: AuthModule
  relation_manager_name: string | null
  desk?: AuthDesk
  /** Accounts the app ships with cannot be deleted. */
  builtIn: boolean
  created_at: string
  updated_at: string
}

export interface LoginRequest {
  username: string
  password: string
}

/**
 * Whoever is signed in, and the roster they are allowed to see.
 *
 * `user` is null when nobody is: asking "who am I?" and being told "nobody" is
 * an answer, not a failure, so that route says so plainly rather than refusing.
 * Every other route still refuses without a session.
 */
export interface SessionResponse {
  user: AuthUser | null
  roster: AuthUser[]
}

export interface UserDraftRequest {
  username: string
  email: string
  full_name: string
  role: AuthRole
  module: AuthModule
  relation_manager_name?: string | null
  desk?: AuthDesk | null
  /** Required when creating; leave out to keep the current password. */
  password?: string
}

export interface PasswordRequest {
  /** Required when somebody changes their own password. */
  currentPassword?: string
  newPassword: string
}

/** The shortest password the server will accept. */
export const MIN_PASSWORD_LENGTH = 8
