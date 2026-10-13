import { describe, expect, it } from 'vitest'

import type { AttendanceEntry, Company, DecisionRequest, Followup } from '@/lib/types'
import { buildOverviewReport, rupees, type ReportInput } from './overview-report'

const company = (id: string, extra: Partial<Company> = {}): Company =>
  ({ id, sap_bp_code: `C-${id}`, name: `Customer ${id}`, total_amount: 50000, status: 'critical', assigned_coordinator_id: 'coord-1', ...extra }) as Company

const followup = (id: string, date: string, extra: Partial<Followup> = {}): Followup =>
  ({
    id, entity_type: 'company', entity_id: 'a', coordinator_id: 'coord-1', followup_date: `${date}T10:00:00`, mode: 'call',
    notes: 'Spoke to accounts', customer_response: null, committed_date: null, committed_amount: null, status: 'pending',
    proof_attachment_url: null, next_reminder_date: null, created_at: `${date}T10:00:00.000Z`, edited_at: null, ...extra,
  }) as Followup

const base = (over: Partial<ReportInput> = {}): ReportInput => ({
  from: '2026-10-05',
  to: '2026-10-09',
  today: '2026-10-10',
  coordinators: [{ id: 'coord-1', full_name: 'Pragati Patel' }],
  companies: [company('a')],
  overduePayments: [],
  followups: [],
  plans: [],
  proofRequests: [],
  decisionRequests: [],
  attendance: [],
  nameOf: (id) => (id === 'coord-1' ? 'Pragati Patel' : id === 'admin-1' ? 'Niki Patel' : String(id ?? '')),
  ...over,
})

const table = (r: ReturnType<typeof buildOverviewReport>, title: string) => r.tables.find((t) => t.title.startsWith(title))!

describe('the Overview report', () => {
  it('keeps to the period chosen', () => {
    const report = buildOverviewReport(
      base({
        followups: [
          followup('before', '2026-10-04'),
          followup('first', '2026-10-05', { mode: 'email', committed_date: '2026-10-12', committed_amount: 25000 }),
          followup('last', '2026-10-09'),
          followup('after', '2026-10-10'),
        ],
      })
    )
    expect(table(report, 'Follow-up log').rows).toHaveLength(2)
    // No Robi list those days, so both customers contacted count as extra work.
    expect(table(report, 'Extra work').rows).toHaveLength(2)
    expect(table(report, 'Coordinator summary').rows[0][8]).toBe(2)
    expect(report.kpis.find((k) => k.label === 'Follow-ups logged')?.value).toBe('2')
    expect(report.kpis.find((k) => k.label === 'Payment promises')?.value).toBe('1 (Rs 25,000)')
    const summary = table(report, 'Coordinator summary').rows[0]
    expect(summary.slice(0, 7)).toEqual(['Pragati Patel', 2, 1, 1, 0, 1, 'Rs 25,000'])
  })

  it('lists leave as Leave, never as a score', () => {
    const attendance: AttendanceEntry[] = [{ userId: 'coord-1', date: '2026-10-06', status: 'leave', by: 'admin-1', at: '2026-10-06T03:00:00Z' }]
    const report = buildOverviewReport(base({ attendance }))
    expect(table(report, 'Daily scores').rows).toEqual([['06 Oct 2026', 'Pragati Patel', '-', '-', '-', 'Leave']])
    expect(table(report, 'Attendance').rows).toEqual([['06 Oct 2026', 'Pragati Patel', 'Leave', 'Niki Patel']])
  })

  it('shows approvals and customers set aside in the period, with the reason', () => {
    const decision: DecisionRequest = {
      id: 'd1', kind: 'dispute', entityType: 'company', entityId: 'a', bpCode: 'C-a', name: 'Customer a', amount: 50000,
      reason: 'Material rejected', requestedBy: 'coord-1', requestedAt: '2026-10-07T09:00:00Z', status: 'approved',
      reviewedBy: 'admin-1', reviewedAt: '2026-10-07T10:00:00Z',
    }
    const report = buildOverviewReport(
      base({
        decisionRequests: [decision],
        companies: [company('a', { no_followup_at: '2026-10-07T10:00:00Z', no_followup_by: 'coord-1', no_followup_kind: 'dispute', no_followup_note: 'Material rejected' })],
      })
    )
    expect(table(report, 'Set-aside requests').rows[0]).toEqual(
      expect.arrayContaining(['Pragati Patel', 'Customer a', 'Dispute', 'Rs 50,000', 'Material rejected', 'Approved'])
    )
    expect(table(report, 'Customers set aside').rows[0]).toEqual(['07 Oct 2026', 'Dispute', 'Customer a', 'C-a', 'Rs 50,000', 'Pragati Patel', 'Material rejected'])
  })

  it('writes rupees the PDF fonts can print', () => {
    expect(rupees(1234567)).toBe('Rs 12,34,567')
  })
})
