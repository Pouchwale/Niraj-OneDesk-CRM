/**
 * GET /api/open-jobs: the inventory app's open jobs (source.ts). The team
 * leader and the administrator get every one; a coordinator gets only the
 * POs that are theirs, and none when Service is switched off for them.
 */

import { Router } from 'express'
import { moduleOn, type ModuleAccess } from '../../../shared/module-access'
import { seesCustomerUpdates } from '../../../shared/open-jobs'
import type { OpenJobsSource } from './source'

export function openJobsRoutes(source: OpenJobsSource, moduleAccess: () => readonly ModuleAccess[] | undefined): Router {
  const router = Router()
  router.get('/', async (req, res, next) => {
    try {
      const user = req.user!
      // Administrator only while it is verified (shared/open-jobs.ts); nothing is read for anyone else.
      if (!seesCustomerUpdates(user.role)) return void res.json({ configured: false, error: null, fetchedAt: null, jobs: [] })
      const body = await source.get()
      if (user.role === 'admin' || user.role === 'team_leader') return void res.json(body)
      const on = moduleOn(moduleAccess(), { id: user.id, role: user.role, module: user.module ?? null }, 'service')
      res.json({ ...body, jobs: on ? body.jobs.filter((j) => j.coordinatorId === user.id) : [] })
    } catch (err) {
      next(err)
    }
  })
  return router
}
