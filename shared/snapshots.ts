/**
 * Saved days of the Overdue book, and the weekly coordinator score worked out
 * from two of them (the Weekly KPI module).
 *
 * The team leader used to download the Overdue module every week and compare
 * the old file with the new one to score each coordinator. The system refreshes
 * that book every day, so last week's figures are gone by the time anyone wants
 * them. A saved day is a frozen copy of the book as it stood when it was saved;
 * two of them stand in for the two files she compared by hand.
 *
 * Shared by the server, which stores the days, and the browser, which works
 * them out — the coordinator names and the set-aside rules live there.
 */

import { API_PREFIX } from './api'

export const SNAPSHOT_ROUTES = {
  days: `${API_PREFIX}/snapshots`,
  settings: `${API_PREFIX}/snapshots/settings`,
  results: `${API_PREFIX}/snapshots/results`,
} as const

export const snapshotDayUrl = (id: string) => `${SNAPSHOT_ROUTES.days}/${encodeURIComponent(id)}`
export const snapshotResultUrl = (id: string) => `${SNAPSHOT_ROUTES.results}/${encodeURIComponent(id)}`

/** Saved days and results older than this are removed automatically. */
export const SNAPSHOT_RETENTION_DAYS = 90

/** One coordinator's line of a saved day, in the layout of Niki's sheet. */
export interface SnapshotTableRow {
  coordinatorId: string
  coordinatorName: string
  balanceDue: number
  due0to30: number
  due31to60: number
  due61to90: number
  due91to120: number
  due121Plus: number
  /** The percentage × (0-30 + 31-60 + 61-90 + 91-120). */
  target0to120: number
  /** The percentage × 121+. */
  target121Plus: number
}

export interface OverdueSnapshotMeta {
  id: string
  savedAt: string
  savedBy: string
  savedByName: string
  /** When the Excel file this data came from was last saved, if known. */
  fileModifiedAt: string | null
  /** The target percentage in force when the day was saved. It never changes afterwards. */
  percentage: number
  rowCount: number
  coordinatorCount: number
  totalBalance: number
}

export interface OverdueSnapshot extends OverdueSnapshotMeta {
  /** Every Overdue row as it stood, with all its details. */
  rows: Record<string, unknown>[]
  /** The day worked out per coordinator, frozen when it was saved. */
  table: SnapshotTableRow[]
}

export type NewOverdueSnapshot = Pick<
  OverdueSnapshot,
  'savedBy' | 'savedByName' | 'fileModifiedAt' | 'percentage' | 'rows' | 'table'
>

export interface SnapshotSettings {
  /** One percentage for both targets, applied to days saved from then on. */
  percentage: number | null
  updatedAt: string | null
  updatedBy: string | null
}

/** One coordinator's line of the result, in the layout of Niki's sheet. */
export interface ScoreRow {
  coordinatorName: string
  target30to120: number
  achieve30to120: number
  target120Plus: number
  achieve120Plus: number
  kpiScore: number
}

export interface ScoreResultMeta {
  id: string
  generatedAt: string
  generatedBy: string
  generatedByName: string
  oldId: string
  newId: string
  oldSavedAt: string
  newSavedAt: string
}

export interface ScoreResult extends ScoreResultMeta {
  rows: ScoreRow[]
  flags: string[]
  oldTable: SnapshotTableRow[]
  newTable: SnapshotTableRow[]
}

export type NewScoreResult = Omit<ScoreResult, 'id' | 'generatedAt'>

export interface SnapshotListResponse {
  days: OverdueSnapshotMeta[]
  settings: SnapshotSettings
}

export interface ScoreResultListResponse {
  results: ScoreResultMeta[]
}
