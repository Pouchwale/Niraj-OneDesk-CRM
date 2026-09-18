import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'

import { ApiError, errorBody, errorHandler, notFoundHandler } from './errors'
import { createLogger } from '../logger'

function fakeResponse(headersSent = false) {
  const state = { status: 0, body: undefined as unknown, headersSent }
  const res = {
    get headersSent() {
      return state.headersSent
    },
    locals: { requestId: 'req-1' },
    status(code: number) {
      state.status = code
      return this
    },
    json(body: unknown) {
      state.body = body
      return this
    },
  }
  return { res: res as unknown as Response, state }
}

const request = { method: 'GET', path: '/companies', originalUrl: '/api/companies?page=2' } as Request
const lines: string[] = []
const logger = createLogger({ level: 'debug', json: true, write: (line) => lines.push(line) })

describe('ApiError', () => {
  it('carries the status its kind of failure deserves', () => {
    expect(ApiError.badRequest('x').status).toBe(400)
    expect(ApiError.notFound('x').status).toBe(404)
    expect(ApiError.notConfigured('x').status).toBe(503)
    expect(ApiError.upstream('x').status).toBe(502)
  })

  it('keeps the underlying cause for the log without putting it in the message', () => {
    const error = ApiError.upstream('The assistant is unavailable.', new Error('ECONNREFUSED 10.0.0.5'))
    expect(error.message).not.toContain('10.0.0.5')
    expect((error.cause as Error).message).toContain('10.0.0.5')
  })
})

describe('errorBody', () => {
  it('is the one shape, with the request id only when there is one', () => {
    expect(errorBody('bad_request', 'Nope.', 'req-1')).toEqual({
      error: { code: 'bad_request', message: 'Nope.', requestId: 'req-1' },
    })
    expect(errorBody('internal', 'Nope.')).toEqual({ error: { code: 'internal', message: 'Nope.' } })
  })
})

describe('notFoundHandler', () => {
  it('names the route that does not exist', () => {
    const { res, state } = fakeResponse()
    notFoundHandler(request, res)
    expect(state.status).toBe(404)
    expect(state.body).toMatchObject({ error: { code: 'not_found', message: expect.stringContaining('/api/companies') } })
  })
})

describe('errorHandler', () => {
  it('passes a deliberate failure through with its own words', () => {
    const { res, state } = fakeResponse()
    errorHandler(logger)(ApiError.notConfigured('No Excel file is connected.'), request, res, vi.fn())

    expect(state.status).toBe(503)
    expect(state.body).toEqual({
      error: { code: 'not_configured', message: 'No Excel file is connected.', requestId: 'req-1' },
    })
  })

  it('never tells the caller what broke inside, but writes it all down', () => {
    lines.length = 0
    const { res, state } = fakeResponse()
    errorHandler(logger)(new Error('ENOENT /srv/secrets/private.key'), request, res, vi.fn())

    expect(state.status).toBe(500)
    expect(JSON.stringify(state.body)).not.toContain('private.key')
    expect(state.body).toMatchObject({ error: { code: 'internal', requestId: 'req-1' } })
    // The detail the team needs is in the log, correlated by the same id.
    expect(lines.join('')).toContain('private.key')
    expect(lines.join('')).toContain('req-1')
  })

  it('hands back a failure that arrives after the reply started', () => {
    const next = vi.fn()
    const { res, state } = fakeResponse(true)
    errorHandler(logger)(new Error('mid-stream'), request, res, next as unknown as NextFunction)

    // Nothing can be written to a response already on the wire.
    expect(next).toHaveBeenCalled()
    expect(state.status).toBe(0)
  })
})
