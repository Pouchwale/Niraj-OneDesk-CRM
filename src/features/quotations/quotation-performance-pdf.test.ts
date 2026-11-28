import { describe, expect, it } from 'vitest'

import { conversionsByPerson, conversionsOf, monthlyPerformance, performanceByPerson, performanceOf } from '@/lib/quotation-stats'
import type { Quotation } from '@/lib/types'
import { customerLines, performanceCells, renderPerformancePdf } from './quotation-performance-pdf'

const q = (i: number, o: Partial<Quotation>): Quotation =>
  ({
    id: `q${i}`, inquiry_date: '2026-11-02', coordinator_id: i % 2 ? 'c1' : 'c2', coordinator_name: null, customer_name: `Customer ${i}`, concern_person: null, contact_number: null,
    source: 'Label', quotation_date: '2026-11-03', sales_employee: null, quotation_no: `QT-${i}`, followups: [], earlier_followups: 1, closing_date: null, status: 'open',
    customer_type: i % 3 ? 'existing' : 'new', amount: null, lost_remark: null, created_at: '2026-11-03', created_by: null, updated_at: '2026-11-03', updated_by: null, ...o,
  }) as Quotation

const list = Array.from({ length: 60 }, (_, i) =>
  i % 3 === 0 ? q(i, { status: 'closed', closing_date: '2026-11-20', amount: 10000 + i }) : i % 3 === 1 ? q(i, { status: 'lost', closing_date: '2026-11-21', lost_remark: 'Price high' }) : q(i, {})
)

describe('the Quotation Performance PDF (28 Nov 2026)', () => {
  it('writes each coordinator line like the screen', () => {
    const team = performanceOf(list)
    expect(performanceCells('Team', team)).toEqual(['Team', '60', '20', '20', '20', '50%', expect.stringContaining('Rs'), expect.stringContaining('Rs'), '17 d'])
  })

  it('lists each customer with their coordinator, open / won / lost, value won and the last time they were talked to', () => {
    const mk = (i: number, o: Partial<Quotation>) => q(i, { customer_name: 'Acme Pvt Ltd', ...o })
    const lines = customerLines(
      [
        mk(1, { coordinator_id: 'c1', status: 'closed', amount: 5000, followups: [{ at: '2026-11-05T10:00:00Z', by: 'c1', note: 'Asked for a sample' }] }),
        mk(2, { coordinator_id: 'c1', status: 'open', followups: [{ at: '2026-11-20T09:00:00Z', by: 'c1', note: 'Will confirm Monday' }] }),
        mk(3, { coordinator_id: 'c2', status: 'lost', customer_name: 'ACME Private Limited' }),
        q(4, { coordinator_id: 'c2', customer_name: 'Beta Foods', status: 'open' }),
      ],
      (x) => (x.coordinator_id === 'c1' ? 'Pragati Patel' : 'Diya Prajapati')
    )
    const acme = lines.find((l) => l.customer === 'Acme Pvt Ltd')!
    expect(acme).toMatchObject({ coordinators: 'Diya Prajapati, Pragati Patel', quotations: 3, open: 1, won: 1, lost: 1, valueWon: 5000, lastTalked: '2026-11-20', lastNote: 'Will confirm Monday' })
    expect(acme.list).toBe('QT-1 won, QT-2 open, QT-3 lost')
    expect(lines).toHaveLength(2)
  })

  it('draws every section, the won / lost / open lists running onto more pages', async () => {
    const doc = await renderPerformancePdf({
      period: '1 Nov 2026 – 28 Nov 2026 · by quotation date',
      who: 'Whole team',
      filters: ['Search: Customer'],
      generatedBy: 'Test',
      today: '2026-11-28',
      conversions: { team: conversionsOf(list), people: conversionsByPerson(list, ['c1', 'c2']).map((r) => ({ name: r.personId, summary: r.summary })) },
      performance: { team: performanceOf(list), people: performanceByPerson(list).map((r) => ({ name: r.personId, performance: r.performance })) },
      months: monthlyPerformance(list, 'quotation'),
      won: list.filter((x) => x.status === 'closed'),
      lost: list.filter((x) => x.status === 'lost'),
      open: list.filter((x) => x.status === 'open'),
      nameOf: (x) => x.coordinator_id ?? 'Unassigned',
    })
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    const text = Array.from({ length: doc.getNumberOfPages() }, (_, p) => {
      doc.setPage(p + 1)
      return JSON.stringify((doc as unknown as { internal: { pages: unknown[] } }).internal.pages[p + 1])
    }).join(' ')
    // Brackets are escaped inside a PDF, so look for the words around them.
    for (const part of ['Conversions and score', 'Performance', 'Month by month', 'converted', ': 20 deals', 'Lost: 20', 'waiting on the customer', 'Customer 3', 'Price high', 'QT-0', 'Customer by customer', 'Last follow-up note']) {
      expect(text).toContain(part)
    }
  })
})
