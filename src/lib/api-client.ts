/**
 * The browser's one way of talking to our server.
 *
 * Every call goes through here, so there is a single place that knows how a
 * failure is shaped, what a user-facing message looks like, and which request
 * id to quote when somebody reports a problem. Routes and types come from
 * `@shared/api`, which the server imports too: change a response there and
 * both sides stop compiling rather than disagreeing quietly at runtime.
 */

import type { ApiErrorBody, ApiErrorCode } from '@shared/api'

/** A failure the server described, carried with enough to act on it. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly requestId?: string

  constructor(message: string, options: { code?: ApiErrorCode; status: number; requestId?: string }) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = options.code ?? 'internal'
    this.status = options.status
    this.requestId = options.requestId
  }

  /** True when the route simply is not there — a static build, say. */
  get isMissingApi(): boolean {
    return this.status === 404 || this.status === 0
  }
}

/** Turns a failed response into the message the server meant us to show. */
export async function readApiError(res: Response): Promise<ApiRequestError> {
  const fallback = `The server answered ${res.status}.`
  try {
    const body = (await res.json()) as Partial<ApiErrorBody> & { error?: unknown }
    const error = body.error
    if (error && typeof error === 'object' && 'message' in error) {
      const shaped = error as ApiErrorBody['error']
      return new ApiRequestError(shaped.message || fallback, {
        code: shaped.code,
        status: res.status,
        requestId: shaped.requestId,
      })
    }
    // An older shape, or a proxy's own error page: use it if it is a string.
    if (typeof error === 'string' && error) {
      return new ApiRequestError(error, { status: res.status })
    }
  } catch {
    // Not JSON. The status is all we have.
  }
  return new ApiRequestError(fallback, { status: res.status })
}

/** A network failure, told apart from a server that answered with an error. */
function unreachable(err: unknown): ApiRequestError {
  if (err instanceof ApiRequestError) return err
  return new ApiRequestError(
    err instanceof Error && err.name === 'AbortError'
      ? 'The request was cancelled.'
      : 'Could not reach the server. Check that it is running.',
    { code: 'internal', status: 0 }
  )
}

export interface RequestOptions {
  signal?: AbortSignal
  /** Live figures must never come from a cache. */
  cache?: RequestCache
}

/** GETs JSON, or throws an ApiRequestError describing why it could not. */
export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: options.cache ?? 'no-store',
      signal: options.signal,
    })
  } catch (err) {
    throw unreachable(err)
  }

  if (!res.ok) throw await readApiError(res)
  return (await res.json()) as T
}

/** GETs raw bytes — a workbook, not JSON. Response headers stay readable. */
export async function apiGetRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(path, { method: 'GET', cache: options.cache ?? 'no-store', signal: options.signal })
  } catch (err) {
    throw unreachable(err)
  }

  if (!res.ok) throw await readApiError(res)
  return res
}

/** POSTs JSON and hands back the open response, for a streamed reply. */
export async function apiPost(path: string, body: unknown, options: RequestOptions = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    })
  } catch (err) {
    throw unreachable(err)
  }

  if (!res.ok) throw await readApiError(res)
  return res
}
