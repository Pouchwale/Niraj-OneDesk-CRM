/**
 * The score history over the wire (6 Nov 2026). Everyone signed in reads it:
 * the team leader and the administrator get the whole team, a coordinator
 * only their own lines. Only the administrator can work a locked period out
 * again.
 */

import { Router } from 'express'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import { requireRole } from '../auth/middleware'
import { LOCK_GRACE_DAYS, type PeriodKind, type ScoreHistoryResponse } from '../../../src/lib/score-history'
import { toLocalISODate } from '../../../src/lib/utils'
import type { ScoreHistoryStore } from './store'

const KINDS: PeriodKind[] = ['week', 'month', 'year']
const DEFAULT_COUNT: Record<PeriodKind, number> = { week: 12, month: 12, year: 10 }

export function scoreHistoryRoutes(store: ScoreHistoryStore, logger: Logger): Router {
  const router = Router()

  router.get('/', (req, res, next) => {
    try {
      const user = req.user!
      const kind = KINDS.includes(req.query.kind as PeriodKind) ? (req.query.kind as PeriodKind) : 'week'
      const count = Number(req.query.count) || DEFAULT_COUNT[kind]
      const seesTeam = user.role === 'admin' || user.role === 'team_leader'
      const body: ScoreHistoryResponse = {
        kind,
        today: toLocalISODate(new Date()),
        graceDays: LOCK_GRACE_DAYS,
        periods: store.periods(kind, count).map((p) => ({ ...p, entries: seesTeam ? p.entries : p.entries.filter((e) => e.coordinatorId === user.id) })),
      }
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  router.post('/recalculate', requireRole(), (req, res, next) => {
    try {
      const id = String((req.body as { id?: unknown } | undefined)?.id ?? '')
      const period = store.relock(id, req.user!.id)
      if (!period) {
        next(ApiError.badRequest('That period is not locked yet, so it is already worked out from today’s records.'))
        return
      }
      logger.info('score history: period worked out again', { id, by: req.user!.id })
      res.json(period)
    } catch (err) {
      next(err)
    }
  })

  return router
}
