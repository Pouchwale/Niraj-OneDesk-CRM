/**
 * The working dataset has to run on the server now, not only in a browser.
 *
 * Every screen's behaviour — how an invoice is matched on re-import, how a
 * bankruptcy carries to a customer's other invoices, what the sync retires —
 * lives in that one class and is covered by the suite around it. Moving the
 * data to the server meant running that same class here rather than writing a
 * second, subtly different copy of it.
 *
 * So this guards the one thing that would break it: a browser-only import
 * creeping back into its dependency chain. It fails at import time, loudly,
 * rather than at half past nine on the morning of a deploy.
 */

import { describe, expect, it } from 'vitest'

describe('the working dataset, outside a browser', () => {
  it('loads in Node with no window, document or localStorage', async () => {
    expect(typeof (globalThis as Record<string, unknown>).window).toBe('undefined')
    expect(typeof (globalThis as Record<string, unknown>).document).toBe('undefined')

    // Importing must not throw, and must not need storage to exist.
    const module = await import('../../../src/lib/demo-companies')
    expect(typeof module.demoCompanyStore).toBe('object')
    expect(typeof module.demoCompanyStore.getAllCompanies).toBe('function')
  })

  it('reads and writes records without storage behind it', async () => {
    const { demoCompanyStore } = await import('../../../src/lib/demo-companies')

    const before = demoCompanyStore.getAllCompanies().length
    demoCompanyStore.upsertCompany({
      id: 'server-side-1',
      name: 'Runs On The Server Ltd',
      sap_bp_code: 'BP-SERVER-1',
      invoice_no: 'INV-SERVER-1',
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
    } as Parameters<typeof demoCompanyStore.upsertCompany>[0])

    expect(demoCompanyStore.getAllCompanies().length).toBe(before + 1)
    expect(demoCompanyStore.getCompanyById('server-side-1')?.name).toBe('Runs On The Server Ltd')
  })
})
