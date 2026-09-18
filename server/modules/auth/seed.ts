/**
 * The passwords the accounts start with, on the very first run.
 *
 * These are real people's passwords, so they are NOT in this repository. They
 * are read from `<AUTH_DIR>/initial-passwords.json` — the same folder the
 * hashed accounts live in, which is git-ignored — and an account the file does
 * not mention starts on FALLBACK_PASSWORD rather than being left open.
 *
 * The list is read once. After the first start the accounts file exists and
 * this is never consulted again, so editing it does nothing to a running
 * deployment; change a password in the Admin Panel instead.
 *
 * See `initial-passwords.example.json` for the shape, and DEPLOYMENT.md for
 * how to set it up on a new machine.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Used for an account the list does not mention, so it is never left open. */
export const FALLBACK_PASSWORD = 'Welcome@123'

/** What the file is called, inside the auth directory. */
export const INITIAL_PASSWORDS_FILE = 'initial-passwords.json'

/**
 * The starting passwords, or an empty list when none have been provided.
 *
 * A missing or unreadable file is not an error: every account simply starts on
 * the fallback, which is the safe way to be wrong — nobody is locked out, and
 * nobody gets an account with no password at all.
 */
export function loadInitialPasswords(dir: string): Record<string, string> {
  const file = join(dir, INITIAL_PASSWORDS_FILE)
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [id, password] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof password === 'string' && password.length > 0) out[id] = password
    }
    return out
  } catch {
    return {}
  }
}
