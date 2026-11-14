/**
 * The score history, kept for good (6 Nov 2026).
 *
 * One file beside the Weekly KPI saves (score-history.json) holds every week,
 * month and year that has ended, locked: worked out once, two days after the
 * period ended, and never again unless the administrator asks for it. The
 * first run fills in every past period the records reach back to. The
 * periods still open are worked out live on each request.
 *
 * Since 14 Nov 2026 the file also keeps the administrator's final score ratio.
 * A period takes the ratio of the day it locks and keeps it; the open ones use
 * the ratio as it is now.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkFinalRatio,
  computePeriod,
  earliestDay,
  keysBetween,
  lockable,
  periodId,
  periodRange,
  recentKeys,
  ratioOn,
  type FinalRatio,
  type FinalWeightsSetting,
  type PeriodKind,
  type PeriodScores,
  type ScoreInputs,
} from '../../../src/lib/score-history'
import { toLocalISODate } from '../../../src/lib/utils'

export const SCORE_HISTORY_FILE = 'score-history.json'

/** The ratios a file holds; the first single ratio, if a file still has one, reads as a ratio from the start. */
function ratiosOf(file: { finalWeights?: FinalWeightsSetting | null; finalRatios?: FinalRatio[] }): FinalRatio[] {
  if (file.finalRatios) return [...file.finalRatios].sort((a, b) => a.from.localeCompare(b.from))
  return file.finalWeights ? [{ id: 'first', from: '2000-01-01', to: null, ...file.finalWeights }] : []
}
const KINDS: PeriodKind[] = ['week', 'month', 'year']
/** The furthest back the first run fills in. */
const BACKFILL_YEARS = 5

interface HistoryFile {
  version: 1
  /** The first day any module had data when the history was first filled in. */
  firstDay: string | null
  periods: Record<string, PeriodScores>
  /** The first single ratio (14 Nov 2026, never set on the live CRM); read as a ratio from the start. */
  finalWeights?: FinalWeightsSetting | null
  /** The administrator's final score ratios by dates. */
  finalRatios?: FinalRatio[]
}

export interface ScoreHistoryStore {
  /** Locks every period that has ended and is not locked yet. Returns the ids locked. */
  lockDue(): string[]
  /** The last `count` periods of a kind (every year for years): locked ones as saved, open ones live. */
  periods(kind: PeriodKind, count: number): PeriodScores[]
  /** Works a locked period out again from today's records; null when it is not locked. */
  relock(id: string, by: string): PeriodScores | null
  /** The final score ratios by dates, oldest first. */
  finalRatios(): FinalRatio[]
  /** Adds a dated ratio, or changes the one with `id`. Throws a message for the screen. */
  saveFinalRatio(input: unknown, by: string, id?: string): FinalRatio
  /** Removes a dated ratio; false when there was none. */
  deleteFinalRatio(id: string): boolean
}

/**
 * `signature` names the state of the records (the data version, the saved
 * KPI scores, the roster); live figures are reused until it changes. Without
 * one they are worked out on every request.
 */
