/**
 * One channel for "celebrate now" (6 Nov 2026), so Robi, the header chip, the
 * Festivals page and the automatic celebration all go through the one
 * overlay, and only one celebration is ever on screen.
 */

import type { Festival } from './festival-calendar'

export type CelebrationMode = 'full' | 'ambient'

export interface CelebrationRequest {
  festivalId: string
  /** The festival itself, for a preview of settings not saved yet. */
  festival?: Festival
  /** full: the full-screen celebration with its greeting. ambient: effects over the page. */
  mode: CelebrationMode
  reason: 'auto' | 'user' | 'robi' | 'preview'
  /** How long it runs; defaults to the administrator's setting (full) or 8 seconds. */
  seconds?: number
}

type Listener = (request: CelebrationRequest | null) => void
const listeners = new Set<Listener>()

/** Starts a celebration, replacing any that is running. */
export function celebrate(request: CelebrationRequest): void {
  for (const l of listeners) l(request)
}

export function stopCelebration(): void {
  for (const l of listeners) l(null)
}

export function onCelebration(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* The festival panel can be opened from anywhere (Robi's reply, the celebration card). */
type PanelListener = (festivalId: string | null) => void
const panelListeners = new Set<PanelListener>()

export function openFestivalPanel(festivalId: string | null = null): void {
  for (const l of panelListeners) l(festivalId)
}

export function onFestivalPanel(listener: PanelListener): () => void {
  panelListeners.add(listener)
  return () => {
    panelListeners.delete(listener)
  }
}
