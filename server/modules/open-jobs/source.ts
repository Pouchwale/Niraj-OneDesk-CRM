/**
 * The open jobs from the inventory app's read-only API (27 Nov 2026;
 * shared/open-jobs.ts). The server alone holds the key (INVENTORY_API_KEY) and
 * calls the API; the browser only ever asks this server. Both reports are
 * read, every page, at most every ten minutes; a failed read keeps the last
 * good one. Each PO's customer and coordinator come from the API's own columns
 * only (the user's choice); the Service-AutoPO workbook adds just the SO
 * number, FG code and job name. The coordinator's name is matched to a CRM
 * account by full or first name (the Pre Sales matcher).
 */

import { API_DETAIL_HEADERS, cellFor, monthFirstDate, OPEN_JOB_REPORTS, rfdDateOf, type OpenJob, type OpenJobReport, type OpenJobsResponse } from '../../../shared/open-jobs'
import { poKey, type ServicePoMatch } from '../../../shared/service-po'
import type { InventoryApiConfig } from '../../config'
import type { Logger } from '../../logger'
import { coordinatorMatcher } from '../presales/match'
import type { ServicePoFile } from '../service-po/lookup'

/** How long a read of the inventory app is used before it is read again. */
export const OPEN_JOBS_REFRESH_MS = 10 * 60 * 1000
const PAGE = 500
const MAX_PAGES = 40
const TIMEOUT_MS = 20_000

type ApiRow = Record<string, unknown>

interface Deps {
  config: InventoryApiConfig | undefined
  servicePo: ServicePoFile
  coordinators: () => { id: string; name: string }[]
  logger: Logger
  fetch?: typeof fetch
  now?: () => Date
}

export interface OpenJobsSource {
  /** The jobs as last read; reads the inventory app first when that is over ten minutes old. */
  get(): Promise<OpenJobsResponse>
}

/** Every row of one report, page by page. Throws with a readable reason. */
export async function fetchReport(config: InventoryApiConfig, report: OpenJobReport, doFetch: typeof fetch = fetch): Promise<ApiRow[]> {
  const rows: ApiRow[] = []
  let offset: number | null = 0
  for (let page = 0; offset !== null && page < MAX_PAGES; page++) {
    const url = `${config.url}/api/advanced-api/data?reportId=${encodeURIComponent(report)}&limit=${PAGE}&offset=${offset}`
    let response: Response
    try {
      response = await doFetch(url, {
        headers: { Authorization: `Bearer ${config.key}`, 'X-API-Client-Name': config.client, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      throw new Error(`The inventory app did not answer (${err instanceof Error ? err.message : 'network error'}).`)
    }
    const body = (await response.json().catch(() => null)) as { rows?: unknown; nextOffset?: unknown; error?: unknown } | null
    if (!response.ok) {
      const why = typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`
      throw new Error(response.status === 401 || response.status === 403 ? `The inventory app refused the key (${why}).` : `The inventory app answered with an error (${why}).`)
    }
    if (!body || !Array.isArray(body.rows)) throw new Error('The inventory app sent something that is not a report.')
    rows.push(...(body.rows as ApiRow[]))
    offset = typeof body.nextOffset === 'number' && body.nextOffset > offset ? body.nextOffset : null
  }
  return rows
}

/** One API row as an open job, its details from the API or else Service-AutoPO. */
export function toOpenJob(
  row: ApiRow,
  report: OpenJobReport,
  sheet: Map<string, ServicePoMatch> | null,
  coordinatorOf: (name: string | null) => string | null
): OpenJob | null {
  const poNo = poKey(row['PO No.'] ?? cellFor(row, ['PO No.', 'PO No', 'PO Number']))
  if (!poNo) return null
  const rfd = rfdDateOf(row['Po RFD Date'] ?? cellFor(row, ['Po RFD Date', 'PO RFD Date', 'RFD Date']))
  const fromSheet = sheet?.get(poNo) ?? null
  const api = {
    customer: cellFor(row, API_DETAIL_HEADERS.customer),
    coordinator: cellFor(row, API_DETAIL_HEADERS.coordinator),
    salesOrder: cellFor(row, API_DETAIL_HEADERS.salesOrder),
    fg: cellFor(row, API_DETAIL_HEADERS.fg),
    job: cellFor(row, API_DETAIL_HEADERS.job),
  }
  // Customer and coordinator from the API only (27 Nov 2026, the user's choice); Service-AutoPO only adds SO, FG and job name.
  const customerName = api.customer
  const coordinatorName = api.coordinator
  return {
    poNo,
    report,
    poDate: monthFirstDate(row['PO Date']),
    dueDate: monthFirstDate(row['Due Date']),
    rfdDate: rfd.date,
    rfdManual: rfd.manual,
    customerName,
    coordinatorName,
    coordinatorId: coordinatorOf(coordinatorName),
    salesOrderNo: api.salesOrder ?? fromSheet?.salesOrderNo ?? null,
    fgCode: api.fg ?? fromSheet?.fgCode ?? null,
    jobName: api.job ?? fromSheet?.jobName ?? null,
    detailsFrom: api.customer || api.coordinator ? 'api' : null,
  }
}

export function createOpenJobsSource(deps: Deps): OpenJobsSource {
  const now = deps.now ?? (() => new Date())
  const doFetch = deps.fetch ?? fetch
  let held: { at: number; fetchedAt: string; rows: { report: OpenJobReport; row: ApiRow }[] } | null = null
  let lastError: string | null = null
  let reading: Promise<void> | null = null

  const read = async () => {
    const config = deps.config
    if (!config) return
    try {
      const rows: { report: OpenJobReport; row: ApiRow }[] = []
      for (const r of OPEN_JOB_REPORTS) for (const row of await fetchReport(config, r.id, doFetch)) rows.push({ report: r.id, row })
      held = { at: now().getTime(), fetchedAt: now().toISOString(), rows }
      lastError = null
      deps.logger.info('open jobs: inventory app read', { rows: rows.length })
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Could not read the inventory app.'
      deps.logger.warn('open jobs: inventory app not read', { error: lastError })
      // Try again in a minute rather than at the next request.
      if (held) held = { ...held, at: now().getTime() - OPEN_JOBS_REFRESH_MS + 60_000 }
    }
  }

  return {
    async get() {
      if (!deps.config) return { configured: false, error: null, fetchedAt: null, jobs: [] }
      if (!held || now().getTime() - held.at >= OPEN_JOBS_REFRESH_MS) {
        reading ??= read().finally(() => {
          reading = null
        })
        // The first read is waited for; after that the held jobs answer while a fresh read runs.
        if (!held) await reading
      }
      if (!held) return { configured: true, error: lastError ?? 'The inventory app could not be read.', fetchedAt: null, jobs: [] }
      const sheet = deps.servicePo.load().pos
      const coordinatorOf = coordinatorMatcher(deps.coordinators())
      const seen = new Set<string>()
      const jobs: OpenJob[] = []
      for (const { report, row } of held.rows) {
        const job = toOpenJob(row, report, sheet, coordinatorOf)
        if (!job || seen.has(job.poNo)) continue
        seen.add(job.poNo)
        jobs.push(job)
      }
      return { configured: true, error: null, fetchedAt: held.fetchedAt, jobs }
    },
  }
}
