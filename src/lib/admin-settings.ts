import type { DailyEntry } from '@/lib/types'

/**
 * Operational settings the team leader edits from Settings.
 *
 * Persisted, and read by the code that the settings claim to control. The
 * previous version lived in component state behind a fake delay: it confirmed
 * every change and applied none of them.
 */
export interface AdminSettings {
  /** A day with no orders and at least this much pending work turns red. */
  red_status_pending_threshold: number
  /** Upper edges, in days, of the first three delay buckets. */
  delay_bucket_boundaries: [number, number, number]
  allow_admin_edit: boolean
}

export const DEFAULT_SETTINGS: AdminSettings = {
  red_status_pending_threshold: 5,
  delay_bucket_boundaries: [3, 7, 10],
  allow_admin_edit: true,
}

const STORAGE_KEY = 'crm.settings'

function load(): AdminSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const stored = JSON.parse(raw) as Partial<AdminSettings>
    return { ...DEFAULT_SETTINGS, ...stored }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

let settings: AdminSettings = load()
const listeners = new Set<() => void>()

export function getSettings(): AdminSettings {
  return settings
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateSettings(patch: Partial<AdminSettings>): AdminSettings {
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Keep the in-memory value; the next load falls back to defaults.
  }
  for (const listener of listeners) listener()
  return settings
}

export function resetSettings(): void {
  updateSettings({ ...DEFAULT_SETTINGS })
}

/**
 * The traffic light on a daily entry.
 *
 * The single place this rule lives; the settings page, the entry form preview
 * and the team summaries all get it from here.
 */
export function computeEntryStatus(
  entry: Pick<Partial<DailyEntry>, 'is_leave' | 'orders_received' | 'pending_work'>,
  threshold: number = settings.red_status_pending_threshold
): 'leave' | 'red' | 'green' {
  if (entry.is_leave) return 'leave'
  if ((entry.orders_received ?? 0) === 0 && (entry.pending_work ?? 0) >= threshold) return 'red'
  return 'green'
}
