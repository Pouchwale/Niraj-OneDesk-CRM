import { describe, expect, it } from 'vitest'

import {
  matchesQuotationFilter,
  monthlyPerformance,
  NO_QUOTATION_FILTER,
  performanceByPerson,
  performanceOf,
} from './quotation-stats'
import type { Quotation } from './types'

function quote(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'q',
    inquiry_date: '2026-10-01',
    coordinator_id: 'coord-1',
    coordinator_name: null,
    customer_name: 'Balaji Print Pack',
    concern_person: null,
    contact_number: null,
    source: 'Label',
    quotation_date: '2026-10-02',
    sales_employee: null,
    quotation_no: 'F-1',
    followups: [],
    earlier_followups: 0,
    closing_date: null,
    status: 'open',
    customer_type: 'existing',
    amount: null,
    lost_remark: null,
    created_at: '2026-10-02T10:00:00Z',
    created_by: null,
    updated_at: '2026-10-02T10:00:00Z',
    updated_by: null,
    ...overrides,
  }
}

describe('matchesQuotationFilter', () => {
  it('lets everything through with no filter', () => {
    expect(matchesQuotationFilter(quote(), NO_QUOTATION_FILTER)).toBe(true)
  })

  it('reads the range on the quotation date, both ends included', () => {
    const f = { ...NO_QUOTATION_FILTER, from: '2026-10-02', to: '2026-10-31' }
    expect(matchesQuotationFilter(quote(), f)).toBe(true)
    expect(matchesQuotationFilter(quote({ quotation_date: '2026-10-01' }), f)).toBe(false)
    expect(matchesQuotationFilter(quote({ quotation_date: '2026-11-01' }), f)).toBe(false)
    // No quotation date: the enquiry date stands in.
    expect(matchesQuotationFilter(quote({ quotation_date: null, inquiry_date: '2026-10-15' }), f)).toBe(true)
  })

  it('reads the range on the closing date when asked, dropping undecided ones', () => {
    const f = { ...NO_QUOTATION_FILTER, basis: 'closing' as const, from: '2026-11-01', to: null }
    expect(matchesQuotationFilter(quote({ status: 'closed', closing_date: '2026-11-03' }), f)).toBe(true)
    expect(matchesQuotationFilter(quote({ status: 'closed', closing_date: '2026-10-30' }), f)).toBe(false)
    expect(matchesQuotationFilter(quote(), f)).toBe(false)
  })

  it('keeps only quotations with an amount inside the value range', () => {
    const f = { ...NO_QUOTATION_FILTER, minValue: 10000, maxValue: 50000 }
    expect(matchesQuotationFilter(quote({ amount: 10000 }), f)).toBe(true)
    expect(matchesQuotationFilter(quote({ amount: 50001 }), f)).toBe(false)
    expect(matchesQuotationFilter(quote({ amount: null }), f)).toBe(false)
    expect(matchesQuotationFilter(quote({ amount: 999999 }), { ...NO_QUOTATION_FILTER, minValue: 100000 })).toBe(true)
  })
})

describe('performance', () => {
  const list = [
    quote({ id: 'a', status: 'closed', amount: 30000, closing_date: '2026-10-12', followups: [{ at: 'x', by: 'y', note: 'z' }] }),
    quote({ id: 'b', status: 'closed', amount: null, closing_date: '2026-10-22', earlier_followups: 3 }),
    quote({ id: 'c', status: 'lost', closing_date: '2026-10-05', customer_type: 'new' }),
    quote({ id: 'd', status: 'open', coordinator_id: 'coord-2' }),
    quote({ id: 'e', status: 'closed', amount: 90000, coordinator_id: 'coord-2', closing_date: '2026-11-01', quotation_date: '2026-10-30' }),
  ]

  it('measures a set: win rate over decided ones, value won over closed ones with an amount', () => {
    const p = performanceOf(list)
    expect(p).toMatchObject({ quotations: 5, open: 1, closed: 3, lost: 1, winRate: 75, valueWon: 120000, valued: 2, averageOrder: 60000, newCustomers: 1 })
    expect(p.averageFollowups).toBe(0.8)
    // 10, 20 and 2 days from quotation to closing.
    expect(p.averageDaysToClose).toBe(11)
    expect(performanceOf([quote()]).winRate).toBeNull()
  })

  it('splits by person, the biggest value won first', () => {
    const people = performanceByPerson([...list, quote({ id: 'f', coordinator_id: null })])
    expect(people.map((p) => [p.personId, p.performance.quotations, p.performance.valueWon])).toEqual([
      ['coord-2', 2, 90000],
      ['coord-1', 3, 30000],
      ['', 1, 0],
    ])
  })

  it('goes month by month on the chosen date', () => {
    expect(monthlyPerformance(list, 'quotation')).toEqual([{ month: '2026-10', open: 1, closed: 3, lost: 1, valueWon: 120000 }])
    expect(monthlyPerformance(list, 'closing').map((m) => [m.month, m.closed, m.lost, m.valueWon])).toEqual([
      ['2026-10', 2, 1, 30000],
      ['2026-11', 1, 0, 90000],
    ])
  })
})
