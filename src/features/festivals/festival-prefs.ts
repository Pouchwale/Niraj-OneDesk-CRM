/**
 * Each person's own festival choices (6 Nov 2026), kept in this browser:
 * whether the celebration plays by itself, sound, Robi's voice, and a gentler
 * mode with fewer effects. Anything not chosen follows the administrator's
 * defaults, so a change there reaches everyone who has not chosen.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { FestivalConfig } from '@/lib/types'

export interface FestivalPrefs {
  /** The full-screen celebration plays by itself on a festival day. */
  auto: boolean
  /** No sound or voice at all. */
  muted: boolean
  /** Robi says greetings aloud. */
  voice: boolean
  /** Fewer, shorter effects. */
  calm: boolean
}

type Chosen = Partial<FestivalPrefs>

const prefsKey = (userId: string) => `onedesk.festivals.${userId}`
const doneKey = (userId: string) => `onedesk.festivals.celebrated.${userId}`

const listeners = new Set<() => void>()
const cache = new Map<string, { raw: string | null; value: Chosen }>()
const EMPTY: Chosen = {}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage blocked: the defaults apply
  }
}

function chosenFor(userId: string | undefined): Chosen {
  if (!userId) return EMPTY
  const raw = read(prefsKey(userId))
  const hit = cache.get(userId)
  if (hit && hit.raw === raw) return hit.value
  let value: Chosen = {}
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    for (const k of ['auto', 'muted', 'voice', 'calm'] as const) if (typeof parsed[k] === 'boolean') value[k] = parsed[k] as boolean
  } catch {
    value = {}
  }
  cache.set(userId, { raw, value })
  return value
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('onedesk.festivals.')) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The person's choices over the administrator's defaults. */
export function prefsFrom(chosen: Chosen, config: FestivalConfig): FestivalPrefs {
  return {
    auto: chosen.auto ?? true,
    muted: chosen.muted ?? !config.sound,
    voice: chosen.voice ?? config.voice,
    calm: chosen.calm ?? false,
  }
}

export function readFestivalPrefs(userId: string | undefined, config: FestivalConfig): FestivalPrefs {
  return prefsFrom(chosenFor(userId), config)
}

export function setFestivalPrefs(userId: string, patch: Chosen): void {
  const next = { ...chosenFor(userId), ...patch }
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(next))
  } catch {
    /* storage blocked: the choice lasts until the page reloads */
    cache.set(userId, { raw: read(prefsKey(userId)), value: next })
  }
  for (const l of listeners) l()
}

/** The person's festival preferences, live, and a setter. */
export function useFestivalPrefs(userId: string | undefined, config: FestivalConfig): [FestivalPrefs, (patch: Chosen) => void] {
  const chosen = useSyncExternalStore(subscribe, () => chosenFor(userId), () => EMPTY)
  const prefs = useMemo(() => prefsFrom(chosen, config), [chosen, config])
  const set = useCallback((patch: Chosen) => userId && setFestivalPrefs(userId, patch), [userId])
  return [prefs, set]
}

/* ----- The automatic celebration plays once a day per festival per person ----- */

function done(userId: string): string[] {
  try {
    const list = JSON.parse(read(doneKey(userId)) ?? '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function celebratedOn(userId: string, date: string, festivalId: string): boolean {
  return done(userId).includes(`${date}:${festivalId}`)
}

export function markCelebrated(userId: string, date: string, festivalId: string): void {
  try {
    localStorage.setItem(doneKey(userId), JSON.stringify([...done(userId), `${date}:${festivalId}`].slice(-30)))
  } catch {
    /* storage blocked: it may play again after a reload */
  }
}
