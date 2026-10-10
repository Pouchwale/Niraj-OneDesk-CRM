/**
 * Proof screenshots: a coordinator uploads one when Robi asks, the team leader
 * and the administrator look at it.
 *
 * Kept as files next to the working dataset rather than inside it - every
 * change rewrites store.json, and a day of screenshots would make each of
 * those writes megabytes. Names are made here, never taken from the request,
 * and start with the uploader's id, which is what lets a coordinator read
 * their own and nobody else's.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import express, { Router } from 'express'
import { ApiError } from '../../http/errors'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const NAME = /^[a-z0-9-]+\.(jpg|png|webp)$/i

export function proofRoutes(dir: string): Router {
  const router = Router()
  mkdirSync(dir, { recursive: true })

  router.post('/', express.raw({ type: Object.keys(TYPES), limit: '8mb' }), (req, res, next) => {
    const ext = TYPES[String(req.headers['content-type'] ?? '').split(';')[0].trim()]
    if (!ext || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      next(ApiError.badRequest('Attach a screenshot (JPG, PNG or WebP).'))
      return
    }
    const user = req.user!
    const name = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`.replace(/[^a-z0-9.-]/gi, '-')
    writeFileSync(join(dir, name), req.body)
    res.json({ url: `/api/proofs/${name}` })
  })

  router.get('/:name', (req, res, next) => {
    const name = String(req.params.name ?? '')
    const user = req.user!
    const seesAll = user.role === 'admin' || user.role === 'team_leader'
    if (!NAME.test(name) || (!seesAll && !name.startsWith(`${user.id}-`.replace(/[^a-z0-9.-]/gi, '-')))) {
      next(ApiError.forbidden('You cannot open that proof.'))
      return
    }
    const file = join(dir, name)
    if (!existsSync(file)) {
      next(ApiError.notFound('That proof is not on the server.'))
      return
    }
    // The live folder is `.crm-data/proofs`: without these, sendFile refuses any
    // path through a dot-folder, and every proof failed with a server error.
    res.sendFile(name, { root: dir, dotfiles: 'allow' })
  })

  return router
}
