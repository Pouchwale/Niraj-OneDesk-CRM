import { describe, expect, it } from 'vitest'
import { customerUpdates, daysFrom, monthFirstDate, pendingUpdates, rfdDateOf, tellFrom, toldRecord, updateKey, updateStatus, type OpenJob } from './open-jobs'

const job = (over: Partial<OpenJob> = {}): OpenJob => ({
  poNo: '92178',
  report: 'bom-pouch-open',
  poDate: '2026-11-18',
  dueDate: '2026-11-25',
  rfdDate: '2026-11-30',
  rfdManual: true,
  customerName: 'Sapiens Labs',
  coordinatorName: 'Pragati Patel',
  coordinatorId: 'c1',
  salesOrderNo: '5001',
  fgCode: 'FG1',
  jobName: 'Pouch 250g',
  detailsFrom: 'api',
  ...over,
})

describe('reading the API dates', () => {
  it('PO Date and Due Date are month first, two-digit years', () => {
    expect(monthFirstDate('11/26/26')).toBe('2026-11-26')
    expect(monthFirstDate('9/10/26')).toBe('2026-09-10')
    expect(monthFirstDate('12/3/26')).toBe('2026-12-03')
    expect(monthFirstDate('13/3/26')).toBeNull()
    expect(monthFirstDate('')).toBeNull()
  })
  it('RFD date is day first; 01/01/1900 is no date; |MANUAL is kept as a flag', () => {
    expect(rfdDateOf('30/11/2026|MANUAL')).toEqual({ date: '2026-11-30', manual: true })
    expect(rfdDateOf('16/09/2026')).toEqual({ date: '2026-09-16', manual: false })
    expect(rfdDateOf('01/01/1900')).toEqual({ date: null, manual: false })
    expect(rfdDateOf('09/09/2026').date).toBe('2026-09-09')
    expect(rfdDateOf('31/02/2026').date).toBeNull()
  })
})

describe('the rule', () => {
  it('RFD after Due is a delay by that many days, before is early, the same day on time', () => {
    expect(updateStatus(job())).toEqual({ status: 'Delay', days: 5 })
    expect(updateStatus(job({ rfdDate: '2026-11-20' }))).toEqual({ status: 'Early', days: 5 })
    expect(updateStatus(job({ rfdDate: '2026-11-25' }))).toEqual({ status: 'On Time', days: 0 })
    expect(updateStatus(job({ rfdDate: null }))).toBeNull()
  })
  it('the customer is told from 3 days before the Due Date', () => {
    expect(tellFrom('2026-12-10')).toBe('2026-12-07')
    expect(tellFrom('2026-03-02')).toBe('2026-02-27')
    expect(daysFrom('2026-11-25', '2026-11-30')).toBe(5)
    const [u] = customerUpdates([job({ dueDate: '2026-12-10', rfdDate: '2026-12-12' })], [], '2026-12-06')
    expect(u.due).toBe(false)
    expect(customerUpdates([job({ dueDate: '2026-12-10', rfdDate: '2026-12-12' })], [], '2026-12-07')[0].due).toBe(true)
  })
  it('a Service record with this PO and RFD date means told; a new RFD date needs telling again', () => {
    const told = { po_no: ' 92178 ', final_dispatch_date: '2026-11-30', information_date: '2026-11-22' }
    expect(toldRecord(job(), [told])).toBe(told)
    expect(toldRecord(job({ rfdDate: '2026-12-02' }), [told])).toBeNull()
    expect(toldRecord(job(), [{ ...told, information_date: null }])).toBeNull()
    const updates = customerUpdates([job(), job({ poNo: '92029', rfdDate: '2026-11-24' })], [told], '2026-11-27')
    expect(pendingUpdates(updates).map((u) => u.job.poNo)).toEqual(['92029'])
  })
  it('jobs with no RFD date wait; the ones to tell now come first', () => {
    const updates = customerUpdates([job({ poNo: 'A', dueDate: '2026-12-30' }), job({ poNo: 'B', rfdDate: null }), job({ poNo: 'C' })], [], '2026-11-27')
    expect(updates.map((u) => u.job.poNo)).toEqual(['C', 'A'])
    expect(updateKey(updates[0])).toBe('C|2026-11-30')
  })
})
