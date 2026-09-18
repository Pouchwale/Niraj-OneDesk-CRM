/**
 * The one copy of the working dataset, on disk.
 *
 * What matters here is what a deployment depends on: the records survive a
 * restart, two changes made in quick succession both survive, and a damaged
 * file stops the server rather than being quietly replaced by an empty CRM.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDataStore } from './store'
import { demoCompanyStore } from '../../../src/lib/demo-companies'

let dir = ''

const company = (id: string, name: string) =>
  ({
    id,
    name,
    sap_bp_code: `BP-${id}`,
    invoice_no: `INV-${id}`,
    contact_person: 'Someone',
    contact_number: '9000000000',
    email: null,
    payment_terms: '30',
    total_amount: 1000,
    invoice_date: '2026-06-01',
    due_date: '2026-07-01',
    status: 'overdue',
    assigned_coordinator_id: 'coord-1',
    module: 'Pouchwale',
    remarks: null,
    extra_fields: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  }) as Parameters<typeof demoCompanyStore.upsertCompany>[0]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crm-data-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the shared working dataset', () => {
  it('starts empty rather than with the demo fixtures', () => {
    const store = createDataStore(dir)
    expect(store.snapshot().companies).toHaveLength(0)
    expect(store.snapshot().overduePayments).toHaveLength(0)
  })

  it('reports a new revision once a change has actually landed', async () => {
    const store = createDataStore(dir)
    const before = store.version()

    const { version } = await store.apply((s) => s.upsertCompany(company('a1', 'First Ltd')))

    // The store announces changes on a microtask; a version that had not moved
    // would tell every other browser there was nothing to fetch.
    expect(version).toBeGreaterThan(before)
    expect(store.snapshot().companies).toHaveLength(1)
  })

  it('leaves the revision alone when nothing changed', async () => {
    const store = createDataStore(dir)
    await store.apply((s) => s.upsertCompany(company('a1', 'First Ltd')))
    const settled = store.version()

    const { result } = await store.apply((s) => s.getAllCompanies())

    expect(result).toHaveLength(1)
    expect(store.version()).toBe(settled)
  })

  it('keeps both changes when two people work at once', async () => {
    const store = createDataStore(dir)
    await Promise.all([
      store.apply((s) => s.upsertCompany(company('a1', 'Pragati’s customer'))),
      store.apply((s) => s.upsertCompany(company('a2', 'Krina’s customer'))),
    ])

    const names = store.snapshot().companies.map((c) => c.name)
    expect(names).toHaveLength(2)
    expect(names).toContain('Pragati’s customer')
    expect(names).toContain('Krina’s customer')
  })

  it('is still there after a restart', async () => {
    const first = createDataStore(dir)
    await first.apply((s) => s.upsertCompany(company('a1', 'Survives Ltd')))
    first.flush()

    // A new server process, reading the same folder.
    const second = createDataStore(dir)
    expect(second.snapshot().companies.map((c) => c.name)).toEqual(['Survives Ltd'])
  })

  it('writes the file where the operator can back it up', async () => {
    const store = createDataStore(dir)
    await store.apply((s) => s.upsertCompany(company('a1', 'On Disk Ltd')))
    store.flush()

    const onDisk = JSON.parse(readFileSync(store.file, 'utf8'))
    expect(onDisk.companies.map((c: { name: string }) => c.name)).toEqual(['On Disk Ltd'])
  })

  it('refuses to start on a damaged file instead of replacing it', () => {
    writeFileSync(join(dir, 'store.json'), '{ this is not json', 'utf8')
    /*
     * The alternative is worse than a failed start: an empty CRM would be
     * written straight over the only copy of the team's work.
     */
    expect(() => createDataStore(dir)).toThrow(/could not be read/i)
    expect(readFileSync(join(dir, 'store.json'), 'utf8')).toContain('this is not json')
  })
})
