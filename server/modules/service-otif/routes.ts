/**
 * GET /api/service-otif: the Service score's Total Customers from the OTIF
 * file, November 2026 on (source.ts). The scores are the team leader's and
 * the administrator's, so is this.
 */

import { Router } from 'express'
import { requireRole } from '../auth/middleware'
import type { OtifCustomerSource } from './source'

export function serviceOtifRoutes(source: OtifCustomerSource): Router {
  const router = Router()
  router.get('/', requireRole('team_leader'), (_req, res) => {
    res.json(source.get())
  })
  return router
}
