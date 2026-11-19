/**
 * A disabled account (19 Nov 2026) leaves the team's lists, Robi and the
 * score tables, but a sheet naming them still matches them, so their
 * customers stay theirs.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { hydrateRoster, listUsers, type ManagedUser } from '@/lib/users/store'
import { blockedFromDisabling } from '@/lib/users/store'
import { getAllCoordinators, getAssignableOwners, getCoordinatorDisplayName, getDisabledIds, getTeamCoordinators } from './AuthContext'

const before = listUsers()
afterEach(() => hydrateRoster(before))

const person = (id: string, full_name: string, role: ManagedUser['role'], disabled = false): ManagedUser => ({
  id, username: id, email: `${id}@x.test`, full_name, role, module: role === 'coordinator' ? 'GP3' : null, relation_manager_name: null,
  builtIn: false, created_at: '2026-01-01', updated_at: '2026-01-01', ...(disabled ? { disabled: true } : {}),
})

describe('disabled accounts', () => {
  it('are left out of the team lists, but still matched and named', () => {
    hydrateRoster([person('c1', 'Asha', 'coordinator'), person('c2', 'Bina', 'coordinator', true), person('tl', 'Lead', 'team_leader')])
    expect(getAllCoordinators().map((c) => c.id)).toEqual(['c1'])
    expect(getTeamCoordinators('GP3').map((c) => c.id)).toEqual(['c1'])
    expect(getAssignableOwners().map((c) => c.id)).toEqual(['c1', 'tl'])
    expect(getAssignableOwners({ includeDisabled: true }).map((c) => c.id)).toEqual(['c1', 'c2', 'tl'])
    expect([...getDisabledIds()]).toEqual(['c2'])
    // Their customers still show under their name.
    expect(getCoordinatorDisplayName('c2')).toBe('Bina')
  })

  it('never the system administrator or yourself', () => {
    expect(blockedFromDisabling('admin-0', 'admin-1')).toMatch(/system administrator/)
    expect(blockedFromDisabling('admin-1', 'admin-1')).toMatch(/signed in/)
    expect(blockedFromDisabling('c1', 'admin-1')).toBeNull()
  })
})
