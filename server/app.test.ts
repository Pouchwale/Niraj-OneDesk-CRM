/**
 * The API as a caller actually meets it: a real socket, real middleware, real
 * status codes. Unit tests cover the pieces; this covers the wiring, which is
 * where a production server usually goes wrong.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'

import { createApp } from './app'
import { loadConfig, type RawEnv } from './config'
import { createLogger } from './logger'
import { EXCEL_HEADERS, ROUTES } from '../shared/api'
import { AUTH_ROUTES } from '../shared/auth'
import { INITIAL_PASSWORDS_FILE } from './modules/auth/seed'

const dir = mkdtempSync(join(tmpdir(), 'app-test-'))
const workbook = join(dir, 'active payment.xlsx')
writeFileSync(workbook, 'workbook bytes')

const quiet = createLogger({ level: 'error', write: () => undefined })

function groqReply(chunks: string[]) {
  const encoder = new TextEncoder()
  return async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
      { status: 200 }
    )
}

/**
 * Starts the app on an ephemeral port and returns a fetch bound to it.
 *
 * Its accounts go in a temporary folder of their own, so a test run never
 * writes to the deployment's roster, and `call` carries the session cookie once
 * `signIn` has been used — every route but health now asks for one.
 */
async function start(env: RawEnv, deps = {}) {
  const authDir = mkdtempSync(join(dir, 'auth-'))
  // The starting passwords live beside the accounts rather than in the
  // repository, so a fresh auth folder needs the list a new machine would get.
  writeFileSync(
    join(authDir, INITIAL_PASSWORDS_FILE),
    JSON.stringify({ 'admin-0': 'Owner@Test1', 'admin-1': 'Leader@Test1', 'coord-1': 'Coord@Test1' }),
    'utf8'
  )
  const app = createApp(loadConfig({ AUTH_DIR: authDir, ...env }), quiet, deps)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const at = (path: string) => `http://127.0.0.1:${port}${path}`
  let cookie = ''

  const withoutSession = (path: string, init?: RequestInit) => fetch(at(path), init)

  return {
    server,
    withoutSession,
    call: (path: string, init?: RequestInit) =>
      fetch(at(path), {
        ...init,
        headers: { ...(init?.headers ?? {}), ...(cookie ? { cookie } : {}) },
      }),
    async signIn(username = 'admin', password = 'Owner@Test1') {
      const res = await fetch(at(AUTH_ROUTES.login), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const header = res.headers.get('set-cookie')
      if (header) cookie = header.split(';')[0]
      return res
    },
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

let api: Awaited<ReturnType<typeof start>>

beforeAll(async () => {
  api = await start({ EXCEL_ACTIVE_PAYMENTS_PATH: workbook, EXCEL_ACTIVE_PAYMENTS_SHEET: 'Sheet1' })
  await api.signIn()
})

afterAll(async () => {
  await api.stop()
  rmSync(dir, { recursive: true, force: true })
})

describe('health and readiness', () => {
  it('answers a liveness check without touching anything else', async () => {
    const res = await api.call(ROUTES.health)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })

  it('lists what is wired up, and is not ready while a book is missing', async () => {
    const res = await api.call(ROUTES.ready)
    const body = (await res.json()) as { ready: boolean; checks: { name: string; ok: boolean }[] }

    const names = body.checks.map((check) => check.name)
    expect(names).toContain('assistant')
    expect(names).toContain('excel:companies')
    // No key configured in this environment, so it reports itself as not ready.
    expect(res.status).toBe(503)
    expect(body.checks.find((check) => check.name === 'excel:companies')?.ok).toBe(true)
  })

  it('calls out a setting nobody reads, which is nearly always a typo', async () => {
    const typo = await start({ EXCEL_ACTIVE_PAYMENY_PATH: workbook })
    const body = (await (await typo.call(ROUTES.ready)).json()) as {
      checks: { name: string; detail?: string }[]
    }
    expect(body.checks.find((check) => check.name === 'config')?.detail).toContain('EXCEL_ACTIVE_PAYMENY_PATH')
    await typo.stop()
  })
})

describe('errors', () => {
  it('answers an unknown API route in the one error shape', async () => {
    const res = await api.call('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } })
  })

  it('gives every response a request id, and keeps the caller\'s when sent', async () => {
    const fresh = await api.call(ROUTES.health)
    expect(fresh.headers.get('x-request-id')).toBeTruthy()

    const traced = await api.call(ROUTES.health, { headers: { 'x-request-id': 'trace-123' } })
    expect(traced.headers.get('x-request-id')).toBe('trace-123')
  })

  it('puts the request id in the error body, so a report finds its log line', async () => {
    const res = await api.call('/api/nope', { headers: { 'x-request-id': 'trace-404' } })
    expect(await res.json()).toMatchObject({ error: { requestId: 'trace-404' } })
  })
})

describe('signing in', () => {
  it('refuses everything except health until somebody signs in', async () => {
    const fresh = await start({ EXCEL_ACTIVE_PAYMENTS_PATH: workbook })

    expect((await fresh.withoutSession(ROUTES.health)).status).toBe(200)
    for (const route of [ROUTES.excelStatus, `${ROUTES.excelFile}?book=companies`, ROUTES.aiStatus, '/api/snapshots']) {
      const res = await fresh.withoutSession(route)
      expect(res.status, route).toBe(401)
      expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } })
    }

    await fresh.stop()
  })

  it('takes the password the team already uses, and says who signed in', async () => {
    const fresh = await start({ EXCEL_ACTIVE_PAYMENTS_PATH: workbook })

    const res = await fresh.signIn('niki', 'Leader@Test1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { id: string; role: string }; roster: unknown[] }
    expect(body.user).toMatchObject({ id: 'admin-1', role: 'team_leader' })
    expect(body.roster.length).toBeGreaterThan(5)
    // The session travels in a cookie no script can read.
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(JSON.stringify(body)).not.toMatch(/password/i)

    expect((await fresh.call(ROUTES.excelStatus)).status).toBe(200)
    await fresh.stop()
  })

  it('says the same thing for a wrong password as for no such person', async () => {
    const fresh = await start({ EXCEL_ACTIVE_PAYMENTS_PATH: workbook })

    const wrongPassword = await fresh.signIn('niki', 'not-her-password')
    const noSuchUser = await fresh.signIn('nobody', 'Leader@Test1')
    expect(wrongPassword.status).toBe(401)
    expect(noSuchUser.status).toBe(401)
    const refusal = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message
    expect(await refusal(wrongPassword)).toBe(await refusal(noSuchUser))

    await fresh.stop()
  })

  it('will not be talked into a session by an edited cookie', async () => {
    // The old way in: put a user id in storage and reload.
    const fresh = await start({ EXCEL_ACTIVE_PAYMENTS_PATH: workbook })

    for (const forged of ['crm_session=admin-0', 'crm_session=eyJzdWIiOiJhZG1pbi0wIn0.nope']) {
      const res = await fresh.withoutSession(ROUTES.excelStatus, { headers: { cookie: forged } })
      expect(res.status).toBe(401)
    }

    await fresh.stop()
  })

  it('keeps Weekly KPI to the team leader and the administrator', async () => {
    const fresh = await start({ EXCEL_ACTIVE_PAYMENTS_PATH: workbook })

    await fresh.signIn('pragati', 'Coord@Test1')
    const refused = await fresh.call('/api/snapshots')
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'forbidden' } })

    await fresh.signIn('niki', 'Leader@Test1')
    expect((await fresh.call('/api/snapshots')).status).toBe(200)

    await fresh.stop()
  })

  it('signs out, and the session stops working', async () => {
    const fresh = await start({ EXCEL_ACTIVE_PAYMENTS_PATH: workbook })
    await fresh.signIn()
    expect((await fresh.call(AUTH_ROUTES.me)).status).toBe(200)

    await fresh.call(AUTH_ROUTES.logout, { method: 'POST' })
    // The browser drops the cookie. Asking who is signed in is still a fair
    // question — the answer is simply nobody.
    const after = await fresh.withoutSession(AUTH_ROUTES.me)
    expect(after.status).toBe(200)
    expect(await after.json()).toEqual({ user: null, roster: [] })

    await fresh.stop()
  })
})

