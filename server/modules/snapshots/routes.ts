/**
 * Weekly KPI's routes: saved Overdue days, the target percentage, and scores.
 *
 * Only ids that are plain letters, digits and hyphens ever reach the disk (see
 * store.ts), so nothing a request sends can read or delete a file outside the
 * snapshot folder. A day is the whole Overdue book, so this router reads its
 * own, larger request bodies.
 */

import express, { Router, type NextFunction, type Request, type Response } from 'express'
import type { ScoreResultListResponse, SnapshotListResponse } from '../../../shared/snapshots'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import { SnapshotInputError, type SnapshotStore } from './store'

type Handler = (req: Request, res: Response) => void

export function snapshotRoutes(store: SnapshotStore, logger: Logger): Router {
  const router = Router()
  router.use(express.json({ limit: '25mb' }))

  /** A request the store cannot accept is the person's to fix, so it says why. */
  const handle = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res)
    } catch (err) {
      next(err instanceof SnapshotInputError ? ApiError.badRequest(err.message) : err)
    }
  }

  const idOf = (req: Request) => String(req.params.id ?? '')

  router.get(
    '/',
    handle((_req, res) => {
      const body: SnapshotListResponse = { days: store.listDays(), settings: store.getSettings() }
      res.json(body)
    })
  )

  router.post(
    '/',
    handle((req, res) => {
      const day = store.saveDay(req.body)
      logger.info('weekly kpi: day saved', { id: day.id, rows: day.rowCount, coordinators: day.coordinatorCount, by: day.savedBy })
      res.status(201).json({ day })
    })
  )

  router.get(
    '/settings',
    handle((_req, res) => {
      res.json(store.getSettings())
    })
  )

  router.put(
    '/settings',
    handle((req, res) => {
      const body = (req.body ?? {}) as { percentage?: unknown; updatedBy?: unknown }
      const settings = store.saveSettings(body.percentage, body.updatedBy)
      logger.info('weekly kpi: target percentage set', { percentage: settings.percentage, by: settings.updatedBy })
      res.json(settings)
    })
  )

  router.get(
    '/results',
    handle((_req, res) => {
      const body: ScoreResultListResponse = { results: store.listResults() }
      res.json(body)
    })
  )

  router.post(
    '/results',
    handle((req, res) => {
      const result = store.saveResult(req.body)
      logger.info('weekly kpi: score generated', { id: result.id, by: result.generatedBy })
      res.status(201).json({ result })
    })
  )

  router.get(
    '/results/:id',
    handle((req, res) => {
      const result = store.getResult(idOf(req))
      if (!result) throw ApiError.notFound('That result is not there. Results are kept for three months.')
      res.json(result)
    })
  )

  router.delete(
    '/results/:id',
    handle((req, res) => {
      res.json({ removed: store.removeResult(idOf(req)) })
    })
  )

  router.get(
    '/:id',
    handle((req, res) => {
      const day = store.getDay(idOf(req))
      if (!day) throw ApiError.notFound('That saved day is not there. Saved days are kept for three months.')
      res.json(day)
    })
  )

  router.delete(
    '/:id',
    handle((req, res) => {
      const removed = store.removeDay(idOf(req))
      if (removed) logger.info('weekly kpi: day deleted', { id: idOf(req) })
      res.json({ removed })
    })
  )

  return router
}
