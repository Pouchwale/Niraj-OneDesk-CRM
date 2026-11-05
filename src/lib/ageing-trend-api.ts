/** The Overdue book week by week (Overdue Payments → Trends). Read-only. */

import { AGEING_TREND_ROUTE, type AgeingTrendResponse } from './ageing-trend'

export async function getAgeingTrend(): Promise<AgeingTrendResponse> {
  let response: Response
  try {
    response = await fetch(AGEING_TREND_ROUTE)
  } catch {
    throw new Error('The server is not answering.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? 'Could not load the weekly figures.')
  }
  return body as AgeingTrendResponse
}
