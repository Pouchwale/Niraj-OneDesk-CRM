/**
 * The live OTIF-SCORE file for OTIF Analytics, kept in step with the file the
 * way Active and Overdue Payments keep in step with theirs: the file's state
 * (connected, last saved), its rows (read off the page's thread,
 * read-otif.worker.ts), and "Auto-sync on save", which reads a new save by
 * itself within a few seconds. Reading only: nothing is imported or saved.
 *
 * The rows are kept while the app is open, so coming back to the page shows
 * them at once. A new read replaces them only once it has finished, so the
 * figures never go blank while the file is being read again.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { EXCEL_HEADERS, ROUTES } from '@shared/api'
import { ApiRequestError, apiGetRaw } from '@/lib/api-client'
import { getExcelStatus, type ExcelBookStatus } from '@/lib/excel-source'
import { compareReads, summariseRead, type OtifLiveRow, type OtifReadChange, type OtifReadResult } from '@/lib/otif-live'
import type { ReadOtifRequest } from './read-otif.worker'

export interface OtifLiveData {
  rows: OtifLiveRow[]
  sheetName: string
  fileName: string
  /** When the file was last saved, as the server saw it at this read. */
  modifiedAt: string | null
  /** Data rows in the sheet, and those left out for having no PO number. */
  total: number
  skipped: number
  /** When this page read the file. */
  readAt: string
  /** Against the read before it; null for the first read since the app opened. */
  change: OtifReadChange | null
}

/** How often the file's save time is checked: often while auto-sync is on (as the other books), now and then while it is off. */
const POLL_AUTO_MS = 10_000
const POLL_MS = 60_000
/** The same setting name the other books' switch uses ("crm.excel.watch.<book>"); on unless switched off. */
const WATCH_KEY = 'crm.excel.watch.otif'

let cached: OtifLiveData | null = null
let inflight: Promise<OtifLiveData> | null = null

function readAutoSync(): boolean {
  try {
    return localStorage.getItem(WATCH_KEY) !== 'false'
  } catch {
    return true
  }
}

function writeAutoSync(value: boolean): void {
  try {
    localStorage.setItem(WATCH_KEY, String(value))
  } catch {
    /* a preference, not data: carry on without remembering it */
  }
}

function readInWorker(buffer: ArrayBuffer, sheet: string | null): Promise<OtifReadResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./read-otif.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<OtifReadResult>) => {
      resolve(event.data)
      worker.terminate()
    }
    worker.onerror = (event) => {
      resolve({ ok: false, error: event.message || 'Could not read the OTIF file.' })
      worker.terminate()
    }
    const request: ReadOtifRequest = { buffer, sheet }
    worker.postMessage(request, [buffer])
  })
}

async function readLiveFile(previous: OtifLiveData | null): Promise<OtifLiveData> {
  let res: Response
  try {
    res = await apiGetRaw(`${ROUTES.excelFile}?book=otif`)
  } catch (err) {
    throw new Error(err instanceof ApiRequestError ? err.message : 'Could not reach the server.')
  }
  const fileName = decodeURIComponent(res.headers.get(EXCEL_HEADERS.name) ?? 'OTIF-SCORE.xlsm')
  const sheet = res.headers.get(EXCEL_HEADERS.sheet)
  const modifiedAt = res.headers.get(EXCEL_HEADERS.modifiedAt) || null
  const result = await readInWorker(await res.arrayBuffer(), sheet ? decodeURIComponent(sheet) : null)
  if (!result.ok) throw new Error(result.error)
  return {
    rows: result.rows,
    sheetName: result.sheetName,
    fileName,
    modifiedAt,
    total: result.total,
    skipped: result.skipped,
    readAt: new Date().toISOString(),
    change: previous ? compareReads(previous.rows, result.rows) : null,
  }
}

export function useOtifLive() {
  const [status, setStatus] = useState<ExcelBookStatus | null>(null)
  const [data, setData] = useState<OtifLiveData | null>(cached)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSync, setAutoSyncState] = useState(readAutoSync)
  const alive = useRef(true)

  /** Reads the file now. `manual` (Sync now) always says what it found; an automatic read speaks only when something changed. */
  const read = useCallback(async (manual: boolean) => {
    setReading(true)
    setError(null)
    try {
      // One read at a time, however many times the page asks.
      inflight ??= readLiveFile(cached).finally(() => {
        inflight = null
      })
      const next = await inflight
      cached = next
      if (!alive.current) return
      setData(next)
      const changed = next.change && next.change.added + next.change.changed + next.change.removed > 0
      if (manual || changed) toast.success(`OTIF Analytics: ${summariseRead(next)}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read the OTIF file.'
      if (!alive.current) return
      setError(message)
      if (manual) toast.error(message)
    } finally {
      if (alive.current) setReading(false)
    }
    try {
      const next = (await getExcelStatus()).otif
      if (alive.current) setStatus(next)
    } catch {
      /* the next check will catch up */
    }
  }, [])

  /** Looks at the file: reads it the first time, and again on a new save while auto-sync is on. */
  const check = useCallback(async () => {
    const next = (await getExcelStatus()).otif
    if (!alive.current) return
    setStatus(next)
    if (!next.configured || !next.exists || inflight) return
    if (!cached || (autoSync && next.modifiedAt && next.modifiedAt !== cached.modifiedAt)) void read(false)
  }, [autoSync, read])

  useEffect(() => {
    alive.current = true
    void check()
    const timer = window.setInterval(() => void check(), autoSync ? POLL_AUTO_MS : POLL_MS)
    return () => {
      alive.current = false
      window.clearInterval(timer)
    }
  }, [check, autoSync])

  const setAutoSync = useCallback((value: boolean) => {
    setAutoSyncState(value)
    writeAutoSync(value)
  }, [])

  const syncNow = useCallback(() => void read(true), [read])

  return { status, data, reading, error, autoSync, setAutoSync, syncNow }
}
