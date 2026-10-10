import { describe, expect, it } from 'vitest'

import type { Company, OverduePayment } from './types'
import { autoMapRfdColumns, buildRfdRows, customerKey, scoreRfdSheet } from './rfd-upload'

const HEADERS = [
  'Customer Name', 'Production Order No.', 'PO Status', 'Sales Order No.', 'FG Item Code', 'FG Item Name', 'Item Group',
  'PO Planned Qty', 'RFD Qty', 'UoM', 'SO Rate', 'RFD Value', 'Payment Amount 1', 'Payment Amount 2', 'Pending RFD Value',
  'Warehouse', 'No. of Batches', 'Ready Since', 'Days',
]
const line = (customer: string, pending: number | null, extra: Record<string, unknown> = {}) => ({
  'Customer Name': customer, 'Production Order No.': '65467', 'PO Status': 'Closed', 'Sales Order No.': '25951',
  'FG Item Code': 'FGLA3464', 'FG Item Name': 'Fastmix 5Ltr Front Label', 'Item Group': 'FG-Label', 'PO Planned Qty': 23000,
  'RFD Qty': 1400, UoM: 'PCS', 'SO Rate': 1.87, 'RFD Value': 2618, 'Payment Amount 1': null, 'Payment Amount 2': null,
  'Pending RFD Value': pending, Warehouse: 'FG-01', 'No. of Batches': 1, 'Ready Since': new Date(2025, 1, 3), Days: 613, ...extra,
})

const overdue = { id: 'ovd-1', bp_code: 'C0248', customer_name: 'Sinochem India Company Pvt Ltd', assigned_coordinator_id: 'coord-3', coordinator_name: 'Devyani' } as OverduePayment
const invoice = { id: 'comp-1', sap_bp_code: 'C2001', name: 'KRUNCHKARO FOODS (OPC) PRIVATE LIMITED', total_amount: 5000, assigned_coordinator_id: 'coord-5', coordinator_name: 'Krupa' } as Company

describe('the RFD sheet', () => {
  const mapping = autoMapRfdColumns(HEADERS)

  it('maps every SAP column, telling RFD value from pending RFD value', () => {
    expect(mapping.rfd_value).toBe('RFD Value')
    expect(mapping.pending_value).toBe('Pending RFD Value')
    expect(mapping.paid_1).toBe('Payment Amount 1')
    expect(Object.keys(mapping)).toHaveLength(19)
    expect(scoreRfdSheet(HEADERS)).toBe(6)
    expect(scoreRfdSheet(['BP Code', 'Customer', 'Balance', '0-30'])).toBeLessThan(2)
  })

  it('keeps only lines with money pending, linked to the customer and their coordinator', () => {
    const { rows, unlinked } = buildRfdRows(
      [
        line('Sinochem India Company Pvt Ltd', 2618),
        line('Krunchkaro Foods (OPC) Pvt. Ltd.', 28553.33, { 'Sales Order No.': '30001' }),
        line('Nobody We Know Ltd', 900, { 'Sales Order No.': '30002' }),
        line('Paid Up Ltd', 0),
        line('Overpaid Ltd', -5865.25),
      ],
      mapping,
      [invoice],
      [overdue],
      '2026-10-10T10:00:00.000Z'
    )
    expect(rows.map((r) => r.customer_name)).toEqual(['Sinochem India Company Pvt Ltd', 'Krunchkaro Foods (OPC) Pvt. Ltd.', 'Nobody We Know Ltd'])
    expect(rows[0]).toMatchObject({ bp_code: 'C0248', assigned_coordinator_id: 'coord-3', anchor_type: 'overdue_payment', anchor_id: 'ovd-1', pending_value: 2618, ready_since: '2025-02-03', days: 613 })
    expect(rows[1]).toMatchObject({ bp_code: 'C2001', assigned_coordinator_id: 'coord-5', anchor_type: 'company', anchor_id: 'comp-1' })
    expect(rows[2]).toMatchObject({ bp_code: null, assigned_coordinator_id: null, anchor_id: null })
    expect(unlinked).toEqual(['Nobody We Know Ltd'])
  })

  it('gives repeated lines their own ids', () => {
    const { rows } = buildRfdRows([line('A Ltd', 10), line('A Ltd', 20)], mapping, [], [], 'now')
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })

  it('matches names whatever the case, punctuation or Pvt/Private spelling', () => {
    expect(customerKey('M/s. Krunchkaro Foods (OPC) Private Limited')).toBe(customerKey('KRUNCHKARO FOODS (OPC) PVT LTD'))
  })
})
