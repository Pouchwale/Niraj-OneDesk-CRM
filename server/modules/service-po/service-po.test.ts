/**
 * Service â†’ the PO lookup (16 Nov 2026): the server reads Service-AutoPO by its
 * headers and answers for one PO to anyone signed in; the sheet is never sent.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import * as XLSX from 'xlsx'

import { createApp } from '../../app'
import { loadConfig } from '../../config'
import { createLogger } from '../../logger'
import { AUTH_ROUTES } from '../../../shared/auth'
import { poKey, SERVICE_PO_ROUTE, type ServicePoResponse } from '../../../shared/service-po'
import { readServicePos } from './lookup'

const quiet = createLogger({ level: 'error', write: () => undefined })
const HEADER = ['Customer Name', 'Job Name', 'FG Item Code', 'PO Date', 'PO No.', 'PO Status', 'SO Number', 'Planned Quantity', 'Open Order Quantity', 'RFD Date', 'Due Date', 'Co-ordinator Name']
// 46344 = 18 Nov 2026 as an Excel day number.
const book = () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      HEADER,
      ['J.P.Foods  Ltd', 'Pouch', 'FGSL3273', 46300, 91662, 'Closed', 34171, 1000, 0, null, 46344, 'Foram Prajapati'],
      ['Satvam Nutrifoods', 'Pouch', 'FGSL3523', 46300, '91651', 'Released', 34166, 500, 0, null, null, 'Foram'],
    ]),
    'LOGISTIC_APP'
  )
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('reading Service-AutoPO', () => {
  it('finds the columns by header and keys each PO by its number', () => {
    const pos = readServicePos(book())
    expect(pos.get('91662')).toEqual({ poNo: '91662', customerName: 'J.P.Foods Ltd', salesOrderNo: '34171', fgCode: 'FGSL3273', dueDate: '2026-11-18', coordinatorName: 'Foram Prajapati', jobName: 'Pouch' })
    expect(pos.get('91651')).toMatchObject({ customerName: 'Satvam Nutrifoods', dueDate: null })
    expect(poKey(' 91662 ')).toBe('91662')
    expect(poKey(91662)).toBe('91662')
  })
})

describe('the route', () => {
  let server: ReturnType<typeof createServer>
  let port = 0
  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'service-po-'))
    const file = join(root, 'Service-AutoPO.xlsx')
    writeFileSync(file, book())
    const config = loadConfig({ AUTH_DIR: mkdtempSync(join(root, 'auth-')), DATA_DIR: mkdtempSync(join(root, 'data-')), SNAPSHOT_DIR: mkdtempSync(join(root, 'snap-')), SERVICE_PO_PATH: file })
    server = createServer(createApp(config, quiet))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const signIn = async (username: string, password: string) => {
    const res = await fetch(`http://127.0.0.1:${port}${AUTH_ROUTES.login}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    return res.headers.get('set-cookie')?.split(';')[0] ?? ''
  }
  const ask = (po: string, cookie = '') => fetch(`http://127.0.0.1:${port}${SERVICE_PO_ROUTE}?po=${encodeURIComponent(po)}`, { headers: cookie ? { cookie } : {} })

  it('is closed to anyone not signed in', async () => {
    expect((await ask('91662')).status).toBe(401)
  })

  it('answers a coordinator for one PO, and says when the sheet does not have it', async () => {
    const cookie = await signIn('pragati', 'Pragati@123')
    const found = (await (await ask(' 91662', cookie)).json()) as ServicePoResponse
    expect(found).toEqual({ configured: true, error: null, match: { poNo: '91662', customerName: 'J.P.Foods Ltd', salesOrderNo: '34171', fgCode: 'FGSL3273', dueDate: '2026-11-18', coordinatorName: 'Foram Prajapati', jobName: 'Pouch' } })
    const missing = (await (await ask('99999', cookie)).json()) as ServicePoResponse
    expect(missing).toEqual({ configured: true, error: null, match: null })
    // Nothing else: no list of POs, and no raw file.
    expect(((await (await ask('', cookie)).json()) as ServicePoResponse).match).toBeNull()
    expect((await fetch(`http://127.0.0.1:${port}/api/excel/file?book=servicepo`, { headers: { cookie } })).status).not.toBe(200)
  })
})
