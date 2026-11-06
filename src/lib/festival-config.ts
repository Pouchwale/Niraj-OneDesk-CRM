/**
 * The administrator's festival settings (6 Nov 2026): the defaults, and the
 * clean-up every saved copy goes through, so a bad value from an old or
 * hand-edited browser can never break the celebrations for everyone.
 */

import type { CustomCelebration, FestivalConfig, FestivalOverride } from './types'

export const DEFAULT_FESTIVAL_CONFIG: FestivalConfig = {
  enabled: true,
  autoCelebrate: true,
  sound: true,
  voice: true,
  music: true,
  robiGreeting: true,
  decorations: true,
  intensity: 'normal',
  durationSec: 12,
  countdownDays: 7,
  festivals: {},
  custom: [],
  updatedBy: null,
  updatedAt: null,
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const YEAR = /^\d{4}$/
const ID = /^[a-z0-9_-]{1,48}$/

/** A real calendar day, yyyy-mm-dd (not 2026-02-30). */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

function cleanOverride(raw: unknown): FestivalOverride | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const out: FestivalOverride = {}
  if (typeof o.enabled === 'boolean') out.enabled = o.enabled
  if (typeof o.auto === 'boolean') out.auto = o.auto
  if (o.dates && typeof o.dates === 'object') {
    const dates: NonNullable<FestivalOverride['dates']> = {}
    for (const [year, value] of Object.entries(o.dates as Record<string, unknown>).slice(0, 20)) {
      if (!YEAR.test(year) || !value || typeof value !== 'object') continue
      const { start, end } = value as { start?: unknown; end?: unknown }
      // The date must sit in the year it is filed under, and an end never comes before the start.
      if (!isDay(start) || !start.startsWith(year)) continue
      dates[year] = isDay(end) && end > start && end <= addDays(start, 15) ? { start, end } : { start }
    }
    if (Object.keys(dates).length) out.dates = dates
  }
  const greeting = text(o.greeting, 300)
  if (greeting) out.greeting = greeting
  if (Array.isArray(o.colours)) {
    const colours = o.colours.slice(0, 9).map((c) => text(c, 24))
    if (colours.some(Boolean)) out.colours = colours
  }
  return Object.keys(out).length ? out : null
}

function cleanCustom(raw: unknown): CustomCelebration | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const id = text(c.id, 48)
  const name = text(c.name, 60)
  if (!ID.test(id) || !name || !isDay(c.date)) return null
  return {
    id,
    name,
    date: c.date,
    yearly: flag(c.yearly, true),
    theme: /^[a-z]{2,20}$/.test(String(c.theme)) ? String(c.theme) : 'celebration',
    emoji: text(c.emoji, 8) || '🎉',
    greeting: text(c.greeting, 300),
    about: text(c.about, 600),
    enabled: flag(c.enabled, true),
    auto: flag(c.auto, true),
  }
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** A complete, safe copy of whatever was saved; anything missing or wrong falls back to the default. */
export function cleanFestivalConfig(raw: unknown): FestivalConfig {
  const d = DEFAULT_FESTIVAL_CONFIG
  if (!raw || typeof raw !== 'object') return { ...d, festivals: {}, custom: [] }
  const r = raw as Record<string, unknown>
  const festivals: Record<string, FestivalOverride> = {}
  if (r.festivals && typeof r.festivals === 'object') {
    for (const [id, value] of Object.entries(r.festivals as Record<string, unknown>).slice(0, 100)) {
      if (!ID.test(id)) continue
      const o = cleanOverride(value)
      if (o) festivals[id] = o
    }
  }
  const custom: CustomCelebration[] = []
  const seen = new Set<string>()
  for (const value of Array.isArray(r.custom) ? r.custom.slice(0, 50) : []) {
    const c = cleanCustom(value)
    if (c && !seen.has(c.id)) {
      seen.add(c.id)
      custom.push(c)
    }
  }
  const intensity = r.intensity === 'light' || r.intensity === 'rich' ? r.intensity : 'normal'
  return {
    enabled: flag(r.enabled, d.enabled),
    autoCelebrate: flag(r.autoCelebrate, d.autoCelebrate),
    sound: flag(r.sound, d.sound),
    voice: flag(r.voice, d.voice),
    music: flag(r.music, d.music),
    robiGreeting: flag(r.robiGreeting, d.robiGreeting),
    decorations: flag(r.decorations, d.decorations),
    intensity,
    durationSec: clamp(r.durationSec, 5, 60, d.durationSec),
    countdownDays: clamp(r.countdownDays, 0, 30, d.countdownDays),
    festivals,
    custom,
    updatedBy: text(r.updatedBy, 64) || null,
    updatedAt: text(r.updatedAt, 40) || null,
  }
}
