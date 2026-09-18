/**
 * Storing a password so that reading the file does not hand it over.
 *
 * scrypt, from Node's own crypto — no dependency to install on an office PC and
 * no native build to go wrong. Each password gets its own salt, so two people
 * who choose the same password do not look the same in the file, and the stored
 * form carries the parameters it was made with, so they can be raised later
 * without invalidating anybody's password.
 *
 * Comparison is timing-safe: a check that returns faster for a nearly-right
 * answer tells an attacker which part was nearly right.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Cost parameters. N is the work factor: 2^14, Node's own default, around
 * 50ms here — slow enough that guessing a password is hopeless, quick enough
 * that signing in feels instant and the tests are not a coffee break.
 */
const N = 16_384
const r = 8
const p = 1
const KEY_LENGTH = 32

export function hashPassword(plain: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(plain.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: 96 * 1024 * 1024 })
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$')
}

/**
 * True when the password matches. Never throws on a malformed stored value —
 * a corrupt line in the file must read as "wrong password", not as a crash
 * that takes the login route down.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [scheme, nRaw, rRaw, pRaw, saltRaw, keyRaw] = stored.split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltRaw, 'base64')
    const expected = Buffer.from(keyRaw, 'base64')
    if (salt.length === 0 || expected.length === 0) return false

    const actual = scryptSync(plain.normalize('NFKC'), salt, expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem: 96 * 1024 * 1024,
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