describe('the Excel routes', () => {
  it('reports both books, naming the file but never its path', async () => {
    const res = await api.call(ROUTES.excelStatus)
    const body = (await res.json()) as { books: Record<string, { name: string | null; configured: boolean }> }

    expect(body.books.companies).toMatchObject({ configured: true, exists: true, name: 'active payment.xlsx' })
    expect(body.books.overdue.configured).toBe(false)
    expect(JSON.stringify(body)).not.toContain(dir)
  })

  it('hands over the bytes with the timestamp the browser compares against', async () => {
    const res = await api.call(`${ROUTES.excelFile}?book=companies`)
    expect(res.status).toBe(200)
    expect(res.headers.get(EXCEL_HEADERS.name)).toBe(encodeURIComponent('active payment.xlsx'))
    expect(res.headers.get(EXCEL_HEADERS.sheet)).toBe('Sheet1')
    expect(Date.parse(res.headers.get(EXCEL_HEADERS.modifiedAt)!)).not.toBeNaN()
    expect(await res.text()).toBe('workbook bytes')
  })

  it('cannot be talked into reading a file of the caller\'s choosing', async () => {
    for (const book of ['../../.env.local', 'C:/Windows/win.ini', '']) {
      const res = await api.call(`${ROUTES.excelFile}?book=${encodeURIComponent(book)}`)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'bad_request' } })
    }
  })

  it('says which book is not connected rather than failing blankly', async () => {
    const res = await api.call(`${ROUTES.excelFile}?book=overdue`)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'not_configured' } })
  })
})

