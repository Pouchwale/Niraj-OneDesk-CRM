/**
 * Passwords, sessions and accounts.
 *
 * The point of all three is that the browser cannot talk its way in: a password
 * that is not stored in readable form, a session it cannot forge, and an
 * account file that keeps the owner account reachable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SEED_PROFILES } from '../../../shared/roster'
import { AccountError, createAccountStore } from './accounts'
import { FALLBACK_PASSWORD, INITIAL_PASSWORDS_FILE } from './seed'
import { hashPassword, verifyPassword } from './hash'
import { createSessionSigner, loadSessionSecret, readCookie } from './sessions'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crm-auth-'))
  /*
   * The starting passwords are not in the repository - they are read from the
   * auth folder on the very first start - so a test that expects somebody to
   * sign in has to provide them, exactly as a new machine would.
   */
  writeFileSync(
    join(dir, INITIAL_PASSWORDS_FILE),
    JSON.stringify({ 'admin-1': 'Leader@Test1', 'coord-1': 'Coord@Test1' }),
    'utf8'
  )
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('storing a password', () => {
  it('never keeps the password itself', () => {
    const stored = hashPassword('Coord@Test1')
    expect(stored).not.toContain('Coord@Test1')
    expect(stored.startsWith('scrypt$')).toBe(true)
  })

  it('accepts the right password and refuses the rest', () => {
    const stored = hashPassword('Coord@Test1')
    expect(verifyPassword('Coord@Test1', stored)).toBe(true)
    expect(verifyPassword('coord@test1', stored)).toBe(false)
    expect(verifyPassword('', stored)).toBe(false)
    expect(verifyPassword('Coord@Test14', stored)).toBe(false)
  })

  it('gives two people with the same password different stored values', () => {
    expect(hashPassword('Same@12345')).not.toBe(hashPassword('Same@12345'))
  })

  it('reads a corrupt stored value as a wrong password rather than crashing', () => {
    expect(verifyPassword('anything', 'not-a-hash')).toBe(false)
    expect(verifyPassword('anything', 'scrypt$$$$')).toBe(false)
  })
})

describe('the session token', () => {
  const secret = 'test-secret'

  it('says who it is for, and survives nothing being changed', () => {
    const sessions = createSessionSigner(secret, 12)
    const token = sessions.sign('coord-1')
    expect(sessions.verify(token)?.sub).toBe('coord-1')
  })

  it('refuses a token whose payload was edited', () => {
    // The old trick: change the user id and reload.
    const sessions = createSessionSigner(secret, 12)
    const [, signature] = sessions.sign('coord-1').split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'admin-0', iat: Date.now(), exp: Date.now() + 1000 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(sessions.verify(`${forged}.${signature}`)).toBeNull()
  })

  it('refuses a token signed with another secret', () => {
    const token = createSessionSigner('another-secret', 12).sign('admin-0')
    expect(createSessionSigner(secret, 12).verify(token)).toBeNull()
  })

  it('refuses nonsense and nothing at all', () => {
    const sessions = createSessionSigner(secret, 12)
    expect(sessions.verify(undefined)).toBeNull()
    expect(sessions.verify('')).toBeNull()
    expect(sessions.verify('abc')).toBeNull()
  })

  it('expires', () => {
    const sessions = createSessionSigner(secret, 12)
    const issued = new Date(2026, 8, 12, 9, 0)
    const token = sessions.sign('coord-1', issued)
    expect(sessions.verify(token, new Date(2026, 8, 12, 20, 59))?.sub).toBe('coord-1')
    expect(sessions.verify(token, new Date(2026, 8, 12, 21, 1))).toBeNull()
  })

  it('keeps one secret across restarts, so a restart is not a mass sign-out', () => {
    const first = loadSessionSecret(dir)
    expect(loadSessionSecret(dir)).toBe(first)
    // An operator's own secret wins over the generated one.
    expect(loadSessionSecret(dir, 'from-the-environment')).toBe('from-the-environment')
  })

  it('reads its cookie out of a header with several', () => {
    expect(readCookie('a=1; crm_session=abc.def; b=2', 'crm_session')).toBe('abc.def')
    expect(readCookie('a=1', 'crm_session')).toBeUndefined()
    expect(readCookie(undefined, 'crm_session')).toBeUndefined()
  })
})

