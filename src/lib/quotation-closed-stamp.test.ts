/**
 * Closed or Lost is stamped by the store with the date and time, not taken
 * from the form, and stays while the status does (user, 14 Nov 2026).
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import type { Quotation } from './types'

const quote = (o: Partial<Quotation> = {}): Quotation => ({
  id: 'q-stamp',
  inquiry_date: '2026-11-01',
  coordinator_id: 'coord-1',
  coordinator_name: null,
  customer_name: 'Stamp Test',
  concern_person: null,
  contact_number: null,
  source: 'Label',
  quotation_date: '2026-11-02',
  sales_employee: null,
  quotation_no: 'F-1',
  followups: [],
  earlier_followups: 0,
  closing_date: null,
  status: 'open',
  customer_type: 'new',
  amount: null,
  lost_remark: null,
  created_at: '2026-11-02T05:00:00.000Z',
  created_by: 'coord-1',
  updated_at: '2026-11-02T05:00:00.000Z',
  updated_by: 'coord-1',
  ...o,
})
const held = () => demoCompanyStore.getQuotations().find((q) => q.id === 'q-stamp')!

describe('closing time, recorded by the system', () => {
  beforeEach(() => {
    demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), quotations: [] })
  })

  it('stamps the moment it becomes Closed, ignoring any date sent with it', () => {
    demoCompanyStore.saveQuotation(quote())
    expect(held()).toMatchObject({ closing_date: null, closed_at: null })
    const at = new Date('2026-11-14T09:25:30.000Z')
    demoCompanyStore.saveQuotation(quote({ status: 'closed', amount: 5000, closing_date: '2020-01-01', closed_at: '2020-01-01T00:00:00.000Z' }), at)
    expect(held().closed_at).toBe('2026-11-14T09:25:30.000Z')
    expect(held().closing_date).toBe('2026-11-14')
  })

  it('keeps the stamp while it stays Closed, whatever is sent later', () => {
    demoCompanyStore.saveQuotation(quote({ status: 'closed', amount: 5000 }), new Date('2026-11-14T09:25:30.000Z'))
    demoCompanyStore.saveQuotation(quote({ status: 'closed', amount: 7000, closing_date: '2026-12-31', closed_at: null }), new Date('2026-11-20T10:00:00.000Z'))
    expect(held()).toMatchObject({ amount: 7000, closing_date: '2026-11-14', closed_at: '2026-11-14T09:25:30.000Z' })
  })

  it('stamps Lost the same way, again on a change from Closed to Lost, and clears it back to Open', () => {
    demoCompanyStore.saveQuotation(quote({ status: 'closed', amount: 5000 }), new Date('2026-11-14T09:25:30.000Z'))
    demoCompanyStore.saveQuotation(quote({ status: 'lost', lost_remark: 'Price too high' }), new Date('2026-11-15T06:00:00.000Z'))
    expect(held()).toMatchObject({ status: 'lost', closed_at: '2026-11-15T06:00:00.000Z', closing_date: '2026-11-15' })
    demoCompanyStore.saveQuotation(quote({ status: 'open' }))
    expect(held()).toMatchObject({ closing_date: null, closed_at: null })
  })

  it('leaves an older closed quotation’s closing date as it was', () => {
    demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), quotations: [quote({ status: 'closed', amount: 5000, closing_date: '2026-10-05' })] })
    demoCompanyStore.saveQuotation(quote({ status: 'closed', amount: 5000, closing_date: '2026-10-05', concern_person: 'Updated' }))
    expect(held()).toMatchObject({ closing_date: '2026-10-05', closed_at: null, concern_person: 'Updated' })
  })

  it('uses its own clock when something other than a time is handed in', () => {
    demoCompanyStore.saveQuotation(quote({ status: 'closed', amount: 5000 }), 'not a time')
    expect(Number.isNaN(Date.parse(held().closed_at!))).toBe(false)
  })
})
