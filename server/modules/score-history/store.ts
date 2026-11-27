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
  checkLeadTarget,
  computePeriod,
  earliestDay,
  keysBetween,
  lockable,
  periodId,
  periodRange,
  recentKeys,
  ratioOn,
  checkGroupShares,
  checkPersonRatio,
  checkScoreGroups,
  DEFAULT_SCORE_GROUPS,
  personGroupWeightsOf,
  personWeightsOf,
  SCORE_GROUPS,
  type PersonRatio,
  type ScoreGroup,
  type ScoreGroupMap,
  type FinalRatio,
  type FinalWeights,
  type FinalWeightsSetting,
  type LeadTarget,
  type PeriodKind,
  type PeriodScores,
  type ScoreInputs,
} from '../../../src/lib/score-history'
import { toLocalISODate } from '../../../src/lib/utils'
import { checkWeighting, DEFAULT_WEIGHTING, planOfPeople, type PeriodWeighting, type WeightingSetting } from '../../../src/lib/weightage'

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
  /** The administrator's Self Leads targets by dates (16 Nov 2026). */
  leadTargets?: LeadTarget[]
  /** The administrator's ratios for particular coordinators (20 Nov 2026). */
  personRatios?: PersonRatio[]
  /** Which of the two scores each module counts in (21 Nov 2026); absent: the default. */
  scoreGroups?: ScoreGroupMap
  /** The one final score's weightage (27 Nov 2026); absent: the user's plans as given (DEFAULT_WEIGHTING). */
  weighting?: WeightingSetting
}

const groupsOf = (file: HistoryFile): ScoreGroupMap => file.scoreGroups ?? DEFAULT_SCORE_GROUPS

/** What a period is scored with: the ratios in force on its first day, the groups and the people's own ratios. */
function ratioPart(file: HistoryFile, start: string, people: () => { id: string; team: string | null }[] = () => []): Pick<PeriodScores, 'finalWeights' | 'personWeights' | 'scoreGroups' | 'groupWeights' | 'personGroupWeights' | 'weighting'> {
  const ratios = ratiosOf(file)
  const groupWeights: Partial<Record<ScoreGroup, FinalWeights>> = {}
  for (const g of SCORE_GROUPS) {
    const weights = ratioOn(ratios.filter((r) => r.group === g.id), start)?.weights
    if (weights) groupWeights[g.id] = weights
  }
  const personWeights = personWeightsOf(file.personRatios ?? [])
  const personGroupWeights = personGroupWeightsOf(file.personRatios ?? [])
  return {
    finalWeights: ratioOn(ratios.filter((r) => !r.group), start)?.weights ?? null,
    scoreGroups: groupsOf(file),
    ...(Object.keys(groupWeights).length ? { groupWeights } : {}),
    ...(Object.keys(personWeights).length ? { personWeights } : {}),
    ...(Object.keys(personGroupWeights).length ? { personGroupWeights } : {}),
    ...weightingPart(file, start, people),
  }
}

const weightingOf = (file: HistoryFile): WeightingSetting => file.weighting ?? DEFAULT_WEIGHTING

/** A period starting on or after the weightage's first day carries the plans and whose plan each person is on. */
function weightingPart(file: HistoryFile, start: string, people: () => { id: string; team: string | null }[]): { weighting?: PeriodWeighting } {
  const setting = weightingOf(file)
  if (start < setting.from) return {}
  return { weighting: { from: setting.from, plans: setting.plans, planOf: planOfPeople(setting.plans, people()) } }
}

