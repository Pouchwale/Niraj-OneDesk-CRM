/**
 * The working dataset over the wire.
 *
 * Three things a browser needs: give me everything I may see, tell me whether
 * anything has changed since, and do this on my behalf. Reads are scoped to
 * whoever asked — a coordinator is sent their own accounts and nobody else's,
 * which the old arrangement could not do because every browser held the whole
 * book and merely chose what to draw.
 */

import { Router } from 'express'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import { openAccountKeys } from '../../../src/features/assistant/daily-plan'
import { inBulk } from '../../../src/lib/demo-companies'
import type { DataStore } from './store'
import { accountRefusal, decisionRequestRefusal, isOperation, mayCall, planRefusal, proofRefusal } from './operations'

/** A coordinator sees their own accounts; everyone else sees the book. */
function scopedFor(store: DataStore, role: string, userId: string) {
  const snapshot = store.snapshot()
  /*
   * Which accounts are still owed, across the whole book and whoever owns
   * them. The daily plan needs this to tell an account that was dealt with
   * from one that simply moved to another coordinator, and a coordinator who
   * is only sent their own records cannot work it out for themselves. Keys
   * only: no names, no amounts.
   */
  const owedKeys = [...openAccountKeys(snapshot.companies, snapshot.overduePayments)]

  if (role !== 'coordinator') return { snapshot, owedKeys }

  const mine = {
    ...snapshot,
    companies: snapshot.companies.filter((c) => c.assigned_coordinator_id === userId),
    overduePayments: snapshot.overduePayments.filter((p) => p.assigned_coordinator_id === userId),
    followups: snapshot.followups.filter((f) => f.coordinator_id === userId),
    // Their own plans only; the team's record is the leader's to read.
    dailyPlans: (snapshot.dailyPlans ?? []).filter((p) => p.userId === userId),
    // Messages addressed to them, and nobody else's.
    messages: (snapshot.messages ?? []).filter((m) => m.toCoordinatorId === userId),
    proofRequests: (snapshot.proofRequests ?? []).filter((r) => r.coordinatorId === userId),
    decisionRequests: (snapshot.decisionRequests ?? []).filter((r) => r.requestedBy === userId),
    attendance: (snapshot.attendance ?? []).filter((a) => a.userId === userId),
    rfdRows: (snapshot.rfdRows ?? []).filter((r) => r.assigned_coordinator_id === userId),
    // The import's own paperwork is the leader's business, not theirs.
    uploads: [],
    uploadErrors: [],
    auditLog: [],
  }
  return { snapshot: mine, owedKeys }
}

export function dataRoutes(store: DataStore, logger: Logger): Router {
  const router = Router()

  /** Everything this account may see, and the revision it belongs to. */
  router.get('/', (req, res) => {
    const user = req.user!
    // Read the revision first: if a change lands between here and the
    // serialising below, the browser is told the older number and fetches
    // again, rather than being told it is current when it is not.
    const version = store.version()
    const { snapshot, owedKeys } = scopedFor(store, user.role, user.id)
    res.json({ version, snapshot, owedKeys })
  })

  /** Cheap enough to ask every few seconds: has anything happened? */
  router.get('/version', (_req, res) => {
    res.json({ version: store.version() })
  })

  /**
   * Do these to the records.
   *
   * A list rather than one at a time, because an import is one call per row:
   * four thousand rows would otherwise be four thousand round trips, and the
   * store already has a mode for exactly this (inBulk) that writes the file
   * once at the end instead of after every row.
   */
  router.post('/ops', async (req, res, next) => {
    const user = req.user!
    const body = (req.body ?? {}) as { ops?: unknown }
    const ops = body.ops

    if (!Array.isArray(ops) || ops.length === 0) {
      next(ApiError.badRequest('Send a list of operations.'))
      return
    }

    // Check every one before doing any: a refusal halfway through would leave
    // the records in a state nobody asked for.
    const checked: { method: string; args: unknown[] }[] = []
    for (const entry of ops) {
      const { method, args } = (entry ?? {}) as { method?: unknown; args?: unknown }
      if (!isOperation(method)) {
        next(ApiError.badRequest(`There is no such operation as "${String(method)}".`))
        return
      }
      if (!mayCall(user.role, method)) {
        logger.warn('data: operation refused', { method, user: user.id, role: user.role })
        next(ApiError.forbidden('Your account cannot do that.'))
        return
      }
      if (args !== undefined && !Array.isArray(args)) {
        next(ApiError.badRequest('Arguments must be a list.'))
        return
      }
      const book = { companies: store.snapshot().companies, overduePayments: store.snapshot().overduePayments }
      const refusal =
        accountRefusal(user.role, user.id, method, (args ?? []) as unknown[], book) ??
        decisionRequestRefusal(user.role, user.id, method, (args ?? []) as unknown[], book)
      if (refusal) {
        logger.warn('data: account decision refused', { method, user: user.id, refusal })
        next(ApiError.forbidden(refusal))
        return
      }
      const planned = planRefusal(user.role, user.id, method, (args ?? []) as unknown[])
      if (planned) {
        logger.warn('data: plan change refused', { method, user: user.id, refusal: planned })
        next(ApiError.forbidden(planned))
        return
      }
      const proof = proofRefusal(user.role, user.id, method, (args ?? []) as unknown[], store.snapshot().proofRequests ?? [])
      if (proof) {
        logger.warn('data: proof change refused', { method, user: user.id, refusal: proof })
        next(ApiError.forbidden(proof))
        return
      }
      checked.push({ method, args: (args ?? []) as unknown[] })
    }

    try {
      const { result, version } = await store.apply(async (s) => {
        const run = () => {
          const results: unknown[] = []
          for (const { method, args } of checked) {
            const fn = (s as unknown as Record<string, (...a: unknown[]) => unknown>)[method]
            if (typeof fn !== 'function') {
              throw ApiError.badRequest(`There is no such operation as "${method}".`)
            }
            results.push(fn.apply(s, args) ?? null)
          }
          return results
        }
        // One save at the end for a run of changes, rather than one per row.
        return checked.length > 1 ? inBulk(async () => run()) : run()
      })
      res.json({ version, results: result })
    } catch (err) {
      next(err)
    }
  })

  return router
}
