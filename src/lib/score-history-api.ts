/** The score history from the server (see server/modules/score-history). */

import { SCORE_HISTORY_ROUTE, type FinalRatio, type FinalWeights, type PeriodKind, type PeriodScores, type ScoreHistoryResponse } from './score-history'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  } catch {
    throw new Error('The server is not answering. The final scores are kept on the machine that runs the app.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? 'The server refused that.')
  }
  return body as T
}

export const getScoreHistory = (kind: PeriodKind, count?: number) =>
  call<ScoreHistoryResponse>(`${SCORE_HISTORY_ROUTE}?kind=${kind}${count ? `&count=${count}` : ''}`)

/** The administrator works a locked period out again from today's records. */
/** The administrator adds a dated final score ratio, or changes the one with `id`. */
export const saveFinalRatio = (ratio: { from: string; to: string | null; weights: FinalWeights }, id?: string) =>
  call<{ ratio: FinalRatio; finalRatios: FinalRatio[] }>(`${SCORE_HISTORY_ROUTE}/ratios${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(ratio) })

/** The administrator removes a dated ratio. */
export const deleteFinalRatio = (id: string) =>
  call<{ finalRatios: FinalRatio[] }>(`${SCORE_HISTORY_ROUTE}/ratios/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const recalculatePeriod = (id: string) => call<PeriodScores>(`${SCORE_HISTORY_ROUTE}/recalculate`, { method: 'POST', body: JSON.stringify({ id }) })
