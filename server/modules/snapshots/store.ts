/**
 * Where saved Overdue days and weekly scores are kept.
 *
 * On the server's own disk rather than in the browser: the live book alone is
 * over a megabyte and the browser allows about five, so the browser could hold
 * three or four days at most. On disk a day is a few hundred kilobytes, three
 * months of them fit comfortably, and every PC that opens the app sees the
 * same list.
 *
 * Each day is two files: the full copy, and a small summary the list reads, so
 * listing ninety days does not mean reading ninety full books. Anything older
 * than the retention window is removed whenever the list is read or written.
 */

import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  SNAPSHOT_RETENTION_DAYS,
  type NewOverdueSnapshot,
  type NewScoreResult,
  type OverdueSnapshot,
  type OverdueSnapshotMeta,
  type ScoreResult,
  type ScoreResultMeta,
  type SnapshotSettings,
  type SnapshotTableRow,
} from '../../../shared/snapshots'

const DAY_MS = 86_400_000

/**
 * Ids become file names, so only letters, digits and hyphens are ever
 * accepted. Nothing a request sends can name a file outside the folder.
 */
const SAFE_ID = /^[A-Za-z0-9-]{6,100}$/

export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id)
}

/** A request that cannot be stored, in words the person can act on. */
export class SnapshotInputError extends Error {}

export interface SnapshotStore {
  listDays(): OverdueSnapshotMeta[]
  getDay(id: string): OverdueSnapshot | null
  saveDay(input: unknown): OverdueSnapshotMeta
  removeDay(id: string): boolean
  getSettings(): SnapshotSettings
  saveSettings(percentage: unknown, by: unknown): SnapshotSettings
  listResults(): ScoreResultMeta[]
  getResult(id: string): ScoreResult | null
  saveResult(input: unknown): ScoreResultMeta
  removeResult(id: string): boolean
  /** Removes what has passed the retention window. Returns how much went. */
  prune(): { days: number; results: number }
}

const TABLE_NUMBERS: (keyof SnapshotTableRow)[] = [
  'balanceDue',
  'due0to30',
  'due31to60',
  'due61to90',
  'due91to120',
  'due121Plus',
  'target0to120',
  'target121Plus',
]

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateTable(table: unknown, what: string): SnapshotTableRow[] {
  if (!Array.isArray(table)) throw new SnapshotInputError(`The ${what} table is missing.`)
  return table.map((row, index) => {
    const r = row as Partial<SnapshotTableRow> | null
    if (!r || typeof r !== 'object') throw new SnapshotInputError(`Line ${index + 1} of the ${what} table is not a row.`)
    if (typeof r.coordinatorId !== 'string' || typeof r.coordinatorName !== 'string') {
      throw new SnapshotInputError(`Line ${index + 1} of the ${what} table has no coordinator.`)
    }
    for (const field of TABLE_NUMBERS) {
      if (!isFiniteNumber(r[field])) {
        throw new SnapshotInputError(`Line ${index + 1} of the ${what} table has no valid ${field}.`)
      }
    }
    return r as SnapshotTableRow
  })
}

export function validatePercentage(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0 || value > 100) {
    throw new SnapshotInputError('The target percentage must be a number above 0 and no more than 100.')
  }
  return Math.round(value * 100) / 100
}

export function validateNewDay(input: unknown): NewOverdueSnapshot {
  const v = input as Partial<NewOverdueSnapshot> | null
  if (!v || typeof v !== 'object') throw new SnapshotInputError('Send the day to save as a JSON object.')
  if (!Array.isArray(v.rows)) throw new SnapshotInputError('The day has no rows to save.')
  if (typeof v.savedBy !== 'string' || !v.savedBy) throw new SnapshotInputError('Say who is saving the day.')
  return {
    savedBy: v.savedBy,
    savedByName: typeof v.savedByName === 'string' && v.savedByName ? v.savedByName : v.savedBy,
    fileModifiedAt: typeof v.fileModifiedAt === 'string' ? v.fileModifiedAt : null,
    percentage: validatePercentage(v.percentage),
    rows: v.rows as Record<string, unknown>[],
    table: validateTable(v.table, 'saved day'),
  }
}

