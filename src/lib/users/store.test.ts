/**
 * The roster as the browser holds it.
 *
 * It is a cache now, not the source: the accounts, the passwords and every
 * change to them live on the server (see server/modules/auth). What is left
 * here is what the screens need — who is on the roster, who an account can be
 * booked against — and the checks the form makes before asking the server.
 *
 * The rules those checks mirror are tested against the real thing in
 * server/modules/auth/auth.test.ts; these are about the form answering beside
 * the field instead of after a round trip.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  getAllCoordinators,
  getAssignableOwners,
  getCoordinatorDisplayName,
  getFallbackOwner,
  getRoster,
  getTeamCoordinators,
} from '@/features/auth/AuthContext'
import { SEED_PROFILES } from '@shared/roster'
import { administersSystem, seesAllAccounts } from './roles'
import { blockedFromRemoval, hydrateRoster, listUsers, validateDraft, type ManagedUser, type UserDraft } from './store'

/*
 * The suite runs in Node, where there is no localStorage. The cache is built to
 * work without one — a browser in private mode has none either — so the tests
 * that check what it keeps bring their own.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const kept = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, String(value)),
      removeItem: (key: string) => kept.delete(key),
      clear: () => kept.clear(),
      key: (index: number) => [...kept.keys()][index] ?? null,
      get length() {
        return kept.size
      },
    },
  })
}

const profiles = (): ManagedUser[] =>
  SEED_PROFILES.map((profile) => ({
    ...profile,
    relation_manager_name: profile.relation_manager_name ?? null,
    builtIn: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  }))

const draft = (over: Partial<UserDraft> = {}): UserDraft => ({
  full_name: 'Riya Shah',
  username: 'riya',
  email: 'riya@gp3.com',
  password: 'Riya@1234',
  role: 'coordinator',
  module: 'GP3',
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  hydrateRoster(profiles())
})

describe('who holds which role', () => {
  it('has the operations head as a team leader, not an administrator', () => {
    const niki = listUsers().find((u) => u.id === 'admin-1')!
    expect(niki.role).toBe('team_leader')
    expect(administersSystem(niki.role)).toBe(false)
    expect(seesAllAccounts(niki.role)).toBe(true)
  })

  it('ships exactly one administrator, and it is not a person on the roster', () => {
    const admins = listUsers().filter((u) => u.role === 'admin')
    expect(admins).toHaveLength(1)
    expect(admins[0].id).toBe('admin-0')
    expect(getAllCoordinators().some((c) => c.id === 'admin-0')).toBe(false)
  })

  it('keeps a coordinator out of both', () => {
    const pragati = listUsers().find((u) => u.id === 'coord-1')!
    expect(administersSystem(pragati.role)).toBe(false)
    expect(seesAllAccounts(pragati.role)).toBe(false)
  })

  it('puts each coordinator on her own team', () => {
    expect(getTeamCoordinators('GP3').every((c) => c.module === 'GP3')).toBe(true)
    expect(getTeamCoordinators('Pouchwale').map((c) => c.id)).toContain('coord-9')
  })
})

describe('who accounts can be booked against', () => {
  it('offers the team leader but never the administrator', () => {
    const owners = getAssignableOwners().map((o) => o.id)
    expect(owners).toContain('admin-1')
    expect(owners).not.toContain('admin-0')
  })

  it('puts coordinators ahead of the leader so an equal match goes to the team', () => {
    const owners = getAssignableOwners()
    expect(owners.at(-1)?.id).toBe('admin-1')
    expect(owners[0].role).toBe('coordinator')
  })

  it('still parks unattributable rows with the team leader', () => {
    expect(getFallbackOwner()?.id).toBe('admin-1')
  })

  it('names somebody it knows, and says so about somebody it does not', () => {
    expect(getCoordinatorDisplayName('coord-1')).toBe('Pragati Patel')
    expect(getCoordinatorDisplayName('nobody')).toBe('Unknown')
  })
})

describe('the cache', () => {
  it('is replaced by whatever the server last sent', () => {
    hydrateRoster([
      { ...profiles()[0], id: 'only-one', full_name: 'Only One', username: 'only' },
    ])
    expect(listUsers()).toHaveLength(1)
    expect(getCoordinatorDisplayName('only-one')).toBe('Only One')
  })

  it('survives a reload, so a name is drawn before the server answers', () => {
    hydrateRoster(profiles())
    expect(JSON.parse(localStorage.getItem('crm.roster')!)).toHaveLength(SEED_PROFILES.length)
  })

  it('holds no password material at all', () => {
    expect(JSON.stringify(listUsers())).not.toMatch(/password/i)
  })
})

describe('what the form catches before asking the server', () => {
  it('accepts a sound draft', () => {
    expect(validateDraft(draft())).toEqual({})
  })

  it('refuses a username already in use, whatever its case', () => {
    expect(validateDraft(draft({ username: 'NIKI' })).username).toBeTruthy()
  })

  it('lets an account keep its own username while being edited', () => {
    expect(validateDraft(draft({ username: 'niki' }), { exceptId: 'admin-1' }).username).toBeUndefined()
  })

  it('rejects a username with a space or a symbol in it', () => {
    expect(validateDraft(draft({ username: 'riya shah' })).username).toBeTruthy()
    expect(validateDraft(draft({ username: 'riya!' })).username).toBeTruthy()
  })

  it('refuses something that is not an email address', () => {
    expect(validateDraft(draft({ email: 'riya' })).email).toBeTruthy()
  })

  it('refuses a password too short to be worth having', () => {
    expect(validateDraft(draft({ password: 'short' })).password).toBeTruthy()
  })

  it('asks for a password when creating, and lets it be blank when editing', () => {
    expect(validateDraft(draft({ password: '' })).password).toBeTruthy()
    expect(validateDraft(draft({ password: '' }), { requirePassword: false }).password).toBeUndefined()
  })

  it('refuses a coordinator with no team, but not a leader', () => {
    expect(validateDraft(draft({ module: null })).module).toBeTruthy()
    expect(validateDraft(draft({ role: 'team_leader', module: null })).module).toBeUndefined()
  })
})

describe('what may be removed', () => {
  it('refuses the account doing the removing', () => {
    expect(blockedFromRemoval('admin-0', 'admin-0')).toBeTruthy()
  })

  it('refuses an account the app ships with, which would leave nobody a way in', () => {
    expect(blockedFromRemoval('admin-0', 'admin-1')).toBeTruthy()
    expect(blockedFromRemoval('coord-1', 'admin-0')).toBeTruthy()
  })

  it('allows one added later', () => {
    hydrateRoster([
      ...profiles(),
      { id: 'added', username: 'added', email: 'added@gp3.com', full_name: 'Added Person', role: 'coordinator', module: 'GP3', relation_manager_name: null, builtIn: false, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    expect(blockedFromRemoval('added', 'admin-0')).toBeNull()
  })

  it('says so plainly about an account that is not there', () => {
    expect(blockedFromRemoval('ghost', 'admin-0')).toBeTruthy()
  })
})

describe('the roster helper the rest of the app reads', () => {
  it('is the same list', () => {
    expect(getRoster()).toEqual(listUsers())
  })
})
