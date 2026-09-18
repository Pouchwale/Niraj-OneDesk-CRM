/**
 * The Weekly KPI module's calls to the server, and saving today's Overdue book.
 *
 * The book itself lives in this browser, so saving a day means working it out
 * here — every row, and the per-coordinator table with this day's targets —
 * and handing both to the server to keep.
 */

import {
  SNAPSHOT_ROUTES,
  snapshotDayUrl,
  snapshotResultUrl,
  type NewOverdueSnapshot,
  type NewScoreResult,
  type OverdueSnapshot,
  type OverdueSnapshotMeta,
  type ScoreResult,
  type ScoreResultListResponse,
  type ScoreResultMeta,
  type SnapshotListResponse,
  type SnapshotSettings,
} from '@shared/snapshots'
import { getOverduePayments } from './overdue-api'
import { readSyncLog } from './sync-log'
import { transformOverdueDay } from '@/features/snapshots/transform'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new Error('The server is not answering. Saved days are kept on the machine that runs the app.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ?? 'The server refused that.'
    throw new Error(message)
  }
  return body as T
}

export const listSavedDays = () => call<SnapshotListResponse>(SNAPSHOT_ROUTES.days)
export const getSavedDay = (id: string) => call<OverdueSnapshot>(snapshotDayUrl(id))
export const deleteSavedDay = (id: string) => call<{ removed: boolean }>(snapshotDayUrl(id), { method: 'DELETE' })

export const getTargetSettings = () => call<SnapshotSettings>(SNAPSHOT_ROUTES.settings)
export const saveTargetPercentage = (percentage: number, updatedBy: string) =>
  call<SnapshotSettings>(SNAPSHOT_ROUTES.settings, {
    method: 'PUT',
    body: JSON.stringify({ percentage, updatedBy }),
  })

export const listScoreResults = () => call<ScoreResultListResponse>(SNAPSHOT_ROUTES.results)
export const getScoreResult = (id: string) => call<ScoreResult>(snapshotResultUrl(id))
export const saveScoreResult = (input: NewScoreResult) =>
  call<{ result: ScoreResultMeta }>(SNAPSHOT_ROUTES.results, { method: 'POST', body: JSON.stringify(input) })

/**
 * Freezes today's Overdue book.
 *
 * Refused until a target percentage has been set: the day keeps the
 * percentage it was saved with for good, so a day saved without one could
 * never be used as the older day of a comparison.
 */
export async function saveTodaysOverdue(
  by: { id: string; name: string },
  nameOf: (coordinatorId: string) => string
): Promise<OverdueSnapshotMeta> {
  const settings = await getTargetSettings()
  if (settings.percentage === null) {
    throw new Error('Set the target percentage in Weekly KPI before saving a day.')
  }
  const rows = await getOverduePayments()
  const input: NewOverdueSnapshot = {
    savedBy: by.id,
    savedByName: by.name,
    fileModifiedAt: readSyncLog().overdue?.modifiedAt ?? null,
    percentage: settings.percentage,
    rows: rows as unknown as Record<string, unknown>[],
    table: transformOverdueDay(rows, settings.percentage, nameOf),
  }
  const { day } = await call<{ day: OverdueSnapshotMeta }>(SNAPSHOT_ROUTES.days, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return day
}
