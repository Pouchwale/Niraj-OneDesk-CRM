/**
 * Speed work (18 Nov 2026): statuses are worked out once per change or per
 * day, and records are found by id through an index. Neither may ever give a
 * different answer from the slow way.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import type { Company } from './types'

const invoice = (id: string, due: string, amount = 5000): Company =>
  ({
    id, sap_bp_code: `BP-${id}`, name: `Customer ${id}`, invoice_no: id, contact_person: null, contact_number: '',
    email: null, payment_terms: '30 days', total_amount: amount, invoice_date: '2026-01-01', due_date: due,
    status: 'current', assigned_coordinator_id: 'coord-1', module: null, remarks: null, extra_fields: {},
    created_at: '2026-01-01', updated_at: '2026-01-01',
  }) as Company

afterEach(() => vi.useRealTimers())

describe('faster reads give the same answers', () => {
  it('finds records by id after the list is replaced, reordered or grows', () => {
    demoCompanyStore.replaceAll({ companies: [invoice('a', '2026-12-01'), invoice('b', '2026-12-01')] })
    expect(demoCompanyStore.getCompanyById('b')?.name).toBe('Customer b')
    demoCompanyStore.replaceAll({ companies: [invoice('b', '2026-12-01'), invoice('c', '2026-12-01'), invoice('a', '2026-12-01')] })
    expect(demoCompanyStore.getCompanyById('a')?.invoice_no).toBe('a')
    expect(demoCompanyStore.getCompanyById('c')?.invoice_no).toBe('c')
    demoCompanyStore.upsertCompany(invoice('d', '2026-12-01'))
    expect(demoCompanyStore.getCompanyById('d')?.invoice_no).toBe('d')
    demoCompanyStore.deleteCompany('c')
    expect(demoCompanyStore.getCompanyById('c')).toBeUndefined()
    expect(demoCompanyStore.getCompanyById('a')?.invoice_no).toBe('a')
    expect(demoCompanyStore.getCompanyById('nope')).toBeUndefined()
  })

  it('works statuses out again after a change and on a new day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T10:00:00'))
    demoCompanyStore.replaceAll({ companies: [invoice('x', '2026-11-19')] })
    expect(demoCompanyStore.getCompanyById('x')?.status).toBe('upcoming')
    // Two days later the same invoice is past due, with no change made.
    vi.setSystemTime(new Date('2026-11-20T10:00:00'))
    expect(demoCompanyStore.getCompanyById('x')?.status).toBe('overdue')
    // A change to its due date is seen at once.
    demoCompanyStore.upsertCompany({ ...invoice('x', '2026-12-30'), status: 'overdue' })
    expect(demoCompanyStore.getCompanyById('x')?.status).toBe('current')
  })
})