describe('the assistant routes', () => {
  it('reports honestly that no key is configured', async () => {
    expect(await (await api.call(ROUTES.aiStatus)).json()).toEqual({
      configured: false,
      provider: null,
      model: null,
    })
  })

  it('refuses a chat with a plain 503 when there is no key, not a broken stream', async () => {
    const res = await api.call(ROUTES.aiChat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: 'Robi', context: '', messages: [{ role: 'user', content: 'Hi' }] }),
    })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'not_configured' } })
  })

  it('refuses a body that would make a bad or expensive request', async () => {
    const post = (body: unknown) =>
      api.call(ROUTES.aiChat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

    const good = { system: 'Robi', context: '', messages: [{ role: 'user', content: 'Hi' }] }
    expect((await post({})).status).toBe(400)
    expect((await post({ ...good, messages: [] })).status).toBe(400)
    expect((await post({ ...good, messages: [{ role: 'assistant', content: 'Hello' }] })).status).toBe(400)
    expect((await post({ ...good, context: 'x'.repeat(120_001) })).status).toBe(400)
  })

  it('streams a reply as server-sent events when a key is configured', async () => {
    const withKey = await start(
      { GROQ_API_KEY: 'gsk_mock' },
      {
        ai: {
          fetch: groqReply([
            'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
            'data: [DONE]\n\n',
          ]),
        },
      }
    )
    await withKey.signIn()

    const res = await withKey.call(ROUTES.aiChat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: 'Robi', context: '', messages: [{ role: 'user', content: 'Hi' }] }),
    })

    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('data: {"type":"text","text":"Hello"}')
    expect(text).toContain('"type":"done"')
    await withKey.stop()
  })

  it('holds the model route to a budget, since every call is billed', async () => {
    const limited = await start({ AI_RATE_LIMIT_PER_MINUTE: '1' })
    await limited.signIn()
    const send = () =>
      limited.call(ROUTES.aiChat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: 'Robi', context: '', messages: [{ role: 'user', content: 'Hi' }] }),
      })

    await send()
    const second = await send()
    expect(second.status).toBe(429)
    expect(await second.json()).toMatchObject({ error: { code: 'rate_limited' } })

    // The free routes are unaffected: a busy assistant must not take the app down.
    expect((await limited.call(ROUTES.health)).status).toBe(200)

    /*
     * Including the assistant's own status route. It costs nothing - it says
     * whether a key is configured - and it is asked on every page load, so
     * metering it made a handful of quick reloads report the assistant as
     * offline for the rest of the minute.
     */
    expect((await limited.call(ROUTES.aiStatus)).status).toBe(200)
    expect((await limited.call(ROUTES.aiStatus)).status).toBe(200)
    expect((await limited.call(ROUTES.aiStatus)).status).toBe(200)
    await limited.stop()
  })
})

describe('the front end it serves', () => {
  it('sends index.html for an app route, and never caches it', async () => {
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Coordinator</title>')
    const hosted = await start({}, { staticDir: dir })

    const page = await hosted.call('/overdue-payments')
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Coordinator')
    expect(page.headers.get('cache-control')).toContain('no-cache')

    // An unknown API path is still an API error, not the HTML shell.
    expect((await hosted.call('/api/nope')).status).toBe(404)
    await hosted.stop()
  })
})

describe('security headers', () => {
  it('sets the headers a browser needs and hides what the server runs on', async () => {
    const res = await api.call(ROUTES.health)
    expect(res.headers.get('x-powered-by')).toBeNull()
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('allows no cross-origin caller unless one is configured', async () => {
    const res = await api.call(ROUTES.health, { headers: { Origin: 'https://evil.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()

    const open = await start({ CORS_ORIGINS: 'https://crm.example.com' })
    const allowed = await open.call(ROUTES.health, { headers: { Origin: 'https://crm.example.com' } })
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://crm.example.com')
    await open.stop()
  })
})

