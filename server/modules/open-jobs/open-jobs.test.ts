import { describe, expect, it, vi } from 'vitest'
import type { ServicePoMatch } from '../../../shared/service-po'
import { createOpenJobsSource, fetchReport, toOpenJob } from './source'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never
const config = { url: 'https://inventory.example', key: 'k-test', client: 'crm-service' }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('reading the inventory API', () => {
  it('follows nextOffset until the last page and sends the key as a bearer token', async () => {
    const calls: { url: string; auth: string | null }[] = []
    const doFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
      const offset = Number(new URL(url).searchParams.get('offset'))
      return offset === 0
        ? json(200, { rows: [{ 'PO No.': '1' }, { 'PO No.': '2' }], nextOffset: 2 })
        : json(200, { rows: [{ 'PO No.': '3' }], nextOffset: null })
    }) as unknown as typeof fetch
    const rows = await fetchReport(config, 'bom-pouch-open', doFetch)
    expect(rows.map((r) => r['PO No.'])).toEqual(['1', '2', '3'])
    expect(calls[0].url).toContain('reportId=bom-pouch-open')
    expect(calls[0].auth).toBe('Bearer k-test')
  })
  it('says when the key is refused', async () => {
    const doFetch = (async () => json(401, { error: 'Invalid API key' })) as unknown as typeof fetch
    await expect(fetchReport(config, 'bom-pouch-open', doFetch)).rejects.toThrow(/refused the key/)
  })
})

describe('an open job', () => {
  const sheet = new Map<string, ServicePoMatch>([
    ['92178', { poNo: '92178', customerName: 'Sapiens Labs', salesOrderNo: '5001', fgCode: 'FG1', dueDate: null, coordinatorName: 'Pragati', jobName: 'Pouch 250g' }],
  ])
  const who = (n: string | null) => (n?.toLowerCase().startsWith('pragati') ? 'c1' : null)
  it('takes the customer and coordinator from the API only; Service-AutoPO adds just SO, FG and job name', () => {
    const k =toOpenJob({ 'PO No.': '92178', 'PO Date': '11/18/26', 'Po RFD Date': '30/11/2026|MANUAL', 'Due Date': '11/25/26' }, 'bom-label-sleeve-open', sheet, who)
    expect(k).toMatchObject({ poNo: '92178', dueDate: '2026-11-25', rfdDate: '2026-11-30', rfdManual: true, customerName: null, coordinatorName: null, coordinatorId: null, salesOrderNo: '5001', jobName: 'Pouch 250g', detailsFrom: null })
  })
  it('a pouch with no Co-ordinator Name from the API goes to Disha Acharya; a name the API sends wins', () => {
    const disha = (n: string | null) => (n === 'Disha Acharya' ? 'd1' : n === 'Krina Shah' ? 'k1' : null)
    expect(toOpenJob({ 'PO No.': '1', 'Customer Name': 'A' }, 'bom-pouch-open', null, disha)).toMatchObject({ coordinatorName: 'Disha Acharya', coordinatorId: 'd1' })
    expect(toOpenJob({ 'PO No.': '1', 'Co-ordinator Name': 'Krina Shah' }, 'bom-pouch-open', null, disha)).toMatchObject({ coordinatorId: 'k1' })
    expect(toOpenJob({ 'PO No.': '1' }, 'bom-label-sleeve-open', null, disha)).toMatchObject({ coordinatorId: null })
  })
  it("prefers the API's own Customer Name and Coordinator columns when it sends them", () => {
    const j = toOpenJob(
      { 'PO No.': '92178', 'PO Date': '11/18/26', 'Po RFD Date': '01/01/1900', 'Due Date': '11/25/26', 'Customer Name': 'Other Co', 'Co-ordinator Name': 'Pragati Patel' },
      'bom-pouch-open',
      sheet,
      who
    )
    expect(j).toMatchObject({ customerName: 'Other Co', coordinatorName: 'Pragati Patel', coordinatorId: 'c1', rfdDate: null, detailsFrom: 'api' })
  })
})

describe('the source', () => {
  it('is off without a key, and keeps the last good read when the app fails', async () => {
    const off = createOpenJobsSource({ config: undefined, servicePo: { load: () => ({ pos: null, error: null }) }, coordinators: () => [], logger })
    expect(await off.get()).toMatchObject({ configured: false, jobs: [] })

    let t = 0
    let fail = false
    const doFetch = (async () => (fail ? json(500, { error: 'down' }) : json(200, { rows: [{ 'PO No.': '7', 'Due Date': '12/1/26', 'Po RFD Date': '02/12/2026' }], nextOffset: null }))) as unknown as typeof fetch
    const src = createOpenJobsSource({ config, servicePo: { load: () => ({ pos: null, error: null }) }, coordinators: () => [], logger, fetch: doFetch, now: () => new Date(t) })
    const first = await src.get()
    expect(first.jobs.map((j) => j.poNo)).toEqual(['7']) // one PO in both reports counts once
    fail = true
    t += 11 * 60 * 1000
    await src.get()
    await new Promise((r) => setTimeout(r, 0))
    const after = await src.get()
    expect(after.jobs.map((j) => j.poNo)).toEqual(['7'])
    expect(after.error).toBeNull()
  })
})
