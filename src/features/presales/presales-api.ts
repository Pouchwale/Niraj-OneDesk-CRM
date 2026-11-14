/** Pre Sales Analysis on the server (see server/modules/presales). */

import { PRESALES_ROUTE, type PresalesFollowup, type PresalesMode, type PresalesResponse, type PresalesResponseId } from '../../../shared/presales'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  } catch {
    throw new Error('The server is not answering. The pre-sales data is read on the machine that runs the app.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? 'The server refused that.')
  return body as T
}

export const getPresales = () => call<PresalesResponse>(PRESALES_ROUTE)

export const getPresalesStatus = () => call<{ configured: boolean; modifiedAt: string | null }>(`${PRESALES_ROUTE}/status`)

export interface NewPresalesFollowup {
  customerCode: string
  items: string[]
  mode: PresalesMode
  response: PresalesResponseId
  said: string
  expectedOrderDate: string | null
  nextDate: string | null
}

export const logPresalesFollowup = (followup: NewPresalesFollowup) =>
  call<PresalesFollowup>(`${PRESALES_ROUTE}/followups`, { method: 'POST', body: JSON.stringify(followup) })
