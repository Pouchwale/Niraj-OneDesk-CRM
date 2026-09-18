/**
 * Who is asking, and whether they may.
 *
 * Every route that reads the workbook, the saved days or the assistant now goes
 * through this. Before it, anybody who could reach the port could read the
 * whole book without signing in at all.
 */

import type { NextFunction, Request, Response } from 'express'
import { SESSION_COOKIE, type AuthRole, type AuthUser } from '../../../shared/auth'
import { ApiError } from '../../http/errors'
import type { AccountStore } from './accounts'
import { readCookie, type SessionSigner } from './sessions'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireSession; absent on public routes. */
      user?: AuthUser
    }
  }
}

/** The signed-in account, or null. Never throws: some routes only want to know. */
export function sessionUser(req: Request, accounts: AccountStore, sessions: SessionSigner): AuthUser | null {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  const payload = sessions.verify(token)
  if (!payload) return null
  return accounts.find(payload.sub)
}

export function requireSession(accounts: AccountStore, sessions: SessionSigner) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = sessionUser(req, accounts, sessions)
    if (!user) {
      next(ApiError.unauthorized('Sign in to continue.'))
      return
    }
    req.user = user
    next()
  }
}

/**
 * Roles allowed through. The administrator owns the system and always passes,
 * the same rule the pages themselves use.
 */
export function requireRole(...roles: AuthRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role
    if (!role) {
      next(ApiError.unauthorized('Sign in to continue.'))
      return
    }
    if (role !== 'admin' && !roles.includes(role)) {
      next(ApiError.forbidden('Your account does not have access to that.'))
      return
    }
    next()
  }
}