describe('the accounts', () => {
  it('starts from the roster the app ships with, taking the passwords from the auth folder', () => {
    const accounts = createAccountStore(dir)
    expect(accounts.roster()).toHaveLength(SEED_PROFILES.length)
    expect(accounts.verify('niki', 'Leader@Test1')?.role).toBe('team_leader')
    expect(accounts.verify('pragati', 'Coord@Test1')?.id).toBe('coord-1')
  })

  /*
   * Nobody's password is in this repository. The list is read from the auth
   * folder, which is git-ignored, and what matters when it is missing is that
   * every account still gets *a* password: an account with none would be an
   * open door, and this ran on a machine the whole office can reach.
   */
  it('gives every account the fallback when no list has been provided', () => {
    const bare = mkdtempSync(join(tmpdir(), 'crm-auth-bare-'))
    try {
      const accounts = createAccountStore(bare)
      expect(accounts.roster()).toHaveLength(SEED_PROFILES.length)
      expect(accounts.verify('niki', FALLBACK_PASSWORD)?.role).toBe('team_leader')
      // And emphatically not open, nor still on the password it used to ship with.
      expect(accounts.verify('niki', '')).toBeNull()
      expect(accounts.verify('niki', 'Leader@Test1')).toBeNull()
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('carries nobody’s password in the source that gets committed', () => {
    /*
     * The guard on the mistake this replaces: the starting passwords for the
     * whole team used to sit in seed.ts, a tracked file, and would have gone
     * to the remote with the first push.
     *
     * Checked by shape rather than by listing the real ones, because naming
     * them here would put them back in the repository it is guarding.
     */
    const source = readFileSync(join(import.meta.dirname, 'seed.ts'), 'utf8')
    expect(source).not.toMatch(/['"](?:admin|coord|acct)-\d+['"]\s*:/)
  })

  it('lets somebody sign in with their email as well as their username', () => {
    const accounts = createAccountStore(dir)
    expect(accounts.verify('pragati@gp3.com', 'Coord@Test1')?.id).toBe('coord-1')
  })

  it('refuses the wrong password, and an account that does not exist', () => {
    const accounts = createAccountStore(dir)
    expect(accounts.verify('niki', 'wrong')).toBeNull()
    expect(accounts.verify('nobody', 'Leader@Test1')).toBeNull()
  })

  it('writes no password to the file, and hands none out', () => {
    const accounts = createAccountStore(dir)
    const file = readFileSync(join(dir, 'users.json'), 'utf8')
    expect(file).not.toContain('Leader@Test1')
    expect(JSON.stringify(accounts.roster())).not.toContain('passwordHash')
  })

  it('keeps the same hashes across a restart', () => {
    const first = createAccountStore(dir)
    first.setPassword('coord-1', 'Changed@123')
    const second = createAccountStore(dir)
    expect(second.verify('pragati', 'Changed@123')?.id).toBe('coord-1')
    expect(second.verify('pragati', 'Coord@Test1')).toBeNull()
  })

  it('adds an account that can then sign in', () => {
    const accounts = createAccountStore(dir)
    const created = accounts.create({
      username: 'newbie',
      email: 'newbie@gp3.com',
      full_name: 'New Bie',
      role: 'coordinator',
      module: 'GP3',
      password: 'Newbie@123',
    })
    expect(accounts.verify('newbie', 'Newbie@123')?.id).toBe(created.id)
  })

  it('refuses a username that is taken, a short password, and a coordinator with no team', () => {
    const accounts = createAccountStore(dir)
    const draft = { username: 'niki', email: 'x@gp3.com', full_name: 'X', role: 'coordinator' as const, module: 'GP3' as const, password: 'Xxxx@1234' }
    expect(() => accounts.create(draft)).toThrow(AccountError)
    expect(() => accounts.create({ ...draft, username: 'fine', password: 'short' })).toThrow(AccountError)
    expect(() => accounts.create({ ...draft, username: 'fine2', module: null })).toThrow(AccountError)
  })

  it('refuses an email already on another account, whatever its case', () => {
    // Either one signs a person in, so a duplicate would make "who is this?"
    // ambiguous at the moment it matters most.
    const accounts = createAccountStore(dir)
    expect(() =>
      accounts.create({ username: 'other', email: 'NIKI@gp3.com', full_name: 'Other', role: 'coordinator', module: 'GP3', password: 'Other@123' })
    ).toThrow(AccountError)
  })

  it('keeps a desk only on a Pouchwale coordinator', () => {
    const accounts = createAccountStore(dir)
    const gp3 = accounts.create({
      username: 'deskless', email: 'deskless@gp3.com', full_name: 'Desk Less',
      role: 'coordinator', module: 'GP3', desk: 'orders', password: 'Desk@1234',
    })
    expect(gp3.desk).toBeUndefined()

    // And it is dropped when she leaves the team that has desks.
    const moved = accounts.update('coord-9', {
      username: 'vishva', email: 'vishva@gp3.com', full_name: 'Vishva Vyas',
      role: 'coordinator', module: 'GP3', desk: 'artworks',
    })
    expect(moved.desk).toBeUndefined()
  })

  it('will not remove a shipped account or the one being used', () => {
    const accounts = createAccountStore(dir)
    expect(() => accounts.remove('coord-1', 'admin-0')).toThrow(AccountError)
    const added = accounts.create({ username: 'temp', email: 't@gp3.com', full_name: 'Temp', role: 'coordinator', module: 'GP3', password: 'Temp@1234' })
    expect(() => accounts.remove(added.id, added.id)).toThrow(AccountError)
    accounts.remove(added.id, 'admin-0')
    expect(accounts.find(added.id)).toBeNull()
  })

  it('keeps the owner account an administrator', () => {
    // Otherwise one careless edit locks everybody out of user administration.
    const accounts = createAccountStore(dir)
    expect(() =>
      accounts.update('admin-0', { username: 'admin', email: 'admin@gp3.com', full_name: 'System Administrator', role: 'coordinator', module: 'GP3' })
    ).toThrow(AccountError)
  })

  it('asks for the current password when somebody changes their own', () => {
    const accounts = createAccountStore(dir)
    expect(() => accounts.setPassword('coord-1', 'Brand@New1', { currentPassword: 'wrong' })).toThrow(AccountError)
    accounts.setPassword('coord-1', 'Brand@New1', { currentPassword: 'Coord@Test1' })
    expect(accounts.verify('pragati', 'Brand@New1')?.id).toBe('coord-1')
  })
})