export function validateNewResult(input: unknown): NewScoreResult {
  const v = input as Partial<NewScoreResult> | null
  if (!v || typeof v !== 'object') throw new SnapshotInputError('Send the result as a JSON object.')
  if (!isSafeId(v.oldId) || !isSafeId(v.newId)) throw new SnapshotInputError('Name the two saved days the result compares.')
  if (v.oldId === v.newId) throw new SnapshotInputError('A result compares two different days.')
  if (typeof v.generatedBy !== 'string' || !v.generatedBy) throw new SnapshotInputError('Say who generated the result.')
  if (typeof v.oldSavedAt !== 'string' || typeof v.newSavedAt !== 'string') {
    throw new SnapshotInputError('The result must say when each day was saved.')
  }
  if (!Array.isArray(v.rows)) throw new SnapshotInputError('The result has no rows.')
  const rows = v.rows.map((row, index) => {
    const r = row as Partial<NewScoreResult['rows'][number]> | null
    if (!r || typeof r.coordinatorName !== 'string') throw new SnapshotInputError(`Result line ${index + 1} has no coordinator.`)
    for (const field of ['target30to120', 'achieve30to120', 'target120Plus', 'achieve120Plus', 'kpiScore'] as const) {
      if (!isFiniteNumber(r[field])) throw new SnapshotInputError(`Result line ${index + 1} has no valid ${field}.`)
    }
    return r as NewScoreResult['rows'][number]
  })
  return {
    generatedBy: v.generatedBy,
    generatedByName: typeof v.generatedByName === 'string' && v.generatedByName ? v.generatedByName : v.generatedBy,
    oldId: v.oldId,
    newId: v.newId,
    oldSavedAt: v.oldSavedAt,
    newSavedAt: v.newSavedAt,
    rows,
    flags: Array.isArray(v.flags) ? v.flags.map(String) : [],
    oldTable: validateTable(v.oldTable, 'old day'),
    newTable: validateTable(v.newTable, 'new day'),
  }
}

/** Local date and time as an id prefix, so a folder listing reads in order. */
function stampOf(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-` +
    `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  )
}

