/**
 * When each book was last synced, and what came of it.
 *
 * The Excel card used to hold that in component state alone, so it was true
 * only until you navigated away. Come back to the page and the card had
 * forgotten every sync that ever ran: a file saved this morning read as
 * "Saved 8h ago. Not imported yet." on a book that had been imported minutes
 * before, and there was nowhere to see when a sync had actually happened.
 *
 * Two timestamps matter and they answer different questions:
 *
 *   - `modifiedAt` — when the workbook was last saved. Whether what is on
 *     screen is behind the file.
 *   - `syncedAt`   — when this app last read it. Whether anybody has checked.
 *
 * A file untouched for a week is not stale; a book nobody has synced since
 * Tuesday might be. Showing only the first, as the card did, cannot say that.
 *
 * Kept per book, so either screen can show what the other one did — which is
 * the point: a coordinator on Overdue should not have to visit Active Payments
 * to find out whether it is current.
 */

import type { ExcelBook } from '@shared/api'

const STORAGE_KEY = 'crm.excel.lastsync'

export interface SyncLogEntry {
  /** When this app read the file. */
  syncedAt: string
  /** The file's own timestamp at that moment; null when it could not be read. */
  modifiedAt: string | null
  created: number
  updated: number
  /** Records that did not exist before, and what they added. */
  added: number
  addedValue: number
  /** Records whose balance moved, and by how much in total (signed). */
  changed: number
  delta: number
  /** Brought to nil because the file stopped claiming money for them. */
  settled: number
  /** Pre-invoice records replaced by their invoices. One-off. */
  upgraded: number
  /** Rows the validator refused. */
  skipped: number
  /**
   * Of those, the ones held back only because the file names a coordinator
   * the system does not know. Real money that reached no screen in the CRM,
   * which is why the administrator sees it on its own card.
   */
  needsCoordinator: number
  /** Rows left out on purpose by a date window — not failures. */
  filteredOut: number
  /** False when the read itself failed; the entry still records the attempt. */
  success: boolean
}

export type SyncLog = Partial<Record<ExcelBook, SyncLogEntry>>

function read(): SyncLog {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SyncLog) : {}
  } catch {
    // Unreadable or unavailable storage: no record is better than a wrong one.
    return {}
  }
}

/** Every book's last sync. */
export function readSyncLog(): SyncLog {
  return read()
}

export function readSyncEntry(book: ExcelBook): SyncLogEntry | null {
  return read()[book] ?? null
}

/** Records a sync that just finished. Returns what was written. */
export function writeSyncEntry(book: ExcelBook, entry: SyncLogEntry): SyncLogEntry {
  try {
    const log = read()
    log[book] = entry
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log))
  } catch {
    // The card falls back to its in-memory copy for this session.
  }
  return entry
}

export function clearSyncLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; it is a convenience record.
  }
}

/** How many records a sync actually changed. */
export function changedCount(entry: SyncLogEntry): number {
  return entry.created + entry.updated + entry.settled + entry.upgraded
}

/**
 * What a sync did, in a few words.
 *
 * Deliberately short: this sits under a timestamp on a card and inside a small
 * popover, not in a report. "Nothing to change" is said out loud rather than
 * left blank, because a blank line reads as a sync that did not run.
 */
export function summariseSync(entry: SyncLogEntry): string {
  if (!entry.success) return 'The last sync failed'

  const parts: string[] = []

  /*
   * What is different, not how many rows were written. "1,011 updated" is the
   * import describing its own effort, and it says the same thing over a
   * workbook nobody has touched since yesterday.
   */
  if (entry.added) {
    parts.push(`${entry.added.toLocaleString('en-IN')} new worth ${money(entry.addedValue)}`)
  }
  if (entry.changed) {
    // The sign is the news: a book that grew and one that shrank are not the
    // same thing, and "changed" alone hides which happened.
    parts.push(
      `${entry.changed.toLocaleString('en-IN')} changed (${money(Math.abs(entry.delta))} ${
        entry.delta >= 0 ? 'more' : 'less'
      })`
    )
  }
  if (entry.settled) parts.push(`${entry.settled.toLocaleString('en-IN')} settled`)
  if (entry.upgraded) parts.push(`${entry.upgraded.toLocaleString('en-IN')} replaced`)

  if (parts.length === 0) return 'Nothing changed'
  return parts.join(' · ')
}

/** Whole rupees; this sits on one line of a small card. */
function money(amount: number): string {
  return `₹${Math.round(Math.abs(amount)).toLocaleString('en-IN')}`
}
