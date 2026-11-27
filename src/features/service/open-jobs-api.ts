/**
 * The inventory app's open jobs, as the server reads them (server/modules/open-jobs).
 * One copy for the whole page: the Service page and Robi's pop-up share it,
 * read when first wanted and again every five minutes while anyone looks.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { OPEN_JOBS_ROUTE, type OpenJobsResponse } from '../../../shared/open-jobs'

export const OPEN_JOBS_POLL_MS = 5 * 60 * 1000

export interface OpenJobsState {
  loading: boolean
  data: OpenJobsResponse | null
  error: string | null
}

let state: OpenJobsState = { loading: false, data: null, error: null }
const listeners = new Set<() => void>()
let users = 0
let timer: number | null = null
let inFlight: Promise<void> | null = null

const set = (next: Partial<OpenJobsState>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export async function getOpenJobs(): Promise<OpenJobsResponse> {
  let response: Response
  try {
    response = await fetch(OPEN_JOBS_ROUTE)
  } catch {
    throw new Error('The server is not answering.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? 'The server refused that.')
  return body as OpenJobsResponse
}

/** Read the open jobs again now (one read at a time). */
export function refreshOpenJobs(): Promise<void> {
  inFlight ??= (async () => {
    set({ loading: true })
    try {
      set({ data: await getOpenJobs(), error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Could not read the open jobs.' })
    } finally {
      set({ loading: false })
      inFlight = null
    }
  })()
  return inFlight
}

/** The open jobs, read on first use and every five minutes while something shows them. */
export function useOpenJobs(enabled = true): OpenJobsState {
  useEffect(() => {
    if (!enabled) return
    users++
    if (users === 1) {
      void refreshOpenJobs()
      timer = window.setInterval(() => void refreshOpenJobs(), OPEN_JOBS_POLL_MS)
    }
    return () => {
      users--
      if (users === 0 && timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    }
  }, [enabled])
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

/** Forget what was read (sign-out). */
export function resetOpenJobs(): void {
  state = { loading: false, data: null, error: null }
  listeners.forEach((l) => l())
}
