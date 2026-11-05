import { beforeEach, describe, expect, it } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import { serviceDateDiff, serviceRecordsFromSheet, serviceRowScore, serviceScores } from './service-records'
import type { ServiceCustomerTarget, ServiceRecord } from './types'

function record(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: 's-1',
    date: '2026-05-10',
    coordinator_id: 'coord-3',
    coordinator_name: null,
    po_no: null,
    fg_code: null,
    sales_order_no: '30696',
    customer_name: 'Aculife Healthcare',
    dispatch_status: 'Early',
    information_date: '2026-05-10',
    original_dispatch_date: '2026-05-13',
    final_dispatch_date: null,
    remark: null,
    created_at: '2026-05-10T10:00:00Z',
    created_by: 'coord-3',
    updated_at: '2026-05-10T10:00:00Z',
    updated_by: 'coord-3',
    ...overrides,
  }
}

const target = (coordinatorId: string, customers: number): ServiceCustomerTarget => ({ coordinatorId, customers, updatedAt: '', updatedBy: null })

describe('a service row', () => {
  it('scores 10 with an information date and 0 without, as the sheet does', () => {
    expect(serviceRowScore(record())).toBe(10)
    expect(serviceRowScore(record({ information_date: null }))).toBe(0)
  })

  it('works out Date Diff as original SO dispatch date minus information date', () => {
    expect(serviceDateDiff(record())).toBe(3)
    expect(serviceDateDiff(record({ original_dispatch_date: '2026-05-08' }))).toBe(-2)
    expect(serviceDateDiff(record({ original_dispatch_date: null }))).toBeNull()
  })
})

describe('serviceScores', () => {
  it('matches the sheet: 102 mails, one without an information date, 102 customers -> 99.02', () => {
    const rows = Array.from({ length: 102 }, (_, i) => record({ id: `p${i}`, coordinator_id: 'coord-1', information_date: i === 0 ? null : '2026-05-10' }))
    const [pragati] = serviceScores(rows, [target('coord-1', 102)], ['coord-1'], '2026-05-01', '2026-05-31')
    expect(pragati).toMatchObject({ mails: 102, mailRatio: 1, sumOfScore: 1010 })
    expect(pragati.finalScore).toBeCloseTo(99.0196, 3)
  })

  it('caps the final score at 100, counts only the period, and shows no score without a customer count', () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => record({ id: `f${i}`, coordinator_id: 'coord-4' })),
      record({ id: 'old', coordinator_id: 'coord-4', date: '2026-04-30' }),
      record({ id: 'k', coordinator_id: 'coord-5' }),
    ]
    const scores = serviceScores(rows, [target('coord-4', 22)], ['coord-4', 'coord-5'], '2026-05-01', '2026-05-31')
    const foram = scores.find((s) => s.coordinatorId === 'coord-4')!
    const krupa = scores.find((s) => s.coordinatorId === 'coord-5')!
    expect(foram.mails).toBe(30)
    expect(foram.mailRatio).toBeCloseTo(30 / 22)
    expect(foram.finalScore).toBe(100)
    expect(krupa).toMatchObject({ mails: 1, totalCustomers: null, mailRatio: null, finalScore: null })
  })
})

describe('the old SERVICE sheet', () => {
  const people = [
    { id: 'coord-6', full_name: 'Aniketa Jadav' },
    { id: 'coord-1', full_name: 'Pragati Patel' },
  ]
  const row = (date: unknown, extra: Record<string, unknown> = {}) => ({
    Date: date,
    'Coordinator Name': 'Aniketa ',
    'Sales Order No': 30696,
    'Customer Name': 'Gulab',
    'Dispatch Status': 'Early',
    'Information Date': date,
    'Original SO Dispatch Date': 46065,
    ...extra,
  })

  it('matches names, keeps a far-ahead dispatch date as written, and leaves out rows with no date at all', () => {
    const { records, skipped } = serviceRecordsFromSheet(
      [
        row(46062),
        row(46062, { 'Original SO Dispatch Date': 46213 }),
        row('04/13 /2026', { 'Coordinator Name': 'Pragati Patel', 'Customer Name': '' }),
        row('', { 'Information Date': '' }),
      ],
      people,
      '2026-11-05T00:00:00Z',
      '2026-11-05'
    )
    expect(skipped).toBe(1)
    expect(records.map((r) => [r.date, r.coordinator_id, r.customer_name])).toEqual([
      ['2026-02-09', 'coord-6', 'Gulab'],
      ['2026-02-09', 'coord-6', 'Gulab'],
      ['2026-04-13', 'coord-1', '-'],
    ])
    expect(records[0].original_dispatch_date).toBe('2026-02-12')
    // 10 Jul is far from 9 Feb, but so is the other reading (7 Oct): kept as written.
    expect(records[1].original_dispatch_date).toBe('2026-07-10')
  })
})

describe('saving a service record', () => {
  beforeEach(() => {
    demoCompanyStore.serviceRecords = []
    demoCompanyStore.serviceTargets = []
  })

  it('keeps who first entered it, and sets or clears a customer count', () => {
    demoCompanyStore.saveServiceRecord(record({ id: 'a' }))
    demoCompanyStore.saveServiceRecord(record({ id: 'a', remark: 'Edited', created_by: 'someone-else' }))
    expect(demoCompanyStore.getServiceRecords()).toEqual([expect.objectContaining({ id: 'a', remark: 'Edited', created_by: 'coord-3' })])

    demoCompanyStore.setServiceCustomers('coord-3', 85, 'admin-1', 'now')
    demoCompanyStore.setServiceCustomers('coord-3', 90, 'admin-1', 'later')
    expect(demoCompanyStore.serviceTargets).toEqual([{ coordinatorId: 'coord-3', customers: 90, updatedAt: 'later', updatedBy: 'admin-1' }])
    demoCompanyStore.setServiceCustomers('coord-3', null, 'admin-1', 'later')
    expect(demoCompanyStore.serviceTargets).toEqual([])
  })
})
