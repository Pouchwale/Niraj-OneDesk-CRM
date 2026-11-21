/**
 * The score history over the wire (6 Nov 2026). Everyone signed in reads it:
 * the team leader and the administrator get the whole team, a coordinator
 * only their own lines. Only the administrator can work a locked period out
 * again, or set the final score ratio (14 Nov 2026).
 */

import { Router, type NextFunction, type Request, type Response } from 'express'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import { requireRole } from '../auth/middleware'
import { lockGraceDays, type FinalWeights, type PeriodKind, type PeriodScores, type ScoreGroup, type ScoreHistoryResponse } from '../../../src/lib/score-history'
import { toLocalISODate } from '../../../src/lib/utils'
import type { ScoreHistoryStore } from './store'

const KINDS: PeriodKind[] = ['week', 'month', 'year']

/** A coordinator sees only their own lines, and only their own ratio. */
function ownLines(p: PeriodScores, userId: string): PeriodScores {
  const { personWeights, personGroupWeights, ...rest } = p
  const mine = personWeights?.[userId]
  const mineByGroup: NonNullable<PeriodScores['personGroupWeights']> = {}
  for (const [group, people] of Object.entries(personGroupWeights ?? {}) as [ScoreGroup, Record<string, FinalWeights>][]) {
    if (people[userId]) mineByGroup[group] = { [userId]: people[userId] }
  }
  return {
    ...rest,
    entries: p.entries.filter((e) => e.coordinatorId === userId),
    ...(mine ? { personWeights: { [userId]: mine } } : {}),
    ...(Object.keys(mineByGroup).length ? { personGroupWeights: mineByGroup } : {}),
  }
}
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
        graceDays: lockGraceDays(kind),
        periods: store.periods(kind, count).map((p) => (seesTeam ? p : ownLines(p, user.id))),
        finalRatios: store.finalRatios(),
        scoreGroups: store.scoreGroups(),
        // Who has a ratio of their own is for the team leader and the administrator.
        ...(seesTeam ? { personRatios: store.personRatios() } : {}),
        leadTargets: store.leadTargets(),
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

  // The final score ratios by dates (14 Nov 2026): the administrator adds, changes and removes them.
  const saveRatio = (id?: string) => (req: Request, res: Response, next: NextFunction) => {
    try {
      let ratio
      try {
        ratio = store.saveFinalRatio(req.body, req.user!.id, id ?? (req.params.id ? String(req.params.id) : undefined))
      } catch (err) {
        next(ApiError.badRequest(err instanceof Error ? err.message : 'That ratio cannot be used.'))
        return
      }
      logger.info('score history: final score ratio saved', { from: ratio.from, to: ratio.to, weights: ratio.weights, by: req.user!.id })
      res.json({ ratio, finalRatios: store.finalRatios() })
    } catch (err) {
      next(err)
    }
  }
  // Self Leads targets by dates (16 Nov 2026): the administrator adds, changes and removes them.
  const saveTarget = (req: Request, res: Response, next: NextFunction) => {
    let target
    try {
      target = store.saveLeadTarget(req.body, req.user!.id, req.params.id ? String(req.params.id) : undefined)
    } catch (err) {
      next(ApiError.badRequest(err instanceof Error ? err.message : 'That target cannot be used.'))
      return
    }
    logger.info('score history: self leads target saved', { from: target.from, to: target.to, full: target.full, partial: target.partial, by: req.user!.id })
    res.json({ target, leadTargets: store.leadTargets() })
  }
  router.post('/lead-targets', requireRole(), saveTarget)
  router.put('/lead-targets/:id', requireRole(), saveTarget)
  router.delete('/lead-targets/:id', requireRole(), (req, res, next) => {
    if (!store.deleteLeadTarget(String(req.params.id))) {
      next(ApiError.notFound('That target is not there any more.'))
      return
    }
    logger.info('score history: self leads target removed', { id: req.params.id, by: req.user!.id })
    res.json({ leadTargets: store.leadTargets() })
  })

  // Which of the two scores each module counts in (21 Nov 2026): the administrator's.
  router.put('/groups', requireRole(), (req, res, next) => {
    let scoreGroups
    try {
      scoreGroups = store.saveScoreGroups((req.body as { groups?: unknown } | undefined)?.groups)
    } catch (err) {
      next(ApiError.badRequest(err instanceof Error ? err.message : 'Those groups cannot be used.'))
      return
    }
    logger.info('score history: score groups saved', { scoreGroups, by: req.user!.id })
    res.json({ scoreGroups })
  })

  // Ratios for particular coordinators (20 Nov 2026): the administrator adds, changes and removes them.
  const savePerson = (req: Request, res: Response, next: NextFunction) => {
    let ratio
    try {
      ratio = store.savePersonRatio(req.body, req.user!.id, req.params.id ? String(req.params.id) : undefined)
    } catch (err) {
      next(ApiError.badRequest(err instanceof Error ? err.message : 'That ratio cannot be used.'))
      return
    }
    logger.info('score history: per-person ratio saved', { id: ratio.id, coordinators: ratio.coordinatorIds, weights: ratio.weights, by: req.user!.id })
    res.json({ ratio, personRatios: store.personRatios() })
  }
  router.post('/person-ratios', requireRole(), savePerson)
  router.put('/person-ratios/:id', requireRole(), savePerson)
  router.delete('/person-ratios/:id', requireRole(), (req, res, next) => {
    if (!store.deletePersonRatio(String(req.params.id))) {
      next(ApiError.notFound('That ratio is not there any more.'))
      return
    }
    logger.info('score history: per-person ratio removed', { id: req.params.id, by: req.user!.id })
    res.json({ personRatios: store.personRatios() })
  })

  router.post('/ratios', requireRole(), saveRatio())
  router.put('/ratios/:id', requireRole(), saveRatio())
  router.delete('/ratios/:id', requireRole(), (req, res, next) => {
    try {
      if (!store.deleteFinalRatio(String(req.params.id))) {
        next(ApiError.notFound('That ratio is not there any more.'))
        return
      }
      logger.info('score history: final score ratio removed', { id: req.params.id, by: req.user!.id })
      res.json({ finalRatios: store.finalRatios() })
    } catch (err) {
      next(err)
    }
  })

  return router
}
