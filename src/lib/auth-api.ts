/**
 * Signing in, and the account list, from the server.
 *
 * Every call carries the session cookie (same-origin fetch does that by
 * itself). Nothing here keeps a password: it is typed, sent once, and the
 * server answers with a cookie the browser cannot read or write.
 */

import {
  AUTH_ROUTES,
  authPasswordUrl,
  authUserUrl,
  type AuthUser,
  type PasswordRequest,
  type SessionResponse,
  type UserDraftRequest,
} from '@shared/auth'

export class NotSignedIn extends Error {}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new Error('The server is not answering. It runs on the office machine that holds the CRM.')
  }

  const body = await response.json().catch(() => null)
  const message = (body as { error?: { message?: string } } | null)?.error?.message

  /*
   * A 401 on the login route means the credentials were wrong, and the server's
   * wording says so. Replacing it with "Sign in to continue" would answer
   * somebody who is trying to sign in by telling them to sign in.
   */
  if (response.status === 401) throw new NotSignedIn(message ?? 'Sign in to continue.')
  if (!response.ok) throw new Error(message ?? 'The server refused that.')
  return body as T
}

export const signIn = (username: string, password: string) =>
  call<SessionResponse>(AUTH_ROUTES.login, { method: 'POST', body: JSON.stringify({ username, password }) })

export const signOut = () => call<{ signedOut: boolean }>(AUTH_ROUTES.logout, { method: 'POST' })

/**
 * Whoever this browser is signed in as, or null.
 *
 * The route answers 200 with a null user when nobody is signed in, so a visitor
 * sitting on the login page is not met with a failed request in the console.
 */
export async function currentSession(): Promise<SessionResponse | null> {
  try {
    const session = await call<SessionResponse>(AUTH_ROUTES.me)
    return session.user ? session : null
  } catch (err) {
    if (err instanceof NotSignedIn) return null
    throw err
  }
}

export const createAccount = (draft: UserDraftRequest) =>
  call<{ user: AuthUser; roster: AuthUser[] }>(AUTH_ROUTES.users, { method: 'POST', body: JSON.stringify(draft) })

export const updateAccount = (id: string, draft: UserDraftRequest) =>
  call<{ user: AuthUser; roster: AuthUser[] }>(authUserUrl(id), { method: 'PUT', body: JSON.stringify(draft) })

export const deleteAccount = (id: string) =>
  call<{ roster: AuthUser[] }>(authUserUrl(id), { method: 'DELETE' })

export const setAccountPassword = (id: string, request: PasswordRequest) =>
  call<{ changed: boolean }>(authPasswordUrl(id), { method: 'PUT', body: JSON.stringify(request) })
