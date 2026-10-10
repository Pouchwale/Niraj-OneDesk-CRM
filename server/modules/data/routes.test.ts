/**
 * The working dataset over a real socket.
 *
 * The two things a LAN deployment stands or falls on: one person's work shows
 * up for everybody else, and a coordinator cannot read or change what is not
 * theirs. Both were impossible to get wrong before only because nothing was
 * shared at all.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'

import { createApp } from '../../app'
import { loadConfig } from '../../config'
import { createLogger } from '../../logger'
import { AUTH_ROUTES } from '../../../shared/auth'

const root = mkdtempSync(join(tmpdir(), 'data-routes-'))
const quiet = createLogger({ level: 'error', write: () => undefined })

let server: ReturnType<typeof createServer>
let port = 0

interface Seen {
  version: number
  snapshot: { companies: { id: string; name: string }[] }
  owedKeys: string[]
}

const read = async <T>(res: Response): Promise<T> => (await res.json()) as T

/** A browser of its own: its own cookie jar, like a second desktop. */
function desktop() {
  let cookie = ''
  const at = (path: string) => `http://127.0.0.1:${port}${path}`
  return {
    async signIn(username: string, password: string) {
      const res = await fetch(at(AUTH_ROUTES.login), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const header = res.headers.get('set-cookie')
      if (header) cookie = header.split(';')[0]
      return res.status
    },
    call: (path: string, init?: RequestInit) =>
      fetch(at(path), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
          ...(cookie ? { cookie } : {}),
        },
      }),
  }
}

const company = (id: string, coordinatorId: string) => ({
  id,
  name: `Customer ${id}`,
  sap_bp_code: `BP-${id}`,
  invoice_no: `INV-${id}`,
  contact_person: 'Someone',
  contact_number: '9000000000',
  email: null,
  payment_terms: '30',
  total_amount: 5000,
  invoice_date: '2026-06-01',
  due_date: '2026-07-01',
  status: 'overdue',
  assigned_coordinator_id: coordinatorId,
  module: 'Pouchwale',
  remarks: null,
  extra_fields: {},
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
})

