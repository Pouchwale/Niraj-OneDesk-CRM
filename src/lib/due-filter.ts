/**
 * Filtering accounts by how far their payment due date is from today.
 *
 * A range is expressed in days from today to the due date: 0 is today, 7 is
 * a week away, -30 is thirty days overdue. `null` on either side leaves that
 * side open, so "overdue over 90 days" is `{ minDays: null, maxDays: -91 }`.
 * Coordinators can save their own ranges; those live per user in the browser.
 */

import { DAY_MS } from './constants'
import { parseISODate, todayISO } from './utils'
import { CRITICAL_AFTER_DAYS } from './status-rules'

export interface DueRange {
  minDays: number | null
  maxDays: number | null
}

export interface DueFilterPreset extends DueRange {
  id: string
  label: string
  /** Saved by the user rather than built in. */
  custom?: boolean
}

export const DUE_FILTER_PRESETS: DueFilterPreset[] = [
  { id: 'today', label: 'Due today', minDays: 0, maxDays: 0 },
  { id: 'next7', label: 'Due in the next 7 days', minDays: 0, maxDays: 7 },
  { id: 'next15', label: 'Due in the next 15 days', minDays: 0, maxDays: 15 },
  { id: 'next30', label: 'Due in the next 30 days', minDays: 0, maxDays: 30 },
  { id: 'overdue', label: 'Overdue (any)', minDays: null, maxDays: -1 },
  { id: 'overdue_1_30', label: 'Overdue 1–30 days', minDays: -30, maxDays: -1 },
  { id: 'overdue_31_60', label: 'Overdue 31–60 days', minDays: -60, maxDays: -31 },
  { id: 'overdue_61_90', label: 'Overdue 61–90 days', minDays: -90, maxDays: -61 },
  // The status rule's own line, so "critical" here means what the badge means.
  {
    id: 'overdue_critical',
    label: `Overdue over ${CRITICAL_AFTER_DAYS} days (critical)`,
    minDays: null,
    maxDays: -(CRITICAL_AFTER_DAYS + 1),
  },
  { id: 'overdue_90_plus', label: 'Overdue over 90 days', minDays: null, maxDays: -91 },
]

/** Whole days from today to the due date; negative once it has passed. */
export function daysUntilDue(dueDate: string, today: string = todayISO()): number {
  return Math.round((parseISODate(dueDate).getTime() - parseISODate(today).getTime()) / DAY_MS)
}

/** Records without a due date never match a range: there is nothing to measure. */
export function matchesDueRange(
  dueDate: string | null | undefined,
  range: DueRange,
  today: string = todayISO()
): boolean {
  if (!dueDate) return false
  const days = daysUntilDue(dueDate, today)
  if (Number.isNaN(days)) return false
  if (range.minDays !== null && days < range.minDays) return false
  if (range.maxDays !== null && days > range.maxDays) return false
  return true
}

export type DueRangeMode = 'due' | 'overdue'

/**
 * Turns the form's positive numbers into a range.
 *
 * People think in "overdue by 30 to 60 days", not "-60 to -30", so the form
 * takes a mode and two positive counts and the sign is handled here.
 */
export function rangeFromForm(mode: DueRangeMode, from: number | null, to: number | null): DueRange {
  const lo = from === null ? null : Math.max(0, Math.floor(from))
  const hi = to === null ? null : Math.max(0, Math.floor(to))
  if (mode === 'due') {
    return { minDays: lo, maxDays: hi }
  }
  // Overdue by `from`..`to` days means due `to`..`from` days ago; "overdue by
  // at least 1 day" is the floor so a due-today account never counts.
  return {
    minDays: hi === null ? null : -hi,
    maxDays: lo === null ? -1 : -Math.max(1, lo),
  }
}

/** Reads a range back into the form's terms, when it can be expressed that way. */
export function formFromRange(range: DueRange): { mode: DueRangeMode; from: number | null; to: number | null } {
  const overdue = (range.maxDays !== null && range.maxDays < 0) || (range.minDays !== null && range.minDays < 0)
  if (overdue) {
    return {
      mode: 'overdue',
      from: range.maxDays === null ? null : -range.maxDays,
      to: range.minDays === null ? null : -range.minDays,
    }
  }
  return { mode: 'due', from: range.minDays, to: range.maxDays }
}

