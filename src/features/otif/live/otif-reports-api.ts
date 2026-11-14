/** Saved OTIF reports on the server (see server/modules/otif-reports). */

import { OTIF_REPORTS_ROUTE, type OtifSavedReport, type OtifSavedReportSummary } from '../../../../shared/otif-reports'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  } catch {
    throw new Error('The server is not answering. Saved reports are kept on the machine that runs the app.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? 'The server refused that.')
  return body as T
}

export const listOtifReports = () => call<{ reports: OtifSavedReportSummary[] }>(OTIF_REPORTS_ROUTE).then((b) => b.reports)

export const getOtifReport = (id: string) => call<OtifSavedReport>(`${OTIF_REPORTS_ROUTE}/${encodeURIComponent(id)}`)

export type NewOtifReport = Pick<OtifSavedReport, 'name' | 'from' | 'to' | 'basis' | 'filters' | 'file' | 'rows'>

export const saveOtifReport = (report: NewOtifReport) =>
  call<OtifSavedReportSummary>(OTIF_REPORTS_ROUTE, { method: 'POST', body: JSON.stringify(report) })

/** The administrator only. */
export const deleteOtifReport = (id: string) => call<{ ok: true }>(`${OTIF_REPORTS_ROUTE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
