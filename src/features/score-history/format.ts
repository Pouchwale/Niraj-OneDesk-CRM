/**
 * How the Final score page writes a score, in minus scoring (7 Nov 2026): every
 * score is its gap from 100, so full marks reads 0 (src/lib/minus-score.ts).
 * Robi's day scores and the Weekly KPI were already kept that way and read as
 * before; the other modules' scores, kept out of 100 (Billing from 100 down to
 * -100), and the final score are written less 100. Each figure is rounded
 * exactly as it was before, so it reads exactly 100 less than it used to.
 */

import { scoreLabel } from '@/features/assistant/scores'
import { kpiGap } from '@/features/snapshots/transform'
import { minusExact, minusFixed, minusOneDecimal } from '@/lib/minus-score'
import type { ScoreModule } from '@/lib/score-history'

/** A module's score as the page writes it: "-25%" (Robi), "-14.5%" (KPI), "-37.5" (Quotations), "-125" (Billing), "-60%" (Self Leads). */
export function formatScore(module: ScoreModule, score: number | null | undefined): string {
  if (score === null || score === undefined) return '—'
  // Halves away from zero, as Robi's weekly average rounds.
  if (module === 'robi') return scoreLabel(Math.sign(score) * Math.round(Math.abs(score)) || 0)
  if (module === 'kpi' || module === 'kpi_dispute') return `${kpiGap(score)}%`
  if (module === 'quotations') return minusFixed(score, 1)
  if (module === 'self_leads') return `${minusExact(score)}%`
  return minusOneDecimal(score)
}

/** A final score (kept out of 100, one decimal): 72.5 reads "-27.5", 100 reads "0.0". */
export const formatFinal = (score: number | null | undefined): string => minusFixed(score, 1)

/** One module's part in a final score (kept on the 0-100 scale), as its gap from 100: Robi's 75 reads "-25". */
export const formatPart = (value: number): string => minusOneDecimal(value)