/** "Due in the next 7 days", "Overdue 31–60 days", "Due in 3–10 days". */
export function describeRange(range: DueRange): string {
  const { mode, from, to } = formFromRange(range)
  if (mode === 'overdue') {
    if (from !== null && to !== null) return from === to ? `Overdue ${from} day${from === 1 ? '' : 's'}` : `Overdue ${from}–${to} days`
    if (from !== null && from > 1) return `Overdue over ${from - 1} days`
    if (to !== null) return `Overdue up to ${to} days`
    return 'Overdue (any)'
  }
  if (from !== null && to !== null) {
    if (from === 0 && to === 0) return 'Due today'
    if (from === 0) return `Due in the next ${to} days`
    return from === to ? `Due in ${from} days` : `Due in ${from}–${to} days`
  }
  if (from !== null) return `Due in ${from} days or more`
  if (to !== null) return `Due within ${to} days`
  return 'Any due date'
}

/* ===== Ageing report (bucketed) ===== */

/** The ageing report's buckets, in days overdue. */
export const AGEING_BUCKETS = [
  { key: 'due_0_30', from: 0, to: 30 },
  { key: 'due_31_60', from: 31, to: 60 },
  { key: 'due_61_90', from: 61, to: 90 },
  { key: 'due_91_120', from: 91, to: 120 },
  { key: 'due_121_plus', from: 121, to: null },
] as const

export type AgeingBucketKey = (typeof AGEING_BUCKETS)[number]['key']
export type AgeingRow = Partial<Record<AgeingBucketKey, number | null>>

/** Windows offered on the Overdue Payments screen, where there is no single due date. */
export const AGEING_FILTER_PRESETS: DueFilterPreset[] = [
  { id: 'age_0_30', label: 'Overdue 0–30 days', minDays: -30, maxDays: 0 },
  { id: 'age_31_60', label: 'Overdue 31–60 days', minDays: -60, maxDays: -31 },
  { id: 'age_61_90', label: 'Overdue 61–90 days', minDays: -90, maxDays: -61 },
  { id: 'age_91_120', label: 'Overdue 91–120 days', minDays: -120, maxDays: -91 },
  { id: 'age_121_plus', label: 'Overdue over 120 days', minDays: null, maxDays: -121 },
  { id: 'age_90_plus', label: 'Overdue over 90 days', minDays: null, maxDays: -91 },
]

/** True when the range only describes money that is past due. */
export function isOverdueRange(range: DueRange): boolean {
  return range.maxDays !== null && range.maxDays <= 0
}

/**
 * An ageing row matches when it carries money in any bucket that overlaps
 * the range. "Overdue by 45 to 75 days" therefore reads the 31–60 and 61–90
 * buckets - the report cannot say which day inside a bucket the money fell
 * on, so a bucket that touches the range counts.
 */
export function matchesAgeingRange(row: AgeingRow, range: DueRange): boolean {
  if (!isOverdueRange(range)) return false
  const { from, to } = formFromRange(range)
  const lo = from ?? 0
  const hi = to ?? Infinity
  return AGEING_BUCKETS.some((bucket) => {
    const amount = row[bucket.key] ?? 0
    if (amount <= 0) return false
    const bucketHi = bucket.to ?? Infinity
    return bucket.from <= hi && bucketHi >= lo
  })
}

/* ===== Saved ranges ===== */

function storageKey(userId: string): string {
  return `crm.due-filters.${userId}`
}

export function loadCustomPresets(userId: string): DueFilterPreset[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    const parsed = raw ? (JSON.parse(raw) as DueFilterPreset[]) : []
    return Array.isArray(parsed) ? parsed.map((p) => ({ ...p, custom: true })) : []
  } catch {
    return []
  }
}

function persist(userId: string, presets: DueFilterPreset[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(presets))
  } catch {
    // Saving the shortcut is a convenience; the filter still applies.
  }
}

export function saveCustomPreset(userId: string, label: string, range: DueRange): DueFilterPreset {
  const preset: DueFilterPreset = {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: label.trim() || describeRange(range),
    minDays: range.minDays,
    maxDays: range.maxDays,
    custom: true,
  }
  persist(userId, [...loadCustomPresets(userId), preset])
  return preset
}

export function removeCustomPreset(userId: string, id: string): void {
  persist(userId, loadCustomPresets(userId).filter((p) => p.id !== id))
}
