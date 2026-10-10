/**
 * "Saved" has to mean the server has it.
 *
 * A change is drawn on screen at once and sent a moment later, so a form that
 * reports success when its call returns is reporting on the screen, not on the
 * records. That gap is where a follow-up goes missing, or gets typed in twice.
 * These pin down what whenSaved promises.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROUTES } from '@shared/api'
import { demoCompanyStore } from './demo-companies'
import { stopSharedData, useSharedData, whenSaved } from './shared-data'
import type { Followup } from './types'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let answerOps: () => Response | Promise<Response>
let answerData: () => Response | Promise<Response>
let posted: { ops: { method: string }[] }[]

const note = (id: string): Followup => ({
  id,
  entity_type: 'company',
  entity_id: 'comp-1',
  coordinator_id: 'coord-1',
  followup_date: '2026-09-16T10:00:00.000Z',
  mode: 'call',
  notes: 'Transfer confirmed',
  customer_response: null,
  committed_date: null,
  committed_amount: null,
  status: 'pending',
  proof_attachment_url: null,
  next_reminder_date: null,
  created_at: '2026-09-16T10:00:00.000Z',
  edited_at: null,
})

/** Lets the send timer fire and the request settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

beforeEach(async () => {
  posted = []
  answerData = () => json({ version: 1, snapshot: {}, owedKeys: [] })
  answerOps = () => json({ version: 2, results: [null] })

  // Node has no window; the watcher only needs a timer it never gets to run.
  vi.stubGlobal('window', { setInterval: () => 1, clearInterval: () => undefined })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ROUTES.dataOps) {
        posted.push(JSON.parse(String(init?.body)))
        return answerOps()
      }
      if (url === ROUTES.data) return answerData()
      throw new Error(`Unexpected request to ${url}`)
    })
  )
  await useSharedData()
})

afterEach(() => {
  stopSharedData()
  vi.unstubAllGlobals()
})

describe('waiting for the server to accept a change', () => {
  it('has nothing to wait for when nothing was changed', async () => {
    await expect(whenSaved()).resolves.toBeUndefined()
  })

  it('does not resolve until the server has answered', async () => {
    let answer!: () => void
    answerOps = () => new Promise((resolve) => (answer = () => resolve(json({ version: 2, results: [null] }))))

    demoCompanyStore.addFollowup(note('fu-wait'))
    let saved = false
    const waiting = whenSaved().then(() => (saved = true))

    await settle()
    expect(posted).toHaveLength(1)
    expect(posted[0].ops[0].method).toBe('addFollowup')
    expect(saved).toBe(false)

    answer()
    await waiting
    expect(saved).toBe(true)
  })

  it('rejects with the server’s own reason when it refuses', async () => {
    answerOps = () =>
      json({ error: { code: 'forbidden', message: 'You can only decide this for an account assigned to you.' } }, 403)

    demoCompanyStore.addFollowup(note('fu-refused'))

    await expect(whenSaved()).rejects.toThrow('You can only decide this for an account assigned to you.')
  })

  it('rejects when the server cannot be reached', async () => {
    answerOps = () => {
      throw new TypeError('Failed to fetch')
    }

    demoCompanyStore.addFollowup(note('fu-offline'))

    await expect(whenSaved()).rejects.toThrow('Failed to fetch')
  })

  it('counts as saved once accepted, even if reading the records back then fails', async () => {
    // Reporting this as a failure would have the coordinator enter it again.
    let reads = 0
    answerData = () => {
      reads++
      return json({ error: { code: 'internal', message: 'busy' } }, 500)
    }

    demoCompanyStore.addFollowup(note('fu-reread'))

    await expect(whenSaved()).resolves.toBeUndefined()
    await settle()
    expect(reads).toBeGreaterThan(0)
  })

  it('waits on a change already on the wire as well as one still queued', async () => {
    let answerFirst!: () => void
    let calls = 0
    answerOps = () => {
      calls++
      if (calls === 1) {
        return new Promise((resolve) => (answerFirst = () => resolve(json({ error: { message: 'refused' } }, 400))))
      }
      return json({ version: 3, results: [null] })
    }

    demoCompanyStore.addFollowup(note('fu-first'))
    await settle() // the first batch is now in flight
    demoCompanyStore.addFollowup(note('fu-second'))

    const both = whenSaved()
    answerFirst()

    // The later batch succeeding must not hide that the earlier one failed.
    await expect(both).rejects.toThrow('refused')
    await settle() // let the second batch finish before the next test
  })
})
