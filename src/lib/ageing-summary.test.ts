import { describe, expect, it } from 'vitest'

import { activeBucketOf, activeSummary, overdueSummary, summarySheetRows, OVERDUE_SUMMARY_COLUMNS } from './ageing-summary'
import type { Company, OverduePayment } from './types'

const names: Record<string, string> = { 'coord-1': 'Pragati Patel', 'coord-3': 'Devyani Vaghela' }
const nameOf = (id: string | null) => (id ? names[id] ?? id : 'Not in CRM')

const row = (o: Partial<OverduePayment>): OverduePayment =>
  ({
    id: o.bp_code ?? 'x', bp_code: 'C1', customer_name: 'Cust', balance_due: 0, due_0_30: 0, due_31_60: 0, due_61_90: 0,
    due_91_120: 0, due_121_plus: 0, assigned_coordinator_id: 'coord-1', status: 'overdue', extra_fields: {}, ...o,
  }) as OverduePayment

describe('overdueSummary', () => {
  const tables = overdueSummary(
    [
      row({ bp_code: 'C1', balance_due: 100, due_0_30: 60, due_121_plus: 40 }),
      row({ bp_code: 'C2', balance_due: 50, due_31_60: 50, assigned_coordinator_id: 'coord-3' }),
      row({ bp_code: 'C3', balance_due: 30, due_121_plus: 30, no_followup_at: 'x', no_followup_kind: 'dispute' }),
      row({ bp_code: 'C4', balance_due: 20, due_0_30: 20, no_followup_at: 'x', no_followup_kind: 'export' }),
      row({ bp_code: 'C5', balance_due: 10, due_61_90: 10, no_followup_at: 'x', no_followup_kind: null }),
      row({ bp_code: 'C6', balance_due: 5, due_121_plus: 5, status: 'bankrupt' }),
      row({ bp_code: 'C7', balance_due: 0, status: 'settled' }),
      row({ bp_code: 'C8', balance_due: -7, due_31_60: -7, assigned_coordinator_id: null }),
    ],
    nameOf
  )
  const of = (g: string) => tables.find((t) => t.group === g)!

  it('puts each balance in one group, one line per coordinator, unassigned last, settled nowhere', () => {
    expect(of('regular').lines.map((l) => [nameOf(l.ownerId), l.customers, l.balance])).toEqual([
      ['Devyani Vaghela', 1, 50],
      ['Pragati Patel', 1, 100],
      ['Not in CRM', 1, -7],
    ])
    expect(of('regular').total).toMatchObject({ customers: 3, balance: 143, buckets: [60, 43, 0, 0, 40] })
    expect(of('dispute').total).toMatchObject({ customers: 1, balance: 30 })
    expect(of('export').total.buckets[0]).toBe(20)
    expect(of('no_followup').total.buckets[2]).toBe(10)
    expect(of('bankrupt').total.balance).toBe(5)
  })

  it('lays the tables out for Excel like the pivot sheet, skipping empty groups', () => {
    const rows = summarySheetRows(tables, OVERDUE_SUMMARY_COLUMNS, nameOf)
    expect(rows[0]).toEqual(['Regular Customer'])
    expect(rows[1]).toEqual(['Coordinator Name', 'Count of Customers', 'Sum of Balance', 'Sum of 0 - 30', 'Sum of 31 - 60', 'Sum of 61 - 90', 'Sum of 91 - 120', 'Sum of 121+'])
    expect(rows).toContainEqual(['Grand Total', 3, 143, 60, 43, 0, 0, 40])
  })
})

describe('activeSummary', () => {
  const inv = (o: Partial<Company>): Company =>
    ({ id: 'i', sap_bp_code: 'C1', name: 'Cust', total_amount: 0, due_date: '2026-11-06', status: 'overdue', assigned_coordinator_id: 'coord-1', ...o }) as Company

  it('buckets by days past due and counts a customer once', () => {
    expect([undefined, '2026-11-10', '2026-11-06', '2026-10-07', '2026-10-06', '2026-08-08', '2026-07-09', '2026-07-08'].map((d) => activeBucketOf(d, '2026-11-06'))).toEqual([0, 0, 1, 1, 2, 3, 4, 5])
    const [regular] = activeSummary(
      [
        inv({ id: 'a', total_amount: 100, due_date: '2026-11-20' }),
        inv({ id: 'b', total_amount: 50, due_date: '2026-10-01' }),
        inv({ id: 'c', total_amount: 25, status: 'paid' }),
      ],
      '2026-11-06',
      nameOf
    )
    expect(regular.lines).toEqual([{ ownerId: 'coord-1', customers: 1, balance: 150, buckets: [100, 0, 50, 0, 0, 0] }])
  })
})
