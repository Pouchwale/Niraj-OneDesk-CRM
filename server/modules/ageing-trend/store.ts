/**
 * The Overdue book week by week, kept for good.
 *
 * Weekly KPI's saved days are the history, but they are whole books (a few
 * hundred kilobytes each) and are removed after 90 days. This keeps the small
 * sum of each one - per coordinator, per segment, three age groups - in one
 * file beside them, so the week-wise table and the month and quarter charts
 * keep their history after the days themselves are gone.
 *
 * It only reads the saved days. A day deleted by hand while it was still
 * within the 90 days was a save somebody did not want, so its sum goes too;
 * a day removed by age keeps its sum.
 *
 * Month closes (since 5 Nov 2026) sit in a second file: the live book summed
 * every half hour into the current month's entry, so when a month is over its
 * last sum is how it closed. A quarter closes with its last month.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SNAPSHOT_RETENTION_DAYS } from '../../../shared/snapshots'
import { monthOf, summariseBook, type BookRow, type MonthClose, type PersonSegmentRow } from '../../../src/lib/ageing-trend'
import type { SnapshotStore } from '../snapshots/store'

export interface SummedDay {
  id: string
  savedAt: string
  rows: PersonSegmentRow[]
}

export interface AgeingTrendStore {
  /** Every summed day, the saved days brought up to date first. */
  days(): SummedDay[]
  /** Every month close recorded, oldest first. */
  months(): MonthClose[]
  /** Sums the live book into the current month's close. Returns the month written, or null when nothing changed. */
  recordMonth(rows: readonly BookRow[]): string | null
}

export const TREND_FILE = 'ageing-weeks.json'
export const MONTHS_FILE = 'ageing-months.json'

export function createAgeingTrendStore(snapshotDir: string, snapshots: SnapshotStore, now: () => Date = () => new Date()): AgeingTrendStore {
  const file = join(snapshotDir, TREND_FILE)
  const monthsFile = join(snapshotDir, MONTHS_FILE)

  function readJson<T>(path: string): Record<string, T> {
    if (!existsSync(path)) return {}
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, T>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  const writeJson = (path: string, all: unknown) => {
    mkdirSync(snapshotDir, { recursive: true })
    const temp = `${path}.tmp`
    writeFileSync(temp, JSON.stringify(all))
    renameSync(temp, path)
  }

  const read = () => readJson<SummedDay>(file)
  const write = (all: Record<string, SummedDay>) => writeJson(file, all)

  // Saved days never change once written, so each is read and summed once.
  let cache: Record<string, SummedDay> | null = null

  const days = (): SummedDay[] => {
    const all = cache ?? read()
    let changed = false

    const saved = snapshots.listDays()
    const savedIds = new Set(saved.map((d) => d.id))
    for (const meta of saved) {
      if (all[meta.id]) continue
      const day = snapshots.getDay(meta.id)
      if (!day) continue
      all[meta.id] = { id: meta.id, savedAt: meta.savedAt, rows: summariseBook(day.rows as unknown as BookRow[]) }
      changed = true
    }

    const keptFrom = now().getTime() - SNAPSHOT_RETENTION_DAYS * 86_400_000
    for (const [id, day] of Object.entries(all)) {
      if (!savedIds.has(id) && new Date(day.savedAt).getTime() >= keptFrom) {
        delete all[id]
        changed = true
      }
    }

    if (changed) write(all)
    cache = all
    return Object.values(all)
  }

  // A few kilobytes, read fresh each time so a restored file is seen at once.
  const allMonths = () => readJson<MonthClose>(monthsFile)

  const months = (): MonthClose[] => Object.values(allMonths()).sort((a, b) => a.month.localeCompare(b.month))

  const recordMonth = (rows: readonly BookRow[]): string | null => {
    const at = now()
    const month = monthOf(at)
    const summed = summariseBook(rows)
    const all = allMonths()
    // Only a change is written: the same book half an hour later is not news.
    if (all[month] && JSON.stringify(all[month].rows) === JSON.stringify(summed)) return null
    all[month] = { month, savedAt: at.toISOString(), rows: summed }
    writeJson(monthsFile, all)
    return month
  }

  return { days, months, recordMonth }
}

/** Every half hour (and a minute after start), the live book into this month's close. */
export function startMonthCloses(store: AgeingTrendStore, rows: () => readonly BookRow[], onError: (err: unknown) => void): () => void {
  const tick = () => {
    try {
      store.recordMonth(rows())
    } catch (err) {
      onError(err)
    }
  }
  const first = setTimeout(tick, 60_000)
  const timer = setInterval(tick, 30 * 60_000)
  first.unref?.()
  timer.unref?.()
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
