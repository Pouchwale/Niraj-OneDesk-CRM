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
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SNAPSHOT_RETENTION_DAYS } from '../../../shared/snapshots'
import { summariseBook, type BookRow, type PersonSegmentRow } from '../../../src/lib/ageing-trend'
import type { SnapshotStore } from '../snapshots/store'

export interface SummedDay {
  id: string
  savedAt: string
  rows: PersonSegmentRow[]
}

export interface AgeingTrendStore {
  /** Every summed day, the saved days brought up to date first. */
  days(): SummedDay[]
}

export const TREND_FILE = 'ageing-weeks.json'

export function createAgeingTrendStore(snapshotDir: string, snapshots: SnapshotStore, now: () => Date = () => new Date()): AgeingTrendStore {
  const file = join(snapshotDir, TREND_FILE)

  const read = (): Record<string, SummedDay> => {
    if (!existsSync(file)) return {}
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, SummedDay>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  const write = (all: Record<string, SummedDay>) => {
    mkdirSync(snapshotDir, { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(all))
    renameSync(temp, file)
  }

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

  return { days }
}
