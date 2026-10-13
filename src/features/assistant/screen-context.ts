/**
 * What the person is looking at, so the robot can speak to it.
 *
 * Two signals: the route says which screen is open, and the account panels
 * say which record is open on it. The record part is a tiny store rather than
 * a URL parameter because the tables open a panel with local state, and the
 * robot has to hear about that without every page learning to tell it.
 */

import { useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'

export type Screen =
  | 'dashboard'
  | 'companies'
  | 'overdue'
  | 'overview'
  | 'otif'
  | 'settings'
  | 'admin'
  | 'other'

export function screenFromPath(pathname: string): Screen {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return 'dashboard'
  if (path.startsWith('/companies')) return 'companies'
  if (path.startsWith('/overdue')) return 'overdue'
  if (path.startsWith('/admin/overview')) return 'overview'
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/otif')) return 'otif'
  if (path.startsWith('/settings')) return 'settings'
  return 'other'
}

export function useScreen(): Screen {
  const { pathname } = useLocation()
  return screenFromPath(pathname)
}

export interface FocusedRecord {
  type: 'company' | 'overdue_payment'
  id: string
  name: string
}

let focused: FocusedRecord | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** Called by an account panel when it opens. */
export function setFocusedRecord(record: FocusedRecord): void {
  if (focused && focused.type === record.type && focused.id === record.id) return
  focused = record
  emit()
}

/**
 * Called when a panel closes. Only clears its own record, so a panel closing
 * late cannot wipe the one that just opened.
 */
export function clearFocusedRecord(id: string): void {
  if (!focused || focused.id !== id) return
  focused = null
  emit()
}

export function getFocusedRecord(): FocusedRecord | null {
  return focused
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFocusedRecord(): FocusedRecord | null {
  return useSyncExternalStore(subscribe, getFocusedRecord, () => null)
}
