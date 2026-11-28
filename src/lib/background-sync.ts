/**
 * The Excel books kept in step in the background (28 Nov 2026, the user: "make
 * sure every excel sheet data matches exactly as crm data"). Before, a book was
 * imported only while someone had its page open with the card's watcher on —
 * Ready for Dispatch had not been imported since 23 Nov because nobody had the
 * RFD page open. Now every team leader's and administrator's screen, whatever
 * page it shows, checks the connected workbooks every minute and imports any
 * book whose file has been saved since its last import (Active Payments,
 * Overdue, Ready for Dispatch). The import is the same one the card's "Sync now"
 * runs, and it shares the card's record of what was last imported.
 */

import { useEffect } from 'react'
import { NO_FILTER, loadImportFilter } from './excel-filter'
import { getExcelStatus, syncBookFromExcel } from './excel-source'
import { readSyncEntry, writeSyncEntry } from './sync-log'
import type { SyncedBook } from '@shared/api'

export const BACKGROUND_SYNC_MS = 60_000
export const BACKGROUND_BOOKS: readonly SyncedBook[] = ['companies', 'overdue', 'rfd']

/** The books whose file changed since this screen last imported them. */
export function booksToSync(status: Partial<Record<string, { configured?: boolean; exists?: boolean; modifiedAt?: string | null }>>, lastImported: (book: SyncedBook) => string | null): SyncedBook[] {
  return BACKGROUND_BOOKS.filter((book) => {
    const s = status[book]
    return Boolean(s?.configured && s.exists && s.modifiedAt && s.modifiedAt !== lastImported(book))
  })
}

export function useBackgroundExcelSync(enabled: boolean, adminId: string | undefined): void {
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const tick = async () => {
      let status
      try {
        status = await getExcelStatus()
      } catch {
        return // Server busy or restarting: next minute.
      }
      // A failed import does not count as imported: the next minute tries again.
      const lastImported = (b: SyncedBook) => {
        const entry = readSyncEntry(b)
        return entry?.success ? entry.modifiedAt ?? null : null
      }
      for (const book of booksToSync(status, lastImported)) {
        if (stopped) return
        const result = await syncBookFromExcel(book, { adminId, filter: book === 'companies' ? loadImportFilter(book) : NO_FILTER })
        writeSyncEntry(book, {
          syncedAt: new Date().toISOString(),
          modifiedAt: result.modifiedAt,
          created: result.created,
          updated: result.updated,
          added: result.changes?.added ?? 0,
          addedValue: result.changes?.addedValue ?? 0,
          changed: result.changes?.changed ?? 0,
          delta: result.changes?.delta ?? 0,
          settled: (result.settled?.paid ?? 0) + (result.settled?.gone ?? 0),
          upgraded: result.upgraded ?? 0,
          skipped: result.skipped,
          needsCoordinator: result.skippedBecause?.needsCoordinator ?? 0,
          filteredOut: result.filteredOut ?? 0,
          success: result.success,
        })
      }
    }
    const first = window.setTimeout(() => void tick(), 5_000)
    const timer = window.setInterval(() => void tick(), BACKGROUND_SYNC_MS)
    return () => {
      stopped = true
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [enabled, adminId])
}