export function createSnapshotStore(
  dir: string,
  options: { now?: () => Date; retentionDays?: number } = {}
): SnapshotStore {
  const now = options.now ?? (() => new Date())
  const retentionMs = (options.retentionDays ?? SNAPSHOT_RETENTION_DAYS) * DAY_MS
  const daysDir = join(dir, 'days')
  const resultsDir = join(dir, 'results')
  const settingsFile = join(dir, 'settings.json')

  const readJson = <T>(file: string): T | null => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T
    } catch {
      return null
    }
  }

  /** Written to a temporary file and renamed, so a crash never leaves half a day. */
  const writeJson = (file: string, value: unknown) => {
    mkdirSync(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(value), 'utf8')
    renameSync(temporary, file)
  }

  const summaries = (folder: string): string[] => {
    try {
      return readdirSync(folder).filter((name) => name.endsWith('.meta.json'))
    } catch {
      return []
    }
  }

  const prune = () => {
    const cutoff = now().getTime() - retentionMs
    let days = 0
    let results = 0
    for (const name of summaries(daysDir)) {
      const meta = readJson<OverdueSnapshotMeta>(join(daysDir, name))
      if (!meta || !isSafeId(meta.id) || new Date(meta.savedAt).getTime() >= cutoff) continue
      rmSync(join(daysDir, `${meta.id}.json`), { force: true })
      rmSync(join(daysDir, name), { force: true })
      days++
    }
    for (const name of summaries(resultsDir)) {
      const meta = readJson<ScoreResultMeta>(join(resultsDir, name))
      if (!meta || !isSafeId(meta.id) || new Date(meta.generatedAt).getTime() >= cutoff) continue
      rmSync(join(resultsDir, `${meta.id}.json`), { force: true })
      rmSync(join(resultsDir, name), { force: true })
      results++
    }
    return { days, results }
  }

  const listDays = (): OverdueSnapshotMeta[] => {
    prune()
    return summaries(daysDir)
      .map((name) => readJson<OverdueSnapshotMeta>(join(daysDir, name)))
      .filter((meta): meta is OverdueSnapshotMeta => Boolean(meta))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  const getDay = (id: string): OverdueSnapshot | null =>
    isSafeId(id) ? readJson<OverdueSnapshot>(join(daysDir, `${id}.json`)) : null

  const saveDay = (input: unknown): OverdueSnapshotMeta => {
    const day = validateNewDay(input)
    prune()
    const at = now()
    const id = `${stampOf(at)}-${randomBytes(2).toString('hex')}`
    const meta: OverdueSnapshotMeta = {
      id,
      savedAt: at.toISOString(),
      savedBy: day.savedBy,
      savedByName: day.savedByName,
      fileModifiedAt: day.fileModifiedAt,
      percentage: day.percentage,
      rowCount: day.rows.length,
      coordinatorCount: day.table.length,
      totalBalance: Math.round(day.table.reduce((sum, row) => sum + row.balanceDue, 0) * 100) / 100,
    }
    writeJson(join(daysDir, `${id}.json`), { ...meta, rows: day.rows, table: day.table } satisfies OverdueSnapshot)
    writeJson(join(daysDir, `${id}.meta.json`), meta)
    return meta
  }

  const removeDay = (id: string): boolean => {
    if (!isSafeId(id)) return false
    const existed = existsSync(join(daysDir, `${id}.meta.json`))
    rmSync(join(daysDir, `${id}.json`), { force: true })
    rmSync(join(daysDir, `${id}.meta.json`), { force: true })
    return existed
  }

  const getSettings = (): SnapshotSettings =>
    readJson<SnapshotSettings>(settingsFile) ?? { percentage: null, updatedAt: null, updatedBy: null }

  const saveSettings = (percentage: unknown, by: unknown): SnapshotSettings => {
    const settings: SnapshotSettings = {
      percentage: validatePercentage(percentage),
      updatedAt: now().toISOString(),
      updatedBy: typeof by === 'string' && by ? by : null,
    }
    writeJson(settingsFile, settings)
    return settings
  }

  const listResults = (): ScoreResultMeta[] => {
    prune()
    return summaries(resultsDir)
      .map((name) => readJson<ScoreResultMeta>(join(resultsDir, name)))
      .filter((meta): meta is ScoreResultMeta => Boolean(meta))
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  }

  const getResult = (id: string): ScoreResult | null =>
    isSafeId(id) ? readJson<ScoreResult>(join(resultsDir, `${id}.json`)) : null

  /**
   * One result per pair of days. Saved days never change and each keeps its
   * own percentage, so generating the same pair again gives the same figures —
   * it replaces the earlier copy instead of listing it twice.
   */
  const saveResult = (input: unknown): ScoreResultMeta => {
    const result = validateNewResult(input)
    prune()
    const id = `${result.oldId}--${result.newId}`
    const meta: ScoreResultMeta = {
      id,
      generatedAt: now().toISOString(),
      generatedBy: result.generatedBy,
      generatedByName: result.generatedByName,
      oldId: result.oldId,
      newId: result.newId,
      oldSavedAt: result.oldSavedAt,
      newSavedAt: result.newSavedAt,
    }
    writeJson(join(resultsDir, `${id}.json`), { ...result, ...meta } satisfies ScoreResult)
    writeJson(join(resultsDir, `${id}.meta.json`), meta)
    return meta
  }

  const removeResult = (id: string): boolean => {
    if (!isSafeId(id)) return false
    const existed = existsSync(join(resultsDir, `${id}.meta.json`))
    rmSync(join(resultsDir, `${id}.json`), { force: true })
    rmSync(join(resultsDir, `${id}.meta.json`), { force: true })
    return existed
  }

  return { listDays, getDay, saveDay, removeDay, getSettings, saveSettings, listResults, getResult, saveResult, removeResult, prune }
}
