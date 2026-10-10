/**
 * The accounts: who may sign in, and what they may do.
 *
 * On the server's disk rather than in each browser. The roster used to live in
 * localStorage, so a user added on one PC did not exist on any other, and the
 * passwords sat beside it in plain text. Here there is one roster for the
 * office and the file holds only hashes.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIN_PASSWORD_LENGTH, type AuthRole, type AuthUser, type UserDraftRequest } from '../../../shared/auth'
import { SEED_PROFILES } from '../../../shared/roster'
import { hashPassword, verifyPassword } from './hash'
import { FALLBACK_PASSWORD, INITIAL_PASSWORDS } from './seed'

/** An account as the file holds it: everything in AuthUser, plus the hash. */
interface StoredAccount extends AuthUser {
  passwordHash: string
}

export class AccountError extends Error {}

const ROLES: AuthRole[] = ['admin', 'team_leader', 'coordinator']
const USERNAME = /^[a-z0-9][a-z0-9._-]{1,40}$/

export interface AccountStore {
  /** Everyone, without any password material. */
  roster(): AuthUser[]
  find(id: string): AuthUser | null
  /** The account these credentials name, or null. Never says which half was wrong. */
  verify(username: string, password: string): AuthUser | null
  create(draft: UserDraftRequest): AuthUser
  update(id: string, draft: UserDraftRequest): AuthUser
  remove(id: string, actingUserId: string): void
  setPassword(id: string, newPassword: string, options?: { currentPassword?: string }): void
}

const publicView = ({ passwordHash: _hash, ...user }: StoredAccount): AuthUser => user

function cleanText(value: unknown, what: string, max = 120): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new AccountError(`${what} is required.`)
  if (text.length > max) throw new AccountError(`${what} is too long.`)
  return text
}

export function validatePassword(value: unknown): string {
  const password = typeof value === 'string' ? value : ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError(`A password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (password.length > 200) throw new AccountError('That password is too long.')
  return password
}

export function createAccountStore(dir: string, options: { now?: () => Date } = {}): AccountStore {
  const now = options.now ?? (() => new Date())
  const file = join(dir, 'users.json')
  let accounts: StoredAccount[] = load()

  function load(): StoredAccount[] {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as StoredAccount[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // No file yet, or one that cannot be read: seed a fresh roster below.
    }
    return seed()
  }

  /** First run: the accounts the app ships with, their passwords hashed. */
  function seed(): StoredAccount[] {
    const at = now().toISOString()
    const seeded = SEED_PROFILES.map((profile) => ({
      ...profile,
      relation_manager_name: profile.relation_manager_name ?? null,
      builtIn: true,
      created_at: at,
      updated_at: at,
      passwordHash: hashPassword(INITIAL_PASSWORDS[profile.id] ?? FALLBACK_PASSWORD),
    }))
    persist(seeded)
    return seeded
  }

  function persist(next: StoredAccount[]): void {
    mkdirSync(dir, { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8')
    renameSync(temporary, file)
  }

  const save = () => persist(accounts)
  const byId = (id: string) => accounts.find((account) => account.id === id)

  const taken = (field: 'username' | 'email', value: string, exceptId?: string) =>
    accounts.some((a) => a[field].toLowerCase() === value.toLowerCase() && a.id !== exceptId)

  function readDraft(draft: UserDraftRequest, exceptId?: string) {
    const username = cleanText(draft.username, 'A username', 40).toLowerCase()
    if (!USERNAME.test(username)) {
      throw new AccountError('A username may use letters, digits, dots, hyphens and underscores.')
    }
    if (taken('username', username, exceptId)) throw new AccountError(`The username "${username}" is already taken.`)

    // Either one signs a person in, so both have to be unique.
    const email = cleanText(draft.email, 'An email address').toLowerCase()
    if (taken('email', email, exceptId)) throw new AccountError(`${email} is already on another account.`)

    const role = draft.role
    if (!ROLES.includes(role)) throw new AccountError('Choose a role for the account.')
    if (role === 'coordinator' && !draft.module) throw new AccountError('A coordinator belongs to a team.')

    /*
     * A desk decides which daily-entry form somebody fills in, and only the
     * Pouchwale coordinators have one. Carrying a desk over to a promotion or
     * a move to the other team would put them on a form that is not theirs.
     */
    const keepsDesk = role === 'coordinator' && draft.module === 'Pouchwale' && Boolean(draft.desk)

    return {
      username,
      email,
      full_name: cleanText(draft.full_name, 'A full name'),
      role,
      module: role === 'coordinator' ? draft.module : null,
      relation_manager_name: draft.relation_manager_name?.trim() || null,
      ...(keepsDesk ? { desk: draft.desk! } : {}),
    }
  }

  return {
    roster: () => accounts.map(publicView),
    find: (id) => {
      const found = byId(id)
      return found ? publicView(found) : null
    },

    verify(username, password) {
      const login = String(username ?? '').trim().toLowerCase()
      const account = accounts.find(
        (a) => a.username.toLowerCase() === login || a.email.toLowerCase() === login
      )
      /*
       * A missing account still costs a hash, so "no such user" and "wrong
       * password" take the same time and neither can be told apart from
       * outside. The message says the same thing for both, too.
       */
      const hash = account?.passwordHash ?? hashPassword('no such account')
      const ok = verifyPassword(String(password ?? ''), hash)
      return account && ok ? publicView(account) : null
    },

    create(draft) {
      const fields = readDraft(draft)
      const password = validatePassword(draft.password)
      const at = now().toISOString()
      const account: StoredAccount = {
        id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ...fields,
        builtIn: false,
        created_at: at,
        updated_at: at,
        passwordHash: hashPassword(password),
      }
      accounts = [...accounts, account]
      save()
      return publicView(account)
    },

    update(id, draft) {
      const account = byId(id)
      if (!account) throw new AccountError('That account is not there.')
      const fields = readDraft(draft, id)

      // The owner account must stay an administrator, or the next change of
      // mind locks everybody out of user administration for good.
      if (account.id === 'admin-0' && fields.role !== 'admin') {
        throw new AccountError('The system administrator account has to keep the administrator role.')
      }

      Object.assign(account, fields, { updated_at: now().toISOString() })
      // Assign cannot remove: a desk they are no longer entitled to has to go
      // explicitly, or a coordinator moved off Pouchwale keeps its form.
      if (!('desk' in fields)) delete account.desk
      if (draft.password) account.passwordHash = hashPassword(validatePassword(draft.password))
      save()
      return publicView(account)
    },

    remove(id, actingUserId) {
      const account = byId(id)
      if (!account) throw new AccountError('That account is not there.')
      if (account.id === actingUserId) throw new AccountError('You cannot remove the account you are signed in with.')
      /*
       * Only the owner account is kept, for the same reason update() keeps it an
       * administrator. The rest of the shipped roster is the real team, and
       * refusing those left the administrator unable to remove anybody at all.
       * The file is only reseeded when it is empty, so a removal stays removed.
       */
      if (account.id === 'admin-0') throw new AccountError('The system administrator account cannot be removed.')
      accounts = accounts.filter((a) => a.id !== id)
      save()
    },

    setPassword(id, newPassword, options = {}) {
      const account = byId(id)
      if (!account) throw new AccountError('That account is not there.')
      const password = validatePassword(newPassword)
      if (options.currentPassword !== undefined && !verifyPassword(options.currentPassword, account.passwordHash)) {
        throw new AccountError('That is not your current password.')
      }
      account.passwordHash = hashPassword(password)
      account.updated_at = now().toISOString()
      save()
    },
  }
}
