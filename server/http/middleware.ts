/**
 * The pipeline every request passes through.
 *
 * Order matters and is set in app.ts: an id first, so everything after it can
 * be correlated; then security headers; then the log line; then the routes.
 */

import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import type { ServerConfig } from '../config'
import type { Logger } from '../logger'
import { errorBody } from './errors'

export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Gives every request an id, reusing the caller's when there is one so a trace
 * survives a proxy in front of us.
 */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.get(REQUEST_ID_HEADER)
    // Only accept an id that is safe to put in a log and a header.
    const id = incoming && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID()
    res.locals.requestId = id
    res.setHeader(REQUEST_ID_HEADER, id)
    next()
  }
}

/** One line per finished request, with how long it took. */
export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint()

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6
      const fields = {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(ms),
      }
      // A failure is worth a person's attention; a healthy request is not.
      if (res.statusCode >= 500) logger.error('request failed', fields)
      else if (res.statusCode >= 400) logger.warn('request rejected', fields)
      else logger.debug('request', fields)
    })

    next()
  }
}

/**
 * A budget for the routes that cost money.
 *
 * Every model call is billed, so an accidental loop in a browser tab is a bill
 * as well as a load problem. The limit is per client and per minute.
 */
export function aiRateLimiter(config: ServerConfig) {
  return rateLimit({
    windowMs: 60_000,
    limit: config.aiRateLimitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json(
          errorBody(
            'rate_limited',
            'Too many questions in a short time. Wait a moment and try again.',
            res.locals.requestId
          )
        )
    },
  })
}

/**
 * Which origins may call the API from a browser.
 *
 * Same-origin by default: the server hosts the app it serves, so no origin
 * needs listing unless the front end is deployed somewhere else on purpose.
 */
export function cors(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('origin')
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', `Content-Type,${REQUEST_ID_HEADER}`)
      res.setHeader('Access-Control-Max-Age', '600')
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(origin && config.corsOrigins.includes(origin) ? 204 : 403)
      return
    }
    next()
  }
}
