/**
 * Saved OTIF reports over the wire (14 Nov 2026). OTIF Analytics is the team
 * leader's and the administrator's screen, so they list, open and save
 * reports; only the administrator deletes one (the user's choice).
 */

import express, { Router } from 'express'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import { requireRole } from '../auth/middleware'
import type { OtifReportsStore } from './store'

export function otifReportRoutes(store: OtifReportsStore, logger: Logger): Router {
  const router = Router()
  // A report carries every order of its dates; a month of them is a few megabytes.
  router.use(express.json({ limit: '32mb' }))
  router.use(requireRole('team_leader'))

  router.get('/', (_req, res, next) => {
    try {
      res.json({ reports: store.list() })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id', (req, res, next) => {
    try {
      const report = store.get(String(req.params.id))
      if (!report) {
        next(ApiError.notFound('That saved report is not there any more.'))
        return
      }
      res.json(report)
    } catch (err) {
      next(err)
    }
  })

  router.post('/', (req, res, next) => {
    try {
      const user = req.user!
      let report
      try {
        report = store.save(req.body, { id: user.id, name: user.full_name || user.username || user.id })
      } catch (err) {
        next(ApiError.badRequest(err instanceof Error ? err.message : 'That report cannot be saved.'))
        return
      }
      logger.info('otif: report saved', { id: report.id, from: report.from, to: report.to, orders: report.rows.length, by: user.id })
      const { rows, ...summary } = report
      res.json({ ...summary, orders: rows.length })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/:id', requireRole(), (req, res, next) => {
    try {
      if (!store.remove(String(req.params.id))) {
        next(ApiError.notFound('That saved report is not there any more.'))
        return
      }
      logger.info('otif: report deleted', { id: req.params.id, by: req.user!.id })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
