import { describe, expect, it } from 'vitest'

import { markNoFollowup, setAsideKindOf, SET_ASIDE_LABEL } from '@/lib/no-followup'
import type { Company, OverduePayment } from '@/lib/types'
import { setAsideTotals } from './SetAsideKpis'

const aside = (kind: 'dispute' | 'export' | null) => markNoFollowup('coord-1', 'reason given', kind)
const invoice = (id: string, bp: string, amount: number, extra: Partial<Company> = {}) =>
  ({ id, sap_bp_code: bp, name: id, total_amount: amount, status: 'critical', ...extra }) as Company
const ageing = (id: string, bp: string, balance: number, extra: Partial<OverduePayment> = {}) =>
  ({ id, bp_code: bp, customer_name: id, balance_due: balance, status: 'critical', ...extra }) as OverduePayment

describe('Export client', () => {
  it('is a set-aside with its own register, like Dispute', () => {
    expect(setAsideKindOf(aside('export'))).toBe('export')
    expect(setAsideKindOf(aside('dispute'))).toBe('dispute')
    expect(setAsideKindOf(aside(null))).toBe('plain')
    expect(SET_ASIDE_LABEL.export).toBe('Export client')
    // Anything else is a plain no follow-up, never stored as an unknown kind.
    expect(markNoFollowup('coord-1', 'x', 'other' as never).no_followup_kind).toBeNull()
  })
})

describe('set-aside amounts on the Dashboard', () => {
  it('counts each customer once: the ageing balance where there is one, otherwise open invoices', () => {
    const companies = [
      invoice('i1', 'C1', 30000, aside('export')), // C1 also has an ageing row: not added again
      invoice('i2', 'C2', 10000, aside('export')),
      invoice('i3', 'C2', 5000, aside('export')),
      invoice('i4', 'C3', 7000, aside('dispute')),
      invoice('i5', 'C4', 9000, { ...aside(null), status: 'paid' }), // paid: owes nothing
      invoice('i6', 'C5', 4000, aside(null)),
    ]
    const overdue = [ageing('o1', 'C1', 80000, aside('export')), ageing('o2', 'C6', 12000, { status: 'bankrupt', bankrupt_declared_at: '2026-10-01T00:00:00Z' } as Partial<OverduePayment>)]
    const t = setAsideTotals(companies, overdue)
    expect(t.export).toEqual({ customers: 2, amount: 95000 })
    expect(t.dispute).toEqual({ customers: 1, amount: 7000 })
    expect(t.plain).toEqual({ customers: 1, amount: 4000 })
    expect(t.bankrupt).toEqual({ customers: 1, amount: 12000 })
  })
})