beforeAll(async () => {
  const config = loadConfig({
    AUTH_DIR: mkdtempSync(join(root, 'auth-')),
    DATA_DIR: mkdtempSync(join(root, 'data-')),
  })
  server = createServer(createApp(config, quiet))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

describe('the data everyone shares', () => {
  it('is closed to anyone who has not signed in', async () => {
    const stranger = desktop()
    expect((await stranger.call('/api/data')).status).toBe(401)
    expect(
      (await stranger.call('/api/data/ops', { method: 'POST', body: JSON.stringify({ ops: [] }) }))
        .status
    ).toBe(401)
  })

  it('shows one desktop what another desktop did', async () => {
    // This is the whole point of the change: Niki imports, and Pragati — on
    // her own machine, in her own browser — sees it.
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    const wrote = await niki.call('/api/data/ops', {
      method: 'POST',
      body: JSON.stringify({ ops: [{ method: 'upsertCompany', args: [company('shared-1', 'coord-1')] }] }),
    })
    expect(wrote.status).toBe(200)

    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')
    const seen = await read<Seen>(await pragati.call('/api/data'))
    expect(seen.snapshot.companies.map((c: { id: string }) => c.id)).toContain('shared-1')
  })

  it('tells a browser when something has changed, so it can refetch', async () => {
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    const before = (await read<{ version: number }>(await niki.call('/api/data/version'))).version

    await niki.call('/api/data/ops', {
      method: 'POST',
      body: JSON.stringify({ ops: [{ method: 'upsertCompany', args: [company('shared-2', 'coord-1')] }] }),
    })

    const after = (await read<{ version: number }>(await niki.call('/api/data/version'))).version
    expect(after).toBeGreaterThan(before)
  })

  it('takes an import as one batch rather than one call per row', async () => {
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    const ops = Array.from({ length: 500 }, (_, i) => ({
      method: 'upsertCompany',
      args: [company(`bulk-${i}`, 'coord-1')],
    }))

    const res = await niki.call('/api/data/ops', { method: 'POST', body: JSON.stringify({ ops }) })
    expect(res.status).toBe(200)
    expect((await read<{ results: unknown[] }>(res)).results).toHaveLength(500)
  })
})

describe('what a coordinator may see', () => {
  it('is their own accounts and nobody else’s', async () => {
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    await niki.call('/api/data/ops', {
      method: 'POST',
      body: JSON.stringify({
        ops: [
          { method: 'upsertCompany', args: [company('hers', 'coord-1')] },
          { method: 'upsertCompany', args: [company('someone-elses', 'coord-4')] },
        ],
      }),
    })

    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')
    const seen = await read<Seen>(await pragati.call('/api/data'))
    const ids = seen.snapshot.companies.map((c: { id: string }) => c.id)

    expect(ids).toContain('hers')
    // Previously every browser held the whole book and merely chose what to
    // draw, so this was one developer-tools tab away from being readable.
    expect(ids).not.toContain('someone-elses')
  })

  it('still learns which accounts are owed elsewhere, without the records', async () => {
    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')
    const seen = await read<Seen>(await pragati.call('/api/data'))

    // The daily plan needs this to tell an account that was dealt with from one
    // that moved to somebody else. Keys only: no names, no amounts.
    expect(seen.owedKeys).toContain('company:someone-elses')
    expect(JSON.stringify(seen.snapshot)).not.toContain('Customer someone-elses')
  })

  it('cannot import the workbook or retire anybody’s rows', async () => {
    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')

    for (const method of ['upsertCompany', 'settleCompanies', 'deleteCompany', 'declareBankrupt']) {
      const res = await pragati.call('/api/data/ops', {
        method: 'POST',
        body: JSON.stringify({ ops: [{ method, args: [] }] }),
      })
      expect([403, 400]).toContain(res.status)
      expect(res.status).toBe(403)
    }
  })

  it('can log a follow-up, which is the job', async () => {
    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')
    const res = await pragati.call('/api/data/ops', {
      method: 'POST',
      body: JSON.stringify({
        ops: [
          {
            method: 'addFollowup',
            args: [
              {
                entity_type: 'company',
                entity_id: 'hers',
                coordinator_id: 'coord-1',
                mode: 'call',
                status: 'pending',
                notes: 'Rang them',
                followup_date: '2026-09-13T10:00:00.000Z',
              },
            ],
          },
        ],
      }),
    })
    expect(res.status).toBe(200)
  })
})

describe('a follow-up saved again after a failed save', () => {
  it('is not recorded twice when the same save arrives again', async () => {
    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')
    const op = {
      method: 'addFollowup',
      args: [
        {
          id: 'fu-retry',
          entity_type: 'company',
          entity_id: 'hers',
          coordinator_id: 'coord-1',
          mode: 'call',
          status: 'pending',
          notes: 'Rang them',
          followup_date: '2026-09-16T10:00:00.000Z',
        },
      ],
    }
    for (let i = 0; i < 3; i++) {
      const res = await pragati.call('/api/data/ops', { method: 'POST', body: JSON.stringify({ ops: [op] }) })
      expect(res.status).toBe(200)
    }

    const seen = await read<{ snapshot: { followups: { id: string }[] } }>(await pragati.call('/api/data'))
    expect(seen.snapshot.followups.filter((f) => f.id === 'fu-retry')).toHaveLength(1)
  })
})

describe('a coordinator asking, the team leader deciding', () => {
  type SeenBook = {
    snapshot: {
      companies: { id: string; no_followup_by?: string | null; bankrupt_declared_by?: string | null }[]
    }
  }

  const post = (who: ReturnType<typeof desktop>, ops: unknown[]) =>
    who.call('/api/data/ops', { method: 'POST', body: JSON.stringify({ ops }) })

  const companyIn = async (who: ReturnType<typeof desktop>, id: string) =>
    (await read<SeenBook>(await who.call('/api/data'))).snapshot.companies.find((c) => c.id === id)

  beforeAll(async () => {
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    await post(niki, [
      { method: 'upsertCompany', args: [company('decide-mine', 'coord-1')] },
      { method: 'upsertCompany', args: [company('decide-bankrupt', 'coord-1')] },
      { method: 'upsertCompany', args: [company('decide-leader', 'coord-1')] },
      { method: 'upsertCompany', args: [company('decide-hers', 'coord-4')] },
      // The team leader's own call on one of Pragati's accounts.
      { method: 'setNoFollowup', args: ['BP-decide-leader', 'decide-leader', 'admin-1', 'held by accounts'] },
    ])
  })

  const request = (id: string, entityId: string, kind: string, reason = 'written off by accounts') => ({
    id, kind, entityType: 'company', entityId, bpCode: `BP-${entityId}`, name: entityId, amount: 1000,
    reason, requestedBy: 'coord-1', requestedAt: '2026-10-07T10:00:00Z', status: 'pending',
  })
  type SeenRequests = { snapshot: { decisionRequests?: { id: string; status: string; requestedBy: string }[] } }

  it('cannot apply a decision herself - only ask, with a reason, about her own account', async () => {
    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')

    const direct = await post(pragati, [{ method: 'setNoFollowup', args: ['BP-decide-mine', 'decide-mine', 'coord-1', 'written off by accounts'] }])
    expect(direct.status).toBe(403)
    expect((await read<{ error: { message: string } }>(direct)).error.message).toMatch(/approval/)
    expect((await post(pragati, [{ method: 'declareCustomerBankrupt', args: ['company', 'decide-bankrupt', 'coord-1', 'NCLT petition'] }])).status).toBe(403)
    expect((await post(pragati, [{ method: 'clearNoFollowup', args: ['BP-decide-leader', 'decide-leader'] }])).status).toBe(403)

    expect((await post(pragati, [{ method: 'addDecisionRequest', args: [request('dr-short', 'decide-mine', 'no_followup', 'no')] }])).status).toBe(403)
    expect((await post(pragati, [{ method: 'addDecisionRequest', args: [request('dr-hers', 'decide-hers', 'no_followup')] }])).status).toBe(403)
    expect((await post(pragati, [{ method: 'addDecisionRequest', args: [request('dr-mine', 'decide-mine', 'no_followup')] }])).status).toBe(200)
    expect((await post(pragati, [{ method: 'addDecisionRequest', args: [request('dr-bankrupt', 'decide-bankrupt', 'bankrupt')] }])).status).toBe(200)
    expect((await post(pragati, [{ method: 'reviewDecisionRequest', args: ['dr-mine', 'approved', 'coord-1', 'x'] }])).status).toBe(403)

    // Nothing has changed yet.
    expect((await companyIn(pragati, 'decide-mine'))?.no_followup_by ?? null).toBeNull()
    expect((await companyIn(pragati, 'decide-leader'))?.no_followup_by).toBe('admin-1')
    const mine = (await read<SeenRequests>(await pragati.call('/api/data'))).snapshot.decisionRequests ?? []
    expect(mine.map((r) => r.id).sort()).toEqual(['dr-bankrupt', 'dr-mine'])
  })

  it('the team leader sees the requests and approves or rejects them', async () => {
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    const waiting = (await read<SeenRequests>(await niki.call('/api/data'))).snapshot.decisionRequests ?? []
    expect(waiting.filter((r) => r.status === 'pending').map((r) => r.id).sort()).toEqual(['dr-bankrupt', 'dr-mine'])

    // Approving is applying it in Pragati's name, then closing the request.
    const ok = await post(niki, [
      { method: 'setNoFollowup', args: ['BP-decide-mine', 'decide-mine', 'coord-1', 'written off by accounts'] },
      { method: 'reviewDecisionRequest', args: ['dr-mine', 'approved', 'admin-1', '2026-10-07T11:00:00Z'] },
      { method: 'reviewDecisionRequest', args: ['dr-bankrupt', 'rejected', 'admin-1', '2026-10-07T11:00:00Z', 'still paying'] },
    ])
    expect(ok.status).toBe(200)
    expect((await companyIn(niki, 'decide-mine'))?.no_followup_by).toBe('coord-1')
    expect((await companyIn(niki, 'decide-bankrupt'))?.bankrupt_declared_by ?? null).toBeNull()
    const done = (await read<SeenRequests>(await niki.call('/api/data'))).snapshot.decisionRequests ?? []
    expect(Object.fromEntries(done.map((r) => [r.id, r.status]))).toMatchObject({ 'dr-mine': 'approved', 'dr-bankrupt': 'rejected' })
  })

  it('the team leader marks a dispute, and it is recorded as one', async () => {
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    const res = await post(niki, [
      { method: 'setNoFollowup', args: ['BP-decide-hers', 'decide-hers', 'admin-1', 'rate difference', 'dispute'] },
    ])
    expect(res.status).toBe(200)
    const seen = (await read<{ snapshot: { companies: { id: string; no_followup_kind?: string | null; no_followup_by?: string | null }[] } }>(
      await niki.call('/api/data')
    )).snapshot.companies.find((c) => c.id === 'decide-hers')
    expect(seen).toMatchObject({ no_followup_by: 'admin-1', no_followup_kind: 'dispute' })
  })
})

describe('anything not on the list', () => {
  it('is refused, whoever asks', async () => {
    const niki = desktop()
    await niki.signIn('niki', 'Niki@123')
    for (const method of ['replaceAll', 'resetToSeeds', 'persist', 'constructor', '__proto__']) {
      const res = await niki.call('/api/data/ops', {
        method: 'POST',
        body: JSON.stringify({ ops: [{ method, args: [] }] }),
      })
      expect(res.status, `${method} should not be callable`).toBe(400)
    }
  })

  it('refuses the whole batch if one operation in it is not allowed', async () => {
    const pragati = desktop()
    await pragati.signIn('pragati', 'Pragati@123')
    const before = await read<Seen>(await pragati.call('/api/data'))

    const res = await pragati.call('/api/data/ops', {
      method: 'POST',
      body: JSON.stringify({
        ops: [
          { method: 'addAuditEntry', args: [{ entity_type: 'company', entity_id: 'hers', action: 'view' }] },
          { method: 'upsertCompany', args: [company('sneaked-in', 'coord-1')] },
        ],
      }),
    })

    expect(res.status).toBe(403)
    const after = await read<Seen>(await pragati.call('/api/data'))
    // Nothing from the batch was applied, not even the allowed half.
    expect(after.snapshot.companies.map((c: { id: string }) => c.id)).not.toContain('sneaked-in')
    expect(after.version).toBe(before.version)
  })
})
