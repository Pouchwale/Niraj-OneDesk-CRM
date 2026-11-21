/** The score history from the server (see server/modules/score-history). */

import { SCORE_HISTORY_ROUTE, type FinalRatio, type FinalWeights, type LeadTarget, type PeriodKind, type PeriodScores, type PersonRatio, type ScoreGroup, type ScoreGroupMap, type ScoreHistoryResponse } from './score-history'

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
export const saveFinalRatio = (ratio: { from: string; to: string | null; weights: FinalWeights; group?: ScoreGroup }, id?: string) =>
  call<{ ratio: FinalRatio; finalRatios: FinalRatio[] }>(`${SCORE_HISTORY_ROUTE}/ratios${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(ratio) })

/** The administrator removes a dated ratio. */
export const deleteFinalRatio = (id: string) =>
  call<{ finalRatios: FinalRatio[] }>(`${SCORE_HISTORY_ROUTE}/ratios/${encodeURIComponent(id)}`, { method: 'DELETE' })

/** The administrator adds a ratio for particular coordinators, or changes the one with `id`. */
export const savePersonRatio = (ratio: { coordinatorIds: string[]; weights: FinalWeights; group?: ScoreGroup }, id?: string) =>
  call<{ ratio: PersonRatio; personRatios: PersonRatio[] }>(`${SCORE_HISTORY_ROUTE}/person-ratios${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(ratio) })

/** The administrator removes a per-person ratio: those people go back to the team ratio. */
export const deletePersonRatio = (id: string) =>
  call<{ personRatios: PersonRatio[] }>(`${SCORE_HISTORY_ROUTE}/person-ratios/${encodeURIComponent(id)}`, { method: 'DELETE' })

/** The administrator moves modules between the Payments and Operations scores. */
export const saveScoreGroups = (groups: ScoreGroupMap) =>
  call<{ scoreGroups: ScoreGroupMap }>(`${SCORE_HISTORY_ROUTE}/groups`, { method: 'PUT', body: JSON.stringify({ groups }) })

export const recalculatePeriod = (id: string) => call<PeriodScores>(`${SCORE_HISTORY_ROUTE}/recalculate`, { method: 'POST', body: JSON.stringify({ id }) })

/** The administrator adds a dated Self Leads target, or changes the one with `id`. */
export const saveLeadTarget = (target: { from: string; to: string | null; full: number; partial: number }, id?: string) =>
  call<{ target: LeadTarget; leadTargets: LeadTarget[] }>(`${SCORE_HISTORY_ROUTE}/lead-targets${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(target) })

/** The administrator removes a dated Self Leads target. */
export const deleteLeadTarget = (id: string) =>
  call<{ leadTargets: LeadTarget[] }>(`${SCORE_HISTORY_ROUTE}/lead-targets/${encodeURIComponent(id)}`, { method: 'DELETE' })
