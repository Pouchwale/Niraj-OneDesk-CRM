/**
 * The Overdue book week by week, for the Trends tab on Overdue Payments.
 *
 * Read-only, and for everyone signed in: a team leader or administrator gets
 * the whole team, a coordinator only their own figures - the same split as
 * the Overdue list itself.
 */

import { Router } from 'express'
import { pickWeekly, type AgeingTrendResponse } from '../../../src/lib/ageing-trend'
import type { AgeingTrendStore } from './store'

export function ageingTrendRoutes(store: AgeingTrendStore): Router {
  const router = Router()

  router.get('/', (req, res, next) => {
    try {
      const user = req.user
      const seesTeam = user?.role === 'admin' || user?.role === 'team_leader'
      const body: AgeingTrendResponse = {
        weeks: pickWeekly(store.days()).map((day) => ({
          dayId: day.id,
          savedAt: day.savedAt,
          weekStart: day.weekStart,
          rows: seesTeam ? day.rows : day.rows.filter((r) => r.coordinatorId === user?.id),
        })),
      }
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  return router
}
