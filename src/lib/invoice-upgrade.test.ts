import { describe, it, expect, beforeEach } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import { addFollowup } from './followups-api'
import { markNoFollowup, isNoFollowup } from './no-followup'
import { todayISO, addDaysISO } from './utils'
import type { Company } from './types'

/**
 * Upgrading a book that was written before Active Payments held invoices.
 *
 * The records changed shape: one per customer became one per invoice, keyed
 * differently. On the first sync afterwards nothing the old records say matches
 * anything the file says, and the reconciliation's honest reading of that is
 * "gone from the file" — which settled 287 live customer-level records on the
 * real data and left them in the book as paid, beside the 1,011 invoices that
 * had replaced them.
 *
 * They were never gone and were never paid. They are the same debt in its old
 * shape, so they are retired: removed, with the history they carry moved onto
 * the invoice that stands in their place.
 */

const COORD = 'coord-1'

function company(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: 'C0012',
    invoice_no: null,
    name: 'Amul Fed Dairy',
    contact_person: null,
    contact_number: '9000000000',
    email: null,
    payment_terms: 'Net-30',
    total_amount: 100000,
    invoice_date: addDaysISO(todayISO(), -40),
    due_date: addDaysISO(todayISO(), -10),
    status: 'overdue',
    assigned_coordinator_id: COORD,
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/** The old record, and the two invoices that now stand for it. */
function seedUpgrade() {
  const old = demoCompanyStore.upsertCompany(company({ id: 'old-1', total_amount: 300000 }))
  const newer = demoCompanyStore.upsertCompany(
    company({ id: 'inv-b', invoice_no: 'INV-B', total_amount: 100000, due_date: addDaysISO(todayISO(), -5) })
  )
  const oldest = demoCompanyStore.upsertCompany(
    company({ id: 'inv-a', invoice_no: 'INV-A', total_amount: 200000, due_date: addDaysISO(todayISO(), -40) })
  )
  return { old, oldest, newer }
}

beforeEach(() => {
  demoCompanyStore.getAllCompanies().forEach((c) => demoCompanyStore.deleteCompany(c.id))
})

describe('retiring a record the invoice book replaced', () => {
  it('removes it, leaving only the invoices', () => {
    const { old, oldest, newer } = seedUpgrade()
    demoCompanyStore.supersedeCompany(old.id, [oldest.id, newer.id])

    const left = demoCompanyStore.getAllCompanies()
    expect(left.map((c) => c.id).sort()).toEqual(['inv-a', 'inv-b'])
  })

  it('does not settle it — the money is already in the invoices', () => {
    // The failure this replaces: the old record was written down to nil and
    // kept as "paid", so the book carried a settlement that never happened.
    const { old, oldest, newer } = seedUpgrade()
    demoCompanyStore.supersedeCompany(old.id, [oldest.id, newer.id])

    const left = demoCompanyStore.getAllCompanies()
    expect(left.some((c) => c.status === 'paid')).toBe(false)
    expect(left.reduce((sum, c) => sum + (c.total_amount || 0), 0)).toBe(300000)
  })

  it('moves the call history onto the oldest open invoice', async () => {
    const { old, oldest, newer } = seedUpgrade()
    const logged = await addFollowup({
      entity_type: 'company',
      entity_id: old.id,
      coordinator_id: COORD,
      status: 'no_response',
      notes: 'Rang twice, left a message',
      followup_date: todayISO(),
    } as any)

    demoCompanyStore.supersedeCompany(old.id, [oldest.id, newer.id])

    // A coordinator's calls are about the customer; they did not stop being
    // true when the record changed shape.
    const moved = demoCompanyStore.getFollowupsForEntity(oldest.id, 'company')
    expect(moved.some((f) => f.id === logged!.id)).toBe(true)
    expect(demoCompanyStore.getFollowupsForEntity(old.id, 'company')).toHaveLength(0)
  })

  it('carries a decision to set the customer aside onto the invoices', () => {
    // Otherwise a customer somebody took off the chase list would quietly come
    // back, with their balance, the first time the file was synced.
    const { old, oldest, newer } = seedUpgrade()
    demoCompanyStore.updateCompany(old.id, markNoFollowup(COORD, 'Written off'))

    demoCompanyStore.supersedeCompany(old.id, [oldest.id, newer.id])

    const left = demoCompanyStore.getAllCompanies()
    expect(left.every((c) => isNoFollowup(c))).toBe(true)
    expect(left[0].no_followup_note).toBe('Written off')
  })

  it('leaves the record alone when nothing has replaced it', () => {
    // A customer whose invoices are all paid has no replacement record, and
    // their old row really is settled — that is the settlement step's job.
    const old = demoCompanyStore.upsertCompany(company({ id: 'old-1' }))
    demoCompanyStore.supersedeCompany(old.id, [])
    expect(demoCompanyStore.getCompanyById('old-1')).toBeTruthy()
  })

  it('is a no-op the second time, so every later sync is untouched', () => {
    const { old, oldest, newer } = seedUpgrade()
    demoCompanyStore.supersedeCompany(old.id, [oldest.id, newer.id])
    const after = demoCompanyStore.getAllCompanies().length
    demoCompanyStore.supersedeCompany(old.id, [oldest.id, newer.id])
    expect(demoCompanyStore.getAllCompanies()).toHaveLength(after)
  })
})
