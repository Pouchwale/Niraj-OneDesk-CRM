/**
 * The session: a token the browser carries but cannot write.
 *
 * `<payload>.<signature>`, the signature an HMAC over the payload with a secret
 * only the server has. Anything edited in the browser fails the signature, so
 * the old trick of typing a different user id into localStorage does nothing.
 *
 * The secret comes from the environment where somebody has set one; otherwise
 * the server makes one on first run and keeps it beside the accounts, so
 * restarting does not sign everybody out. Delete that file and every session
 * ends, which is the fastest way to throw everyone out.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SessionPayload {
  /** The account id. */
  sub: string
  /** Issued at, and expires at: epoch milliseconds. */
  iat: number
  exp: number
}

const base64url = (value: Buffer | string): string =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64url = (value: string): Buffer =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/**
 * The signing secret, read from the environment or made once and kept.
 *
 * Never logged, and never sent anywhere: it is the only thing standing between
 * a browser and a session that says whatever it likes.
 */
export function loadSessionSecret(dir: string, fromEnv?: string): string {
  const configured = fromEnv?.trim()
  if (configured) return configured

  const file = join(dir, 'session-secret')
  if (existsSync(file)) {
    const saved = readFileSync(file, 'utf8').trim()
    if (saved) return saved
  }

  const generated = randomBytes(48).toString('base64')
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, generated, 'utf8')
  // Best effort on Windows, where file modes are mostly advisory.
  try {
    chmodSync(file, 0o600)
  } catch {
    /* nothing else to do */
  }
  return generated
}

export interface SessionSigner {
  sign(userId: string, now?: Date): string
  /** The account id the token names, or null if it is not a token we made. */
  verify(token: string | undefined | null, now?: Date): SessionPayload | null
  readonly ttlMs: number
}

export function createSessionSigner(secret: string, ttlHours: number): SessionSigner {
  const ttlMs = Math.round(ttlHours * 3_600_000)

  const signature = (payload: string): Buffer => createHmac('sha256', secret).update(payload).digest()

  return {
    ttlMs,
    sign(userId, now = new Date()) {
      const issued = now.getTime()
      const payload = base64url(JSON.stringify({ sub: userId, iat: issued, exp: issued + ttlMs }))
      return `${payload}.${base64url(signature(payload))}`
    },
    verify(token, now = new Date()) {
      if (!token) return null
      const [payload, provided] = token.split('.')
      if (!payload || !provided) return null

      const expected = signature(payload)
      const given = fromBase64url(provided)
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

      try {
        const parsed = JSON.parse(fromBase64url(payload).toString('utf8')) as SessionPayload
        if (typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') return null
        if (parsed.exp <= now.getTime()) return null
        return parsed
      } catch {
        return null
      }
    },
  }
}

/** The named cookie out of a request's Cookie header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== name) continue
    return decodeURIComponent(part.slice(index + 1).trim())
  }
  return undefined
}
