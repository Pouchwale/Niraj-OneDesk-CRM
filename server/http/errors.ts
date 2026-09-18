/**
 * How the API fails.
 *
 * Anything a route throws lands here and leaves as the one error shape the
 * contract promises. Two rules: the caller is told what they can act on, and
 * never anything about the inside of the server; and every failure carries the
 * request id, so a user's "it said something went wrong at 11:40" finds the
 * exact log line.
 */

import type { NextFunction, Request, Response } from 'express'
import type { ApiErrorBody, ApiErrorCode } from '../../shared/api'
import type { Logger } from '../logger'

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  not_configured: 503,
  rate_limited: 429,
  upstream_failed: 502,
  internal: 500,
}

/**
 * A failure with a message meant for the person reading it.
 *
 * `cause` is kept for the log and never sent, so the wording the user sees is
 * always deliberate rather than whatever a library happened to throw.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS[code]
  }

  static badRequest(message: string) {
    return new ApiError('bad_request', message)
  }
  /** Not signed in, or the session has expired. */
  static unauthorized(message: string) {
    return new ApiError('unauthorized', message)
  }
  /** Signed in, but this is not theirs to reach. */
  static forbidden(message: string) {
    return new ApiError('forbidden', message)
  }
  static notFound(message: string) {
    return new ApiError('not_found', message)
  }
  static notConfigured(message: string) {
    return new ApiError('not_configured', message)
  }
  static upstream(message: string, cause?: unknown) {
    return new ApiError('upstream_failed', message, { cause })
  }
}

export function errorBody(code: ApiErrorCode, message: string, requestId?: string): ApiErrorBody {
  return { error: { code, message, ...(requestId ? { requestId } : {}) } }
}

export function notFoundHandler(req: Request, res: Response): void {
  // originalUrl, not path: the router is mounted under /api, and quoting the
  // half it can see would send somebody looking for the wrong route.
  const route = req.originalUrl.split('?')[0]
  res.status(404).json(errorBody('not_found', `No API route matches ${req.method} ${route}.`, res.locals.requestId))
}

/**
 * The last line of defence.
 *
 * An unrecognised throw is logged in full and reported as a flat "something
 * went wrong": if the server does not know what happened, it cannot honestly
 * tell the caller how to fix it, and guessing invites them to act on a lie.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      // A stream already started; ending it is all that is left.
      next(err)
      return
    }

    const requestId = res.locals.requestId as string | undefined
    const log = logger.child({ requestId, method: req.method, path: req.path })

    if (err instanceof ApiError) {
      // Expected failures are the normal course of events, not incidents.
      log[err.status >= 500 ? 'error' : 'warn'](err.message, {
        code: err.code,
        status: err.status,
        cause: err.cause instanceof Error ? err.cause.message : undefined,
      })
      res.status(err.status).json(errorBody(err.code, err.message, requestId))
      return
    }

    log.error('Unhandled failure', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    res
      .status(500)
      .json(errorBody('internal', 'Something went wrong on the server. The team has been given the details.', requestId))
  }
}
