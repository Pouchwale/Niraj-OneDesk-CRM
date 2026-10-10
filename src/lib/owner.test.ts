import { describe, expect, it } from 'vitest'

import { keptOwner } from './demo-companies'
import { OWNER_ALL, OWNER_NOT_IN_CRM, matchesOwner, ownerOf, ownerOptions } from './owner'

const users: Record<string, string> = { 'coord-1': 'Pragati Patel', 'coord-9': 'Vishva Vyas' }
const userName = (id: string) => users[id]

describe('ownerOf', () => {
  it('names a row by its CRM user, then by the file, then as unassigned', () => {
    expect(ownerOf({ assigned_coordinator_id: 'coord-1', coordinator_name: 'Pragati' }, userName)).toEqual({
      key: 'id:coord-1', name: 'Pragati Patel', inCrm: true,
    })
    expect(ownerOf({ assigned_coordinator_id: null, coordinator_name: '  Navya   Rupawat ' }, userName)).toEqual({
      key: 'file:navya rupawat', name: 'Navya Rupawat', inCrm: false,
    })
    expect(ownerOf({ assigned_coordinator_id: null, coordinator_name: '#N/A' }, userName).name).toBe('Unassigned')
    expect(ownerOf({ assigned_coordinator_id: null }, userName).key).toBe('none')
  })

  it('falls back to the file name when the booked user no longer exists', () => {
    expect(ownerOf({ assigned_coordinator_id: 'gone', coordinator_name: 'Bhakti' }, userName)).toMatchObject({
      name: 'Bhakti', inCrm: false,
    })
  })

  it('names a deleted id by the current user the file names exactly', () => {
    const byName = (name: string) => (name.toLowerCase() === 'pragati patel' ? 'coord-1' : undefined)
    expect(ownerOf({ assigned_coordinator_id: 'coord-old', coordinator_name: 'Pragati  Patel' }, userName, byName)).toEqual({
      key: 'id:coord-1', name: 'Pragati Patel', inCrm: true,
    })
    // A name no user has stays the file's.
    expect(ownerOf({ assigned_coordinator_id: null, coordinator_name: 'Bhakti' }, userName, byName).inCrm).toBe(false)
  })
})

describe('ownerOptions and matchesOwner', () => {
  const rows = [
    { assigned_coordinator_id: 'coord-9', coordinator_name: 'Vishwa Vyas', amount: 100.1 },
    { assigned_coordinator_id: null, coordinator_name: 'Bhakti', amount: 200.2 },
    { assigned_coordinator_id: null, coordinator_name: 'BHAKTI', amount: 0.1 },
    { assigned_coordinator_id: null, coordinator_name: 'Chirag', amount: 50 },
  ]

  it('groups by owner with exact counts and amounts, CRM users first', () => {
    const options = ownerOptions(rows, (r) => ownerOf(r, userName), (r) => r.amount)
    expect(options.map((o) => [o.name, o.rows, o.amount, o.inCrm])).toEqual([
      ['Vishva Vyas', 1, 100.1, true],
      ['Bhakti', 2, 200.3, false],
      ['Chirag', 1, 50, false],
    ])
  })

  it('filters by one owner, by everyone not in the CRM, or not at all', () => {
    const owners = rows.map((r) => ownerOf(r, userName))
    expect(owners.filter((o) => matchesOwner(o, 'file:bhakti'))).toHaveLength(2)
    expect(owners.filter((o) => matchesOwner(o, OWNER_NOT_IN_CRM))).toHaveLength(3)
    expect(owners.filter((o) => matchesOwner(o, OWNER_ALL))).toHaveLength(4)
  })
})

describe('keptOwner', () => {
  it('follows the file whenever the file names someone known', () => {
    expect(keptOwner({ assigned_coordinator_id: 'coord-1' }, { assigned_coordinator_id: 'coord-9' })).toBe('coord-9')
  })

  it('keeps a CRM assignment while the file repeats the same unknown name', () => {
    expect(
      keptOwner(
        { assigned_coordinator_id: 'coord-1', coordinator_name: 'Bhakti' },
        { assigned_coordinator_id: null, coordinator_name: 'bhakti ' }
      )
    ).toBe('coord-1')
  })

  it('lets go when the file changes the row to a different unknown name', () => {
    expect(
      keptOwner(
        { assigned_coordinator_id: 'coord-1', coordinator_name: 'Pragati' },
        { assigned_coordinator_id: null, coordinator_name: 'Bhakti' }
      )
    ).toBeNull()
  })
})
