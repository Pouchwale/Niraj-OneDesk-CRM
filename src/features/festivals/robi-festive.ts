/**
 * What Robi's widget asks of the festival system (6 Nov 2026), kept here so
 * the widget itself only gains a few lines: his festive hello, his own answer
 * to a festival wish or question, his voice, and a small celebration.
 */

import { demoCompanyStore } from '@/lib/demo-companies'
import { DEFAULT_FESTIVAL_CONFIG } from '@/lib/festival-config'
import type { FestivalConfig } from '@/lib/types'
import { speak } from './festival-audio'
import { celebrate } from './festival-bus'
import { festivalChatReply, festivalContextLine, festiveHello, istDate, resolveFestivals, type Festival, type FestivalReply, type FestiveHello } from './festival-calendar'
import { readFestivalPrefs } from './festival-prefs'

let memo: { saved: FestivalConfig | null; festivals: Festival[] } | null = null

function current(): { config: FestivalConfig; festivals: Festival[] } {
  const saved = demoCompanyStore.festivalConfig ?? null
  if (!memo || memo.saved !== saved) memo = { saved, festivals: resolveFestivals(saved) }
  return { config: saved ?? DEFAULT_FESTIVAL_CONFIG, festivals: memo.festivals }
}

/** Robi's hello on a festival day (or the countdown line before a big one); null on an ordinary day. */
export function robiFestiveHello(firstName: string): FestiveHello | null {
  const { config, festivals } = current()
  if (!config.enabled || !config.robiGreeting) return null
  return festiveHello(firstName, istDate(), festivals, config.countdownDays)
}

/** Robi's own answer to a festival wish or question; null sends the message to his usual answer. */
export function robiFestivalReply(message: string, firstName: string): FestivalReply | null {
  const { config, festivals } = current()
  if (!config.enabled) return null
  return festivalChatReply(message, festivals, istDate(), firstName)
}

/** Robi says it aloud when this person has sound and his voice on. */
export function robiSpeak(userId: string | undefined, text: string): void {
  const { config } = current()
  const prefs = readFestivalPrefs(userId, config)
  if (!config.enabled || !config.voice || prefs.muted || !prefs.voice) return
  speak(text)
}

/** A short burst of the festival's effects over the page (with Robi's wish reply). */
export function robiCelebrate(festivalId: string): void {
  celebrate({ festivalId, mode: 'ambient', reason: 'robi', seconds: 7 })
}

/** A line for Robi's AI about today's and the next festival; null when festivals are off. */
export function robiFestivalContext(): string | null {
  const { config, festivals } = current()
  return config.enabled ? festivalContextLine(istDate(), festivals) : null
}
