/**
 * Signing in, signing out, and managing accounts.
 *
 * Login is the one route that answers before a session exists, so it is the one
 * that has to be careful: the same answer for a wrong username as for a wrong
 * password, and a limit on how fast they can be guessed.
 */

import { Router, type Request } from 'express'
import {
  SESSION_COOKIE,
  type PasswordRequest,
  type SessionResponse,
  type UserDraftRequest,
} from '../../../shared/auth'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import { AccountError, type AccountStore } from './accounts'
import { requireRole, requireSession, sessionUser } from './middleware'
import type { SessionSigner } from './sessions'

/** Guessing limit: attempts per window, per client and username. */
const MAX_ATTEMPTS = 8
const WINDOW_MS = 10 * 60_000

interface Attempts {
  count: number
  firstAt: number
}

export function authRoutes(accounts: AccountStore, sessions: SessionSigner, logger: Logger): Router {
  const router = Router()
  const attempts = new Map<string, Attempts>()

  const keyOf = (req: Request, username: string) => `${req.ip ?? 'unknown'}|${username.toLowerCase()}`

  /** How long they must wait, or 0 if they may try. */
  const waitFor = (key: string, now: number): number => {
    const record = attempts.get(key)
    if (!record) return 0
    if (now - record.firstAt > WINDOW_MS) {
      attempts.delete(key)
      return 0
    }
    if (record.count < MAX_ATTEMPTS) return 0
    return Math.ceil((record.firstAt + WINDOW_MS - now) / 1000)
  }

  const countFailure = (key: string, now: number) => {
    const record = attempts.get(key)
    if (!record || now - record.firstAt > WINDOW_MS) {
      attempts.set(key, { count: 1, firstAt: now })
      return
    }
    record.count++
  }

  const body = (user: ReturnType<AccountStore['find']>): SessionResponse => ({
    user: user!,
    roster: accounts.roster(),
  })

  router.post('/login', (req, res, next) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    if (!username || !password) {
      next(ApiError.badRequest('Enter your username and password.'))
      return
    }

    const now = Date.now()
    const key = keyOf(req, username)
    const wait = waitFor(key, now)
    if (wait > 0) {
      logger.warn('auth: too many attempts', { username, ip: req.ip })
      next(new ApiError('rate_limited', `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`))
      return
    }

    const user = accounts.verify(username, password)
    if (!user) {
      countFailure(key, now)
      logger.warn('auth: sign-in refused', { username, ip: req.ip })
      // Deliberately the same wording whichever half was wrong.
      next(ApiError.unauthorized('That username and password do not match an account.'))
      return
    }

    attempts.delete(key)
    res.cookie(SESSION_COOKIE, sessions.sign(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: sessions.ttlMs,
    })
    logger.info('auth: signed in', { user: user.id, role: user.role })
    res.json(body(user))
  })

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.json({ signedOut: true })
  })

  router.get('/me', (req, res) => {
    const user = sessionUser(req, accounts, sessions)
    if (!user) {
      // Not a refusal: the login page asks this on every visit, and a 401 there
      // is a red line in the console for something entirely normal.
      res.json({ user: null, roster: [] } satisfies SessionResponse)
      return
    }

    /*
     * A sliding session: someone working all day is not signed out mid-sentence,
     * while a browser left untouched still expires.
     */
    res.cookie(SESSION_COOKIE, sessions.sign(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: sessions.ttlMs,
    })
    res.json(body(user))
  })

  /* ===== Accounts: the administrator's, except a password of one's own ===== */

  const handle = (fn: () => void) => {
    try {
      fn()
    } catch (err) {
      if (err instanceof AccountError) throw ApiError.badRequest(err.message)
      throw err
    }
  }

  router.post('/users', requireSession(accounts, sessions), requireRole(), (req, res, next) => {
    try {
      let created
      handle(() => {
        created = accounts.create(req.body as UserDraftRequest)
      })
      logger.info('auth: account created', { by: req.user!.id })
      res.status(201).json({ user: created, roster: accounts.roster() })
    } catch (err) {
      next(err)
    }
  })

  router.put('/users/:id', requireSession(accounts, sessions), requireRole(), (req, res, next) => {
    try {
      let updated
      handle(() => {
        updated = accounts.update(String(req.params.id), req.body as UserDraftRequest)
      })
      res.json({ user: updated, roster: accounts.roster() })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/users/:id', requireSession(accounts, sessions), requireRole(), (req, res, next) => {
    try {
      handle(() => accounts.remove(String(req.params.id), req.user!.id))
      logger.info('auth: account removed', { id: req.params.id, by: req.user!.id })
      res.json({ roster: accounts.roster() })
    } catch (err) {
      next(err)
    }
  })

  router.put('/users/:id/password', requireSession(accounts, sessions), (req, res, next) => {
    const id = String(req.params.id)
    const me = req.user!
    const { currentPassword, newPassword } = (req.body ?? {}) as PasswordRequest

    // An administrator may set anyone's password. Anybody else may change their
    // own, and only by proving they know the current one.
    if (me.role !== 'admin' && me.id !== id) {
      next(ApiError.forbidden('You can only change your own password.'))
      return
    }
    try {
      handle(() =>
        accounts.setPassword(id, newPassword, me.role === 'admin' && me.id !== id ? {} : { currentPassword: currentPassword ?? '' })
      )
      logger.info('auth: password changed', { id, by: me.id })
      res.json({ changed: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
