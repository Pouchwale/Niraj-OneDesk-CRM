import { describe, expect, it } from 'vitest'
import { checkWeighting, checkWeightPlan, DEFAULT_WEIGHTING, planOfPeople, planTotal, weightedDetail, weightedFinalOf, type PeriodWeighting } from './weightage'
import type { ScoreEntry } from './score-history'

const entry = (coordinatorId: string, module: ScoreEntry['module'], score: number | null): ScoreEntry => ({ coordinatorId, name: coordinatorId, module, score, detail: {} })
const people = [
  { id: 'coord-1', team: 'GP3' },
  { id: 'coord-11', team: 'Pouchwale' },
  { id: 'coord-7', team: 'Pouchwale' },
  { id: 'coord-9', team: 'Pouchwale' },
  { id: 'coord-x', team: 'Pouchwale' },
]
const weighting: PeriodWeighting = { from: DEFAULT_WEIGHTING.from, plans: DEFAULT_WEIGHTING.plans, planOf: planOfPeople(DEFAULT_WEIGHTING.plans, people) }

describe('the user’s weightage (27 Nov 2026)', () => {
  it('every default plan adds up to 100, and the setting checks out', () => {
    for (const p of DEFAULT_WEIGHTING.plans) if (!p.capaDeduction) expect(planTotal(p)).toBe(100)
    expect(() => checkWeighting(DEFAULT_WEIGHTING)).not.toThrow()
  })
  it('a person’s own plan beats the team’s; someone with neither has none', () => {
    expect(weighting.planOf).toEqual({ 'coord-1': 'gp3', 'coord-11': 'avani', 'coord-7': 'krina', 'coord-9': 'vishva' })
  })
  it('GP3: Performance 40, Follow-up 30, FMS 20, CAPA 10 — FMS and CAPA count zero until connected (no scaling)', () => {
    // Everything at full marks: Robi 0% gap = 100, KPI 100, Self Leads 100, Service 100, Quotations 100.
    const entries = [entry('coord-1', 'robi', 0), entry('coord-1', 'kpi', 100), entry('coord-1', 'kpi_dispute', 100), entry('coord-1', 'self_leads', 100), entry('coord-1', 'service', 100), entry('coord-1', 'quotations', 100)]
    const f = weightedFinalOf({ entries, weighting }, 'coord-1')
    expect(f.score).toBe(70) // shows as -30
    expect(weightedDetail(f, (v) => String(v - 100))).toContain('FMS not connected yet (0) × 20%')
  })
  it('a module with no score counts zero for its share', () => {
    const f = weightedFinalOf({ entries: [entry('coord-1', 'kpi', 80)], weighting }, 'coord-1')
    expect(f.score).toBe(12) // 80 × 15%
  })
  it('GP3 Performance: Overdue Scoring Regular 15 + Dispute 5 + Self Leads 20', () => {
    const gp3 = weighting.plans.find((p) => p.id === 'gp3')!
    expect(gp3.groups[0].items).toEqual({ kpi: 15, kpi_dispute: 5, self_leads: 20 })
    const f = weightedFinalOf({ entries: [entry('coord-1', 'kpi', 100), entry('coord-1', 'kpi_dispute', 60)], weighting }, 'coord-1')
    expect(f.score).toBe(18) // 100 × 15% + 60 × 5%
  })
  it('Avani: Robi 50 (RFD follow-up), CAPA 20, FMS 30', () => {
    expect(weightedFinalOf({ entries: [entry('coord-11', 'robi', -10)], weighting }, 'coord-11').score).toBe(45)
  })
  it('Vishva: 100 less 20 per CAPA; none known yet', () => {
    const f = weightedFinalOf({ entries: [], weighting }, 'coord-9')
    expect(f.score).toBe(100)
    expect(f.capas).toBe(0)
  })
  it('no weightage, no final score', () => {
    expect(weightedFinalOf({ entries: [entry('coord-x', 'robi', 0)], weighting }, 'coord-x').score).toBeNull()
  })
  it('refuses shares that do not add up to 100, an item twice, and a person on two plans', () => {
    expect(() => checkWeightPlan({ name: 'X', team: 'GP3', groups: [{ label: 'A', items: { robi: 50 } }] })).toThrow(/add up to 50%/)
    expect(() => checkWeightPlan({ name: 'X', team: 'GP3', groups: [{ label: 'A', items: { robi: 50 } }, { label: 'B', items: { robi: 50 } }] })).toThrow(/two groups/)
    expect(() => checkWeighting({ plans: [{ id: 'a', name: 'A', coordinatorIds: ['c'], capaDeduction: 20 }, { id: 'b', name: 'B', coordinatorIds: ['c'], capaDeduction: 20 }] })).toThrow(/two personal/)
    expect(() => checkWeightPlan({ name: 'X', groups: [] })).toThrow(/team or at least one person/)
  })
})
