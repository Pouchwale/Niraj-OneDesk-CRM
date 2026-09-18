/**
 * The working dataset, held on the office machine instead of in a browser.
 *
 * Until now the CRM lived in each person's localStorage, which meant everyone
 * had their own private copy: Niki could import the workbook and Pragati, on
 * her own desktop, would see an empty system. Signing in was shared; the work
 * was not.
 *
 * So the records moved here. This module owns the one copy, writes it to a
 * file, and is the only thing allowed to change it — browsers send what they
 * want done and are told the result. Two coordinators logging a call at the
 * same moment therefore both keep their work, which a "save my whole copy"
 * design could not promise.
 *
 * It runs the very same store class the browser runs (src/lib/demo-companies),
 * so how an invoice is matched on re-import, how a bankruptcy carries across a
 * customer, and what the sync retires are decided by one piece of code with
 * one suite of tests behind it — not by a second implementation that agrees
 * with the first until the day it doesn't.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  demoCompanyStore,
  subscribeToDemoStore,
  type PersistedStore,
} from '../../../src/lib/demo-companies'

/** How long to wait for a burst of changes to settle before writing. */
const WRITE_DEBOUNCE_MS = 150

export interface DataStore {
  /** Everything, as the browser will hold it. */
  snapshot(): PersistedStore
  /** Which revision that is; a browser refetches when it changes. */
  version(): number
  /** Runs a change against the one copy and returns the new revision. */
  apply<T>(
    change: (store: typeof demoCompanyStore) => T | Promise<T>
  ): Promise<{ result: T; version: number }>
  /** Writes now rather than on the timer. Shutdown, and tests. */
  flush(): void
  /** The file it is kept in, for the operator who has to back it up. */
  file: string
}

export function createDataStore(dir: string): DataStore {
  const file = join(dir, 'store.json')

  let version = 0
  let dirty = false
  let timer: NodeJS.Timeout | null = null

  /** Written to a temporary file and renamed, so a crash never truncates it. */
  const write = () => {
    const value = demoCompanyStore.getSnapshot()
    mkdirSync(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(value), 'utf8')
    renameSync(temporary, file)
    dirty = false
  }

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (dirty) write()
  }

  const schedule = () => {
    dirty = true
    version++
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      try {
        write()
      } catch (err) {
        // Keep serving: the records are still right in memory, and the next
        // change will try again. Losing the file is bad; losing the day's work
        // because a write failed once would be worse.
        console.error('Could not write the working dataset:', err)
      }
    }, WRITE_DEBOUNCE_MS)
    timer.unref?.()
  }

  /* ── Load whatever is already there ── */
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as PersistedStore
      demoCompanyStore.replaceAll(saved)
      /*
       * The store runs these on load, but its constructor ran before the file
       * was read — against nothing. Run them here, over the real records: a
       * bankruptcy declared against a customer still has to reach that
       * customer's other invoices, and a handed-over desk still has to be
       * handed over.
       */
      demoCompanyStore.carryBankruptcyToInvoices()
      demoCompanyStore.applyHandovers()
    } catch (err) {
      /*
       * A corrupt file is not a reason to start an empty CRM on top of it —
       * that would overwrite the only copy with nothing. Refuse to start, and
       * let whoever runs the machine restore the backup.
       */
      throw new Error(
        `The working dataset at ${file} could not be read (${(err as Error).message}). ` +
          'Restore it from a backup, or move it aside to start a fresh one.'
      )
    }
  } else {
    // Nothing saved yet: start empty rather than with the demo fixtures, and
    // let the first Excel sync fill it.
    demoCompanyStore.replaceAll({})
    write()
  }

  // Every mutation the store makes — including the ones inside a bulk import —
  // arrives here, so nothing can change without being written down.
  subscribeToDemoStore(schedule)

  return {
    snapshot: () => demoCompanyStore.getSnapshot(),
    version: () => version,
    apply: async (change) => {
      const result = await change(demoCompanyStore)
      /*
       * The store announces a change on a microtask, and an import holds its
       * announcement until the whole run finishes. Wait for that to land before
       * reading the revision, or a caller is told nothing happened when it did
       * — and every other browser would go on showing yesterday's records.
       */
      await new Promise((resolve) => setImmediate(resolve))
      return { result, version }
    },
    flush,
    file,
  }
}
