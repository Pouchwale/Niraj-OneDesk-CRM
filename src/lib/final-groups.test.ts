import { describe, expect, it } from 'vitest'
import { formatLost, groupColumns, groupScores } from './final-groups'
import { DEFAULT_WEIGHTING, planOfPeople, weightedFinalOf, type PeriodWeighting } from './weightage'
import type { ScoreEntry } from './score-history'

const entry = (coordinatorId: string, module: ScoreEntry['module'], score: number | null): ScoreEntry => ({ coordinatorId, name: coordinatorId, module, score, detail: {} })
const people = [
  { id: 'g1', team: 'GP3' },
  { id: 'coord-11', team: 'Pouchwale' },
  { id: 'coord-7', team: 'Pouchwale' },
  { id: 'coord-9', team: 'Pouchwale' },
]
const weighting: PeriodWeighting = { from: DEFAULT_WEIGHTING.from, plans: DEFAULT_WEIGHTING.plans, planOf: planOfPeople(DEFAULT_WEIGHTING.plans, people) }
const final = (id: string, entries: ScoreEntry[]) => weightedFinalOf({ entries, weighting }, id)

describe('the final score by groups (28 Nov 2026)', () => {
  it('GP3: each group shows the points it took off, and the groups add up to the final', () => {
    // Regular 80 (×15 → -3), Dispute 60 (×5 → -2), Self Leads 100; Service 50 (×10 → -5), Quotations 100, Robi -10% (90, ×10 → -1); FMS and CAPA not connected.
    const f = final('g1', [entry('g1', 'kpi', 80), entry('g1', 'kpi_dispute', 60), entry('g1', 'self_leads', 100), entry('g1', 'service', 50), entry('g1', 'quotations', 100), entry('g1', 'robi', -10)])
    const groups = groupScores(f)
    expect(groups.map((g) => [g.label, g.share, g.lost])).toEqual([
      ['Performance', 40, 5],
      ['Follow-up', 30, 6],
      ['FMS', 20, 20],
      ['CAPA', 10, 10],
    ])
    expect(groups[0].items.map((i) => [i.item, i.lost])).toEqual([
      ['kpi', 3],
      ['kpi_dispute', 2],
      ['self_leads', 0],
    ])
    const totalLost = groups.reduce((a, g) => a + g.lost, 0)
    expect(100 - totalLost).toBe(f.score)
  })
  it('an item with no score loses its whole share', () => {
    const g = groupScores(final('g1', []))
    expect(g[0].lost).toBe(40)
  })
  it("Vishva's CAPA deduction is one CAPA column", () => {
    expect(groupScores(final('coord-9', []))).toEqual([{ label: 'CAPA', share: null, lost: 0, items: [] }])
  })
  it('a team table has every group of its people, a share only when it is the same for all', () => {
    const cols = groupColumns([groupScores(final('coord-11', [])), groupScores(final('coord-7', [])), groupScores(final('coord-9', []))])
    expect(cols.map((c) => [c.label, c.share])).toEqual([
      ['RFD follow-up (Robi)', 50],
      ['CAPA', null],
      ['FMS', null],
      ['Robi follow-up', 40],
    ])
    expect(cols[1].items).toEqual([{ item: 'capa', share: 20 }])
  })
  it('writes points lost in minus scoring', () => {
    expect([formatLost(0), formatLost(8), formatLost(12.25), formatLost(null)]).toEqual(['0', '-8', '-12.3', '—'])
  })
})
