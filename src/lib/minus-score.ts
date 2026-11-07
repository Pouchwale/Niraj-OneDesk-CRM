/**
 * Minus scoring (the organisation's way of scoring, asked for on 7 Nov 2026):
 * a score is shown as its gap from 100, so full marks reads 0 and a score of
 * 70 reads -30. Only how a score is written changes: every formula still works
 * on the score out of 100, the values kept are the same, and colours and order
 * are unchanged. Robi's daily scores and the Weekly KPI were already written
 * this way.
 *
 * Pure, relative imports only, so the server could use it too.
 */

/**
 * A score's gap from 100. Pass the score rounded the way the screen rounds it
 * (to `decimals` places): the result is then exactly that figure less 100,
 * worked in whole units of the last decimal so no floating-point error creeps
 * in. 70 → -30, 100 → 0, 62.5 → -37.5, -25 → -125, 150 → 50.
 */
export function minusScore(rounded: number, decimals = 0): number {
  const unit = 10 ** decimals
  return (Math.round(rounded * unit) - 100 * unit) / unit || 0
}

/** A minus score written out: "-30", "0", "+50" above full marks; `fixed` keeps every decimal ("-37.50"). */
export function minusText(value: number, decimals = 0, fixed = false): string {
  const text = fixed ? value.toFixed(decimals) : String(value)
  return value > 0 ? `+${text}` : text
}

/** How many decimals a number is written with: 62.45 → 2, 70 → 0. */
export function decimalsOf(value: number): number {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot < 0 || text.includes('e') ? 0 : Math.min(10, text.length - dot - 1)
}

/**
 * A score shown with a fixed number of decimals (as `toFixed` shows it), in
 * minus scoring: 62.456 with 2 decimals was "62.46" and is now "-37.54".
 */
export function minusFixed(score: number | null | undefined, decimals: number): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return '—'
  return minusText(minusScore(Number(score.toFixed(decimals)), decimals), decimals, true)
}

/** A score shown rounded to one decimal (62.45 was "62.5"), in minus scoring: "-37.5"; 100 is "0". */
export function minusOneDecimal(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return '—'
  return minusText(minusScore(Math.round(score * 10) / 10, 1), 1)
}

/** A score shown as it is, every decimal kept (33.33 was "33.33"), in minus scoring: "-66.67". */
export function minusExact(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return '—'
  return minusText(minusScore(score, decimalsOf(score)), decimalsOf(score))
}
