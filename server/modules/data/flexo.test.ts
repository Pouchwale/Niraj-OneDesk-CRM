/** Quotations → Flexo Rate Sheets on the server: who may save which, and the DocEntry the store gives. */

import { describe, expect, it } from 'vitest'

import { flexoRateSheetRefusal, isOperation, mayCall, quotationConfigRefusal } from './operations'
import { demoCompanyStore } from '../../../src/lib/demo-companies'
import { blankFlexoLine, type FlexoRateSheet } from '../../../src/lib/flexo-rate-sheet'

const sheet = (id: string, owner: string | null, o: Partial<FlexoRateSheet> = {}): FlexoRateSheet => ({
  id, docEntry: 0, date: '2026-11-24', remark: '', dieCharge: '', freight: '', paymentTerms: '', status: 'Pending', customer: 'Acme',
  marketingPerson: '', plateCharge: '', proofingCharge: '', gst: '', deliveryLocation: '', lines: [blankFlexoLine('l1')],
  coordinator_id: owner, created_at: '2026-11-24T10:00:00Z', created_by: owner, updated_at: '2026-11-24T10:00:00Z', updated_by: owner, ...o,
})

describe('Flexo Rate Sheet operations', () => {
  it('lets anyone save their own sheet, and only the team delete sheets or set rates', () => {
    expect(isOperation('saveFlexoRateSheet') && isOperation('deleteFlexoRateSheet') && isOperation('setFlexoRate')).toBe(true)
    expect(mayCall('coordinator', 'saveFlexoRateSheet')).toBe(true)
    expect(mayCall('coordinator', 'deleteFlexoRateSheet')).toBe(false)
    expect(mayCall('coordinator', 'setFlexoRate')).toBe(false)
    expect(mayCall('team_leader', 'setFlexoRate')).toBe(true)
    // …but the rate table is the administrator's only (27 Nov 2026).
    expect(quotationConfigRefusal('admin', 'setFlexoRate')).toBeNull()
    expect(quotationConfigRefusal('team_leader', 'setFlexoRate')).toMatch(/administrator/)
    expect(quotationConfigRefusal('coordinator', 'setFlexoRate')).toMatch(/administrator/)
    expect(quotationConfigRefusal('team_leader', 'saveFlexoRateSheet')).toBeNull()
  })

  it('keeps a coordinator to their own sheets', () => {
    const held = [{ id: 's1', coordinator_id: 'coord-2' }]
    expect(flexoRateSheetRefusal('coordinator', 'coord-1', 'saveFlexoRateSheet', [sheet('s2', 'coord-1')], held)).toBeNull()
    expect(flexoRateSheetRefusal('coordinator', 'coord-1', 'saveFlexoRateSheet', [sheet('s2', 'coord-2')], held)).toMatch(/must be your own/)
    // Since 27 Nov 2026 (later the same day): a coordinator updates the saved sheets they made, never someone else's.
    expect(flexoRateSheetRefusal('coordinator', 'coord-1', 'saveFlexoRateSheet', [sheet('s1', 'coord-1')], [{ id: 's1', coordinator_id: 'coord-1' }])).toBeNull()
    expect(flexoRateSheetRefusal('coordinator', 'coord-1', 'saveFlexoRateSheet', [sheet('s1', 'coord-1')], held)).toMatch(/someone else/)
    expect(flexoRateSheetRefusal('coordinator', 'coord-1', 'saveFlexoRateSheet', [sheet('s1', 'coord-2')], [{ id: 's1', coordinator_id: 'coord-1' }])).toMatch(/must be your own/)
    expect(flexoRateSheetRefusal('team_leader', 'admin-1', 'saveFlexoRateSheet', [sheet('s1', 'coord-2')], held)).toBeNull()
  })

  it('numbers new sheets from every sheet and keeps a sheet’s number, owner and start when it is edited', () => {
    const store = demoCompanyStore
    store.flexoRateSheets = []
    store.saveFlexoRateSheet(sheet('a', 'coord-1', { docEntry: 99 }))
    store.saveFlexoRateSheet(sheet('b', 'coord-2'))
    // New sheets carry on from SAP's last DocEntry, 5386 (27 Nov 2026).
    expect(store.getFlexoRateSheets().map((s) => [s.id, s.docEntry])).toEqual([['a', 5387], ['b', 5388]])
    store.saveFlexoRateSheet(sheet('a', 'coord-9', { docEntry: 5, customer: 'Changed', created_at: 'later' }))
    const a = store.getFlexoRateSheets().find((s) => s.id === 'a')!
    expect([a.docEntry, a.coordinator_id, a.customer, a.created_at]).toEqual([5387, 'coord-1', 'Changed', '2026-11-24T10:00:00Z'])
  })

  it('sets and clears a rate by Type', () => {
    const store = demoCompanyStore
    store.flexoRates = []
    store.setFlexoRate('PP White', 30, 'admin-1', '2026-11-24T10:00:00Z')
    store.setFlexoRate('PP White', 32.5, 'admin-1', '2026-11-24T11:00:00Z')
    store.setFlexoRate('Gujarat', 2, 'admin-1', '2026-11-24T11:00:00Z')
    expect(store.getFlexoRates().map((r) => [r.type, r.rate])).toEqual([['PP White', 32.5], ['Gujarat', 2]])
    store.setFlexoRate('Gujarat', null, 'admin-1', '2026-11-24T12:00:00Z')
    expect(store.getFlexoRates().map((r) => r.type)).toEqual(['PP White'])
  })
})