const leadTargetsOf = (file: HistoryFile): LeadTarget[] => [...(file.leadTargets ?? [])].sort((a, b) => a.from.localeCompare(b.from))

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
  /** The Self Leads targets by dates, oldest first. */
  leadTargets(): LeadTarget[]
  /** Adds a dated Self Leads target, or changes the one with `id`. Throws a message for the screen. */
  saveLeadTarget(input: unknown, by: string, id?: string): LeadTarget
  /** Removes a dated Self Leads target; false when there was none. */
  deleteLeadTarget(id: string): boolean
  /** The ratios for particular coordinators. */
  personRatios(): PersonRatio[]
  /** Adds a per-person ratio, or changes the one with `id`. Throws a message for the screen. */
  savePersonRatio(input: unknown, by: string, id?: string): PersonRatio
  /** Removes a per-person ratio; false when there was none. */
  deletePersonRatio(id: string): boolean
  /** Which score each module counts in now. */
  scoreGroups(): ScoreGroupMap
  /** Moves modules between the two scores. Throws a message for the screen. */
  saveScoreGroups(input: unknown): ScoreGroupMap
  /** The one final score's weightage as it stands. */
  weighting(): WeightingSetting
  /** Replaces the weightage. Throws a message for the screen. */
  saveWeighting(input: unknown, by: string): WeightingSetting
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
  signature?: () => string,
  /** Today's coordinators and their team, for whose weightage plan each is on. */
  people: () => { id: string; team: string | null }[] = () => []
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
    // The Self Leads targets live in this file; open periods score against them as they stand.
    const data: ScoreInputs = { ...inputs(), selfLeadTargets: leadTargetsOf(read()) }
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
    // Each period locks with the ratios in force on its first day, as they stand now.
    for (const [kind, key] of due) {
      file.periods[periodId(kind, key)] = { ...computePeriod(data, kind, key, today), lockedAt: at, lockedBy: 'auto', ...ratioPart(file, periodRange(kind, key).start, people) }
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
      return { ...computePeriod(cachedInputs(), kind, key, today), lockedAt: null, lockedBy: null, ...ratioPart(file, periodRange(kind, key).start, people) }
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
    const again: PeriodScores = { ...computePeriod(freshInputs(), held.kind, held.key, today), lockedAt: now().toISOString(), lockedBy: by, finalWeights: held.finalWeights ?? null, ...(held.personWeights ? { personWeights: held.personWeights } : {}), ...(held.scoreGroups ? { scoreGroups: held.scoreGroups } : {}), ...(held.groupWeights ? { groupWeights: held.groupWeights } : {}), ...(held.personGroupWeights ? { personGroupWeights: held.personGroupWeights } : {}), ...(held.weighting ? { weighting: held.weighting } : {}) }
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
    if (checked.group) checkGroupShares(checked.weights, checked.group, groupsOf(file))
    if (list.some((r) => r.id !== id && r.from === checked.from && (r.group ?? null) === (checked.group ?? null))) throw new Error('Another ratio already starts on that date; change that one instead.')
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

  const leadTargets = (): LeadTarget[] => leadTargetsOf(read())

  const saveLeadTarget = (input: unknown, by: string, id?: string): LeadTarget => {
    const checked = checkLeadTarget(input)
    const file = read()
    const list = leadTargetsOf(file)
    if (id && !list.some((t) => t.id === id)) throw new Error('That target is not there any more.')
    if (list.some((t) => t.id !== id && t.from === checked.from)) throw new Error('Another target already starts on that date; change that one instead.')
    const target: LeadTarget = { id: id ?? randomUUID(), ...checked, updatedAt: now().toISOString(), updatedBy: by }
    file.leadTargets = [...list.filter((t) => t.id !== target.id), target].sort((a, b) => a.from.localeCompare(b.from))
    write(file)
    live = null
    return target
  }

  const deleteLeadTarget = (id: string): boolean => {
    const file = read()
    const list = leadTargetsOf(file)
    if (!list.some((t) => t.id === id)) return false
    file.leadTargets = list.filter((t) => t.id !== id)
    write(file)
    live = null
    return true
  }

  const personRatios = (): PersonRatio[] => [...(read().personRatios ?? [])]

  const savePersonRatio = (input: unknown, by: string, id?: string): PersonRatio => {
    const checked = checkPersonRatio(input)
    const file = read()
    const list = file.personRatios ?? []
    if (id && !list.some((r) => r.id === id)) throw new Error('That ratio is not there any more.')
    if (checked.group) checkGroupShares(checked.weights, checked.group, groupsOf(file))
    // One ratio per person for each score; one with no score covers both.
    const taken = checked.coordinatorIds.filter((c) => list.some((r) => r.id !== id && r.coordinatorIds.includes(c) && (!r.group || !checked.group || r.group === checked.group)))
    if (taken.length) throw new Error(`${taken.length === 1 ? 'One person already has' : `${taken.length} people already have`} a ratio of their own; change that one, or take them off it first.`)
    const ratio: PersonRatio = { id: id ?? randomUUID(), ...checked, updatedAt: now().toISOString(), updatedBy: by }
    file.personRatios = id ? list.map((r) => (r.id === id ? ratio : r)) : [...list, ratio]
    write(file)
    return ratio
  }

  const deletePersonRatio = (id: string): boolean => {
    const file = read()
    const list = file.personRatios ?? []
    if (!list.some((r) => r.id === id)) return false
    file.personRatios = list.filter((r) => r.id !== id)
    write(file)
    return true
  }

  const scoreGroups = (): ScoreGroupMap => groupsOf(read())

  const saveScoreGroups = (input: unknown): ScoreGroupMap => {
    const checked = checkScoreGroups(input)
    const file = read()
    file.scoreGroups = checked
    write(file)
    return checked
  }

  const weighting = (): WeightingSetting => weightingOf(read())

  const saveWeighting = (input: unknown, by: string): WeightingSetting => {
    const checked = checkWeighting(input)
    const file = read()
    const at = now().toISOString()
    const before = new Map(weightingOf(file).plans.map((p) => [p.id, JSON.stringify({ ...p, updatedAt: undefined, updatedBy: undefined })]))
    // A plan keeps who changed it last unless it changed now.
    const plans = checked.plans.map((p) => {
      const old = weightingOf(file).plans.find((x) => x.id === p.id)
      const same = before.get(p.id) === JSON.stringify({ ...p, updatedAt: undefined, updatedBy: undefined })
      return same && old ? old : { ...p, updatedAt: at, updatedBy: by }
    })
    file.weighting = { from: checked.from, plans, updatedAt: at, updatedBy: by }
    write(file)
    return file.weighting
  }

  return { lockDue, periods, relock, finalRatios, saveFinalRatio, deleteFinalRatio, leadTargets, saveLeadTarget, deleteLeadTarget, personRatios, savePersonRatio, deletePersonRatio, scoreGroups, saveScoreGroups, weighting, saveWeighting }
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
