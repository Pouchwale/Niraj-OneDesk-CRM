import { describe, expect, it } from 'vitest'

import { scoreLabel } from '@/features/assistant/scores'
import { kpiGap } from '@/features/snapshots/transform'
import { lessHundred, scoreSweep } from '@/lib/__fixtures__/less-hundred'
import { finalScoreOf, SCORE_MODULES, type ScoreModule } from '@/lib/score-history'
import { formatFinal, formatPart, formatScore } from './format'

/* The page's writing before minus scoring (6 Nov 2026), word for word, to check against. */
function oldFormatScore(module: ScoreModule, score: number | null): string {
  if (score === null || score === undefined) return '—'
  if (module === 'robi') return scoreLabel(Math.sign(score) * Math.round(Math.abs(score)) || 0)
  if (module === 'kpi' || module === 'kpi_dispute') return `${kpiGap(score)}%`
  if (module === 'quotations') return score.toFixed(1)
  if (module === 'self_leads') return `${score}%`
  return String(Math.round(score * 10) / 10)
}
const oldFormatFinal = (score: number | null) => (score === null || score === undefined ? '—' : score.toFixed(1))
const oldPart = (value: number) => String(Math.round(value * 10) / 10)

const sweep = scoreSweep()
/** Self Leads scores have at most two decimals: a conversion is whole, an average is rounded to two. */
const twoDecimals = sweep.filter((v) => Math.round(v * 100) / 100 === v)

describe('Final score page in minus scoring', () => {
  it('writes the examples the way the organisation scores', () => {
    expect(formatScore('quotations', 85)).toBe('-15.0')
    expect(formatScore('quotations', 62.45)).toBe('-37.5')
    expect(formatScore('quotations', 150)).toBe('+50.0')
    expect(formatScore('quotations', 100)).toBe('0.0')
    expect(formatScore('billing', 100)).toBe('0')
    expect(formatScore('billing', 50)).toBe('-50')
    expect(formatScore('billing', 0)).toBe('-100')
    expect(formatScore('billing', -25)).toBe('-125')
    expect(formatScore('billing', -100)).toBe('-200')
    expect(formatScore('billing', 62.5)).toBe('-37.5')
    expect(formatScore('service', 99)).toBe('-1')
    expect(formatScore('service', 70)).toBe('-30')
    expect(formatScore('self_leads', 40)).toBe('-60%')
    expect(formatScore('self_leads', 33.33)).toBe('-66.67%')
    expect(formatScore('robi', -25)).toBe('-25%')
    expect(formatScore('kpi', 85.5)).toBe('-14.5%')
    expect(formatScore('kpi_dispute', 100)).toBe('0%')
    expect(formatFinal(72.5)).toBe('-27.5')
    expect(formatFinal(100)).toBe('0.0')
    expect(formatFinal(-12.5)).toBe('-112.5')
    expect(formatPart(75)).toBe('-25')
  })

  it('shows a dash with no score', () => {
    for (const m of SCORE_MODULES) expect(formatScore(m.id, null)).toBe('—')
    expect(formatFinal(null)).toBe('—')
  })

  it('leaves Robi and the Weekly KPI exactly as they were (already minus)', () => {
    for (const v of sweep) {
      for (const m of ['robi', 'kpi', 'kpi_dispute'] as const) expect(formatScore(m, v)).toBe(oldFormatScore(m, v))
    }
  })

  it('writes every other module exactly 100 less than before', () => {
    for (const v of sweep) {
      for (const m of ['quotations', 'billing', 'service'] as const) expect(formatScore(m, v)).toBe(lessHundred(oldFormatScore(m, v)))
    }
    for (const v of twoDecimals) expect(formatScore('self_leads', v)).toBe(lessHundred(oldFormatScore('self_leads', v)))
  })

  it('writes the final score and its parts exactly 100 less than before', () => {
    for (const v of sweep) {
      expect(formatFinal(v)).toBe(lessHundred(oldFormatFinal(v)))
      expect(formatPart(v)).toBe(lessHundred(oldPart(v)))
    }
  })

  it('keeps the final score itself unchanged: the minus final is the average of the minus parts', () => {
    const entries = [
      { module: 'robi' as const, score: -25 },
      { module: 'kpi' as const, score: 85.5 },
      { module: 'quotations' as const, score: 62.5 },
      { module: 'billing' as const, score: -25 },
      { module: 'service' as const, score: 99 },
      { module: 'self_leads' as const, score: 40 },
    ]
    const final = finalScoreOf(entries)
    // Worked out of 100 as before: (75 + 85.5 + 62.5 - 25 + 99 + 40) / 6 = 56.1666… → 56.2.
    expect(final.score).toBe(56.2)
    expect(formatFinal(final.score)).toBe('-43.8')
    // The parts in minus scoring: -25, -14.5, -37.5, -125, -1, -60; their average is -43.8333… → -43.8.
    expect(final.parts.map((p) => formatPart(p.value))).toEqual(['-25', '-14.5', '-37.5', '-125', '-1', '-60'])
  })
})
