/** The score history from the server (see server/modules/score-history). */

import { SCORE_HISTORY_ROUTE, type PeriodKind, type PeriodScores, type ScoreHistoryResponse } from './score-history'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  } catch {
    throw new Error('The server is not answering. The score history is kept on the machine that runs the app.')
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
export const recalculatePeriod = (id: string) => call<PeriodScores>(`${SCORE_HISTORY_ROUTE}/recalculate`, { method: 'POST', body: JSON.stringify({ id }) })