export function createScoreHistoryStore(
  snapshotDir: string,
  inputs: () => ScoreInputs,
  now: () => Date = () => new Date(),
  signature?: () => string
): ScoreHistoryStore {
  const path = join(snapshotDir, SCORE_HISTORY_FILE)

  const read = (): HistoryFile => {
    if (!existsSync(path)) return { version: 1, firstDay: null, periods: {} }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as HistoryFile
      return parsed && typeof parsed === 'object' && parsed.periods ? parsed : { version: 1, firstDay: null, periods: {} }
    } catch {
      return { version: 1, firstDay: null, periods: {} }
    }
  }
  const write = (file: HistoryFile) => {
    mkdirSync(snapshotDir, { recursive: true })
    const temp = `${path}.tmp`
    writeFileSync(temp, JSON.stringify(file))
    renameSync(temp, path)
  }

  let live: { sig: string; data: ScoreInputs } | null = null
  // The day is part of the signature: Robi's live days are judged against today.
  const sigNow = () => (signature ? `${toLocalISODate(now())}|${signature()}` : null)
  const freshInputs = () => {
    const data = inputs()
    const sig = sigNow()
    live = sig ? { sig, data } : null
    return data
  }
  const cachedInputs = () => {
    const sig = sigNow()
    return sig && live?.sig === sig ? live.data : freshInputs()
  }

  const lockDue = (): string[] => {
    const file = read()
    const today = toLocalISODate(now())
    let data: ScoreInputs | null = null
    if (!file.firstDay) {
      data = freshInputs()
      const first = earliestDay(data)
      if (!first) return []
      const floor = `${Number(today.slice(0, 4)) - BACKFILL_YEARS}-01-01`
      file.firstDay = first < floor ? floor : first
    }
    const due: [PeriodKind, string][] = []
    for (const kind of KINDS) {
      for (const key of keysBetween(kind, file.firstDay, today)) {
        if (!file.periods[periodId(kind, key)] && lockable(kind, key, today)) due.push([kind, key])
      }
    }
    if (!due.length) {
      if (data) write(file)
      return []
    }
    data ??= freshInputs()
    const at = now().toISOString()
    // Each period locks with the ratio in force on its first day, as it stands now.
    const ratios = ratiosOf(file)
    for (const [kind, key] of due) {
      file.periods[periodId(kind, key)] = { ...computePeriod(data, kind, key, today), lockedAt: at, lockedBy: 'auto', finalWeights: ratioOn(ratios, periodRange(kind, key).start)?.weights ?? null }
    }
    write(file)
    return due.map(([kind, key]) => periodId(kind, key))
  }

  const periods = (kind: PeriodKind, count: number): PeriodScores[] => {
    const file = read()
    const today = toLocalISODate(now())
    const keys =
      kind === 'year' && file.firstDay
        ? keysBetween('year', file.firstDay, today)
        : recentKeys(kind, today, Math.max(1, Math.min(count, 156)))
    return keys.map((key) => {
      const locked = file.periods[periodId(kind, key)]
      if (locked) return locked
      // Still open, or ended within the grace days: worked out live.
      return { ...computePeriod(cachedInputs(), kind, key, today), lockedAt: null, lockedBy: null, finalWeights: ratioOn(ratiosOf(file), periodRange(kind, key).start)?.weights ?? null }
    })
  }

  const relock = (id: string, by: string): PeriodScores | null => {
    const file = read()
    const held = file.periods[id]
    if (!held) return null
    const today = toLocalISODate(now())
    const { start } = periodRange(held.kind, held.key)
    if (start > today) return null
    // Worked out again from today's records, with the ratio it was locked with.
    const again: PeriodScores = { ...computePeriod(freshInputs(), held.kind, held.key, today), lockedAt: now().toISOString(), lockedBy: by, finalWeights: held.finalWeights ?? null }
    file.periods[id] = again
    write(file)
    return again
  }

  const finalRatios = (): FinalRatio[] => ratiosOf(read())

  const saveFinalRatio = (input: unknown, by: string, id?: string): FinalRatio => {
    const checked = checkFinalRatio(input)
    const file = read()
    const list = ratiosOf(file)
    if (id && !list.some((r) => r.id === id)) throw new Error('That ratio is not there any more.')
    if (list.some((r) => r.id !== id && r.from === checked.from)) throw new Error('Another ratio already starts on that date; change that one instead.')
    const ratio: FinalRatio = { id: id ?? randomUUID(), ...checked, updatedAt: now().toISOString(), updatedBy: by }
    file.finalRatios = [...list.filter((r) => r.id !== ratio.id), ratio].sort((a, b) => a.from.localeCompare(b.from))
    delete file.finalWeights
    write(file)
    return ratio
  }

  const deleteFinalRatio = (id: string): boolean => {
    const file = read()
    const list = ratiosOf(file)
    if (!list.some((r) => r.id === id)) return false
    file.finalRatios = list.filter((r) => r.id !== id)
    delete file.finalWeights
    write(file)
    return true
  }

  return { lockDue, periods, relock, finalRatios, saveFinalRatio, deleteFinalRatio }
}

/** A minute and a half after start (the data is loaded by then), and every half hour after, lock what has ended. */
export function startScoreLocks(store: ScoreHistoryStore, onLocked: (ids: string[]) => void, onError: (err: unknown) => void): () => void {
  const tick = () => {
    try {
      const ids = store.lockDue()
      if (ids.length) onLocked(ids)
    } catch (err) {
      onError(err)
    }
  }
  const first = setTimeout(tick, 90_000)
  const timer = setInterval(tick, 30 * 60_000)
  first.unref?.()
  timer.unref?.()
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
