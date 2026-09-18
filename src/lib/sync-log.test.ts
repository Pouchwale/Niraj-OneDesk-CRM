import { describe, expect, it, beforeEach, vi } from 'vitest'

// Node has no localStorage, and the module treats an unavailable store as
// 'no record' rather than throwing - so without this the tests would pass
// vacuously against a log that never saved anything.
const map = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => map.get(k) ?? null,
  setItem: (k: string, v: string) => void map.set(k, v),
  removeItem: (k: string) => void map.delete(k),
  clear: () => map.clear(),
  key: (i: number) => [...map.keys()][i] ?? null,
  get length() { return map.size },
} as unknown as Storage)

import {
  changedCount,
  clearSyncLog,
  readSyncEntry,
  readSyncLog,
  summariseSync,
  writeSyncEntry,
  type SyncLogEntry,
} from './sync-log'

/**
 * Remembering when each book was last read.
 *
 * The card used to hold this in component state, so it was true until you
 * navigated away: a book synced two minutes earlier came back reading "Saved
 * 8h ago. Not imported yet." Worse, there was nowhere to see when a sync had
 * actually run — only when the file was last saved, which answers a different
 * question. A file untouched for a week is not stale; a book nobody has synced
 * since Tuesday might be.
 */

const entry = (over: Partial<SyncLogEntry> = {}): SyncLogEntry => ({
  syncedAt: '2026-09-09T10:00:00.000Z',
  modifiedAt: '2026-09-09T09:00:00.000Z',
  created: 0,
  updated: 0,
  added: 0,
  addedValue: 0,
  changed: 0,
  delta: 0,
  settled: 0,
  upgraded: 0,
  skipped: 0,
  needsCoordinator: 0,
  filteredOut: 0,
  success: true,
  ...over,
})

beforeEach(() => {
  clearSyncLog()
})

describe('what the log keeps', () => {
  it('survives being read back, which is the whole point', () => {
    writeSyncEntry('companies', entry({ created: 287, updated: 724 }))
    const back = readSyncEntry('companies')
    expect(back?.created).toBe(287)
    expect(back?.syncedAt).toBe('2026-09-09T10:00:00.000Z')
  })

  it('keeps the two timestamps apart', () => {
    // When the file was saved, and when this app read it, are different facts
    // and the card shows them separately.
    const back = writeSyncEntry('companies', entry())
    expect(back.syncedAt).not.toBe(back.modifiedAt)
  })

  it('holds both books at once, so either screen can speak for the other', () => {
    writeSyncEntry('companies', entry({ created: 1011 }))
    writeSyncEntry('overdue', entry({ created: 465 }))

    const log = readSyncLog()
    expect(log.companies?.created).toBe(1011)
    expect(log.overdue?.created).toBe(465)
  })

  it('records a failed sync too', () => {
    // "We tried at 4pm and could not read the file" is worth more than silence.
    writeSyncEntry('companies', entry({ success: false }))
    expect(readSyncEntry('companies')?.success).toBe(false)
  })

  it('returns nothing for a book never synced, rather than inventing a zero', () => {
    expect(readSyncEntry('overdue')).toBeNull()
  })
})

describe('saying what a sync did', () => {
  it('names each kind of change', () => {
    // Written rows are not news. What is different is: how many records are
    // new, what they added, and which way the book moved.
    expect(summariseSync(entry({ added: 287, addedValue: 1250000 }))).toBe('287 new worth ₹12,50,000')
    expect(summariseSync(entry({ changed: 3, delta: 18240 }))).toBe('3 changed (₹18,240 more)')
    expect(summariseSync(entry({ changed: 2, delta: -5000 }))).toBe('2 changed (₹5,000 less)')
    // A sync that wrote a thousand rows and changed none of them says so.
    expect(summariseSync(entry({ created: 0, updated: 1011 }))).toBe('Nothing changed')
    expect(summariseSync(entry({ settled: 2 }))).toBe('2 settled')
    expect(summariseSync(entry({ upgraded: 287 }))).toBe('287 replaced')
  })

  it('says so out loud when nothing changed', () => {
    // A blank line reads as a sync that never ran, which is the one thing it
    // must not be mistaken for.
    expect(summariseSync(entry())).toBe('Nothing changed')
  })

  it('leads with the failure rather than a tally of nothing', () => {
    expect(summariseSync(entry({ success: false, created: 5 }))).toBe('The last sync failed')
  })

  it('counts every kind of change together', () => {
    expect(changedCount(entry({ created: 1, updated: 2, settled: 3, upgraded: 4 }))).toBe(10)
  })
})
