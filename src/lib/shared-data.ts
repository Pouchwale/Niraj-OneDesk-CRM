/**
 * The browser's end of the shared working dataset.
 *
 * The records live on the office machine now. This keeps a copy of whatever
 * the signed-in person is allowed to see, applies their changes to it at once
 * so the screen never feels like it is waiting, and sends those changes on to
 * the server, which is the only thing that actually decides anything.
 *
 * Three jobs, and each is there for a reason a deployment would otherwise
 * teach the hard way:
 *
 *   Sending changes in batches, because importing the workbook is one call per
 *   row and four thousand round trips would take minutes.
 *
 *   Asking "has anything changed?" on a timer, because Krina logging a call on
 *   her desktop has to reach Niki's screen without anybody pressing reload.
 *
 *   Re-reading the records after every change, because the server is the one
 *   that decides what a change actually did — and if it refuses one, this
 *   browser must not go on showing something that never happened.
 */

import { ROUTES } from '@shared/api'
import { demoCompanyStore, forwardOpsTo, isImporting, type PersistedStore } from './demo-companies'

/** How often to ask whether somebody else has changed something. */
const WATCH_MS = 5000

interface Operation {
  method: string
  args: unknown[]
}

interface DataResponse {
  version: number
  snapshot: PersistedStore
  /** Every account still owed, whoever owns it. Keys only, no records. */
  owedKeys: string[]
}

let queue: Operation[] = []
let sending: Promise<void> | null = null
let version = -1
let owed = new Set<string>()
let watcher: number | null = null
let onTrouble: ((message: string) => void) | null = null

/** Accounts still owed across the whole book — not only this person's. */
export function sharedOwedKeys(): Set<string> {
  return owed
}

/** Told when the server refuses a change, so a screen can say so out loud. */
export function onSharedDataError(listener: ((message: string) => void) | null): void {
  onTrouble = listener
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `The server refused that (${response.status}).`)
  }
  return (await response.json()) as T
}

/** Reads everything this account may see and adopts it. */
export async function loadSharedData(): Promise<void> {
  const data = await json<DataResponse>(ROUTES.data)
  version = data.version
  owed = new Set(data.owedKeys)
  demoCompanyStore.replaceAll(data.snapshot)
}

/**
 * Sends what is waiting, then re-reads the records.
 *
 * The re-read is the important half. This browser applied the change
 * optimistically; the server is what decides. If it refused — a coordinator
 * trying to retire a row, say — re-reading is what takes the change back off
 * the screen instead of leaving a comfortable lie on it.
 */
async function flush(): Promise<void> {
  if (queue.length === 0) return
  const ops = queue
  queue = []

  try {
    const result = await json<{ version: number }>(ROUTES.dataOps, {
      method: 'POST',
      body: JSON.stringify({ ops }),
    })
    version = result.version
    await loadSharedData()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      // Put the screen back to what is actually true.
      await loadSharedData()
    } catch {
      // The server is unreachable; the watcher will catch up when it returns.
    }
    onTrouble?.(message)
    throw new Error(message)
  }
}

/**
 * Sends whatever is waiting, once the current tick is done.
 *
 * An import calls this once per row within a single run of work, so waiting a
 * tick is what turns thousands of calls into one request rather than thousands
 * of them. Anything queued while a send is in flight goes in the next one.
 */
async function quiet(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  /*
   * Never mid-import. An import calls this thousands of times while reading
   * its own work as it goes, and flushing re-reads the records from the
   * server — which would replace the half-built picture the import is still
   * working on. Waiting also turns the whole import into one request.
   */
  while (isImporting()) await new Promise((resolve) => setTimeout(resolve, 50))
}

function schedule(): void {
  if (sending) return
  sending = quiet()
    .then(flush)
    .catch(() => {
      // Already reported through onTrouble. Nothing here may become an
      // unhandled rejection and take the page down with it.
    })
    .finally(() => {
      sending = null
      if (queue.length > 0) schedule()
    })
}

function enqueue(method: string, args: unknown[]): void {
  queue.push({ method, args })
  schedule()
}

/**
 * Watches for other people's work.
 *
 * A version number is cheap to ask for and cheap to answer, so this can run
 * often without putting the whole book on the wire every few seconds.
 */
function watch(): void {
  if (watcher !== null) return
  watcher = window.setInterval(async () => {
    // Never while our own changes are in flight: the answer would be about to
    // change anyway, and the reload would fight the flush.
    if (sending || queue.length > 0) return
    try {
      const now = await json<{ version: number }>(ROUTES.dataVersion)
      if (now.version !== version) await loadSharedData()
    } catch {
      // Server down or asleep: keep the screen as it is and try again.
    }
  }, WATCH_MS)
}

/**
 * Points the working dataset at the server.
 *
 * Called once, after sign-in. Until it is, nothing has been loaded and the
 * store holds whatever it started with.
 */
export async function useSharedData(): Promise<void> {
  // The session is re-checked every few minutes and whenever the tab is looked
  // at again; that must not drag the whole book down the wire each time. The
  // watcher already keeps this copy current.
  if (watcher !== null) return
  forwardOpsTo(enqueue)
  await loadSharedData()
  watch()
}

/** Stops watching, on sign-out. */
export function stopSharedData(): void {
  if (watcher !== null) {
    window.clearInterval(watcher)
    watcher = null
  }
  forwardOpsTo(null)
  version = -1
  owed = new Set()
}
