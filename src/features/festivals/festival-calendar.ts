/**
 * Robi's festival calendar (6 Nov 2026): which festival is on today in India
 * (IST, whatever the computer's own clock zone), what is coming up, the
 * countdown, and the festive lines Robi says.
 *
 * Dates come only from the Panchang table (festival-dates.ts), the
 * administrator's corrections, the fixed national days and the company's own
 * celebrations. A festival with no known date for a year is simply not shown
 * for that year, and the admin settings list it as missing, rather than
 * guessing a day that may be wrong.
 */

import { cleanFestivalConfig, DEFAULT_FESTIVAL_CONFIG } from '@/lib/festival-config'
import type { CustomCelebration, FestivalConfig } from '@/lib/types'
import { FESTIVAL_INFO, type FestivalInfo } from './festival-data'
import { DATE_NOTES, PANCHANG_DATES, type DateEntry } from './festival-dates'
import { makeGreeting, toneFor } from './festival-greetings'
import { NAVRATRI_WEEKDAY_COLOURS, THEMES, type ThemeKey } from './festival-themes'

export interface Festival {
  id: string
  name: string
  alt: string | null
  salutation: string
  emoji: string
  /** The emoji for greetings shared to phones (the flag on the national days). */
  shareEmoji: string
  theme: ThemeKey
  major: boolean
  priority: number
  panchang: string
  regions: string
  regional: string[]
  about: string
  traditions: string[]
  facts: string[]
  wishes: string[]
  robi: string[]
  aliases: string[]
  nearAliases: string[]
  everyDay: boolean
  custom: boolean
  /** Shown and celebrated (the administrator can switch it off). */
  enabled: boolean
  /** Plays the full-screen celebration by itself on its day. */
  auto: boolean
  /** The administrator's own wish, used before the built-in ones. */
  greeting: string | null
  colours: string[] | null
  fixed: { month: number; day: number } | null
  panchangDates: Partial<Record<number, DateEntry>>
  /** Year → a caution about the Panchang date (sources differ, not yet published). */
  notes: Partial<Record<number, string>>
  adminDates: Record<number, { start: string; end?: string }>
  customDate: { date: string; yearly: boolean } | null
}

export interface FestivalSpan {
  start: string
  end: string
  /** Where the date came from: the Panchang table, the administrator, a fixed national day, or a company day. */
  source: 'panchang' | 'admin' | 'fixed' | 'custom'
}

/** A festival on a given day. */
export interface FestivalDay {
  festival: Festival
  date: string
  start: string
  end: string
  /** 1 on the first day. */
  day: number
  days: number
}

export interface UpcomingFestival extends FestivalSpan {
  festival: Festival
  inDays: number
}

/* ===================== Dates in India ===================== */

const IST_OFFSET_MS = 330 * 60_000

/** Today's date in India, yyyy-mm-dd, whatever time zone the computer is set to. */
export function istDate(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

const utc = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole days from a to b (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

export function addDays(day: string, n: number): string {
  return new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Sunday = 0. */
export const weekdayOf = (day: string) => new Date(utc(day)).getUTCDay()

/** "Sunday, 8 November 2026". */
export function longDate(day: string): string {
  return new Date(utc(day)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "Sun, 8 Nov". */
export function shortDate(day: string, withYear = false): string {
  return new Date(utc(day)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  })
}

export interface Countdown {
  days: number
  hours: number
  minutes: number
  seconds: number
  /** Milliseconds left; 0 once the day has begun. */
  ms: number
}

/** Time left until midnight in India at the start of that day. */
export function countdownTo(day: string, now: Date = new Date()): Countdown {
  const ms = Math.max(0, utc(day) - IST_OFFSET_MS - now.getTime())
  const s = Math.floor(ms / 1000)
  return { days: Math.floor(s / 86_400), hours: Math.floor((s % 86_400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, ms }
}

/* ===================== The festival list ===================== */

const pad = (n: number) => String(n).padStart(2, '0')
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

function fromInfo(info: FestivalInfo, config: FestivalConfig): Festival {
  const o = config.festivals[info.id] ?? {}
  const adminDates: Festival['adminDates'] = {}
  for (const [year, d] of Object.entries(o.dates ?? {})) adminDates[Number(year)] = d
  return {
    id: info.id,
    name: info.name,
    alt: info.alt ?? null,
    salutation: info.salutation,
    emoji: info.emoji,
    shareEmoji: info.shareEmoji ?? info.emoji,
    theme: info.theme,
    major: info.major,
    priority: info.priority,
    panchang: info.panchang,
    regions: info.regions,
    regional: info.regional ?? [],
    about: info.about,
    traditions: info.traditions,
    facts: info.facts,
    wishes: info.wishes,
    robi: info.robi,
    aliases: info.aliases,
    nearAliases: info.nearAliases ?? [],
    everyDay: !!info.everyDay,
    custom: false,
    enabled: o.enabled ?? true,
    auto: o.auto ?? info.major,
    greeting: o.greeting?.trim() || null,
    colours: o.colours ?? null,
    fixed: info.fixed ?? null,
    panchangDates: PANCHANG_DATES[info.id] ?? {},
    notes: DATE_NOTES[info.id] ?? {},
    adminDates,
    customDate: null,
  }
}

function fromCustom(c: CustomCelebration): Festival {
  const theme = (c.theme in THEMES ? c.theme : 'celebration') as ThemeKey
  const greeting = c.greeting.trim() || null
  return {
    id: `custom:${c.id}`,
    name: c.name,
    alt: null,
    salutation: `Happy ${c.name}`,
    emoji: c.emoji || '🎉',
    shareEmoji: c.emoji || '🎉',
    theme,
    major: true,
    priority: 65,
    panchang: c.yearly ? 'Every year on this date' : 'Once',
    regions: 'Our company',
    regional: [],
    about: c.about.trim() || `${c.name} is one of our own celebrations.`,
    traditions: [],
    facts: [],
    wishes: [greeting ?? `Wishing everyone a wonderful ${c.name}`],
    robi: [`Happy ${c.name}, {name}! ${c.emoji || '🎉'}`],
    aliases: [c.name.toLowerCase()],
    nearAliases: [],
    everyDay: false,
    custom: true,
    enabled: c.enabled,
    auto: c.auto,
    greeting,
    colours: null,
    fixed: null,
    panchangDates: {},
    notes: {},
    adminDates: {},
    customDate: { date: c.date, yearly: c.yearly },
  }
}

/** Every festival with the administrator's settings applied (switched-off ones included, marked). */
export function resolveFestivals(config: FestivalConfig | null | undefined): Festival[] {
  const cfg = config ? cleanFestivalConfig(config) : DEFAULT_FESTIVAL_CONFIG
  return [...FESTIVAL_INFO.map((info) => fromInfo(info, cfg)), ...cfg.custom.map(fromCustom)]
}

/** A festival's days in a year, or null when that year's date is not known. */
export function datesFor(f: Festival, year: number): FestivalSpan | null {
  const admin = f.adminDates[year]
  if (admin) return { start: admin.start, end: admin.end ?? admin.start, source: 'admin' }
  const entry = f.panchangDates[year]
  if (entry) return typeof entry === 'string' ? { start: entry, end: entry, source: 'panchang' } : { start: entry[0], end: entry[1], source: 'panchang' }
  if (f.fixed) {
    const day = `${year}-${pad(f.fixed.month)}-${pad(f.fixed.day)}`
    return { start: day, end: day, source: 'fixed' }
  }
  if (f.customDate) {
    const { date, yearly } = f.customDate
    const first = Number(date.slice(0, 4))
    if (year === first) return { start: date, end: date, source: 'custom' }
    if (yearly && year > first) {
      const md = date.slice(5) === '02-29' && !isLeap(year) ? '02-28' : date.slice(5)
      return { start: `${year}-${md}`, end: `${year}-${md}`, source: 'custom' }
    }
  }
  return null
}

/** The caution on that year's Panchang date, if sources differ; none once the administrator has set the date. */
export function noteFor(f: Festival, year: number): string | null {
  return datesFor(f, year)?.source === 'panchang' ? f.notes[year] ?? null : null
}

/** A later day of a multi-day festival ranks below another festival's own day. */
const rank = (d: FestivalDay) => d.festival.priority - (d.day > 1 ? 30 : 0)

/** The festivals on that day, the one to celebrate first. */
export function festivalsOn(date: string, festivals: readonly Festival[]): FestivalDay[] {
  const year = Number(date.slice(0, 4))
  const out: FestivalDay[] = []
  for (const f of festivals) {
    if (!f.enabled) continue
    for (const y of [year, year - 1]) {
      const span = datesFor(f, y)
      if (span && span.start <= date && date <= span.end) {
        out.push({ festival: f, date, start: span.start, end: span.end, day: daysBetween(span.start, date) + 1, days: daysBetween(span.start, span.end) + 1 })
        break
      }
    }
  }
  return out.sort((a, b) => rank(b) - rank(a) || a.festival.name.localeCompare(b.festival.name))
}

/** Festivals starting after that day, soonest first, within the horizon. */
export function upcomingFestivals(date: string, festivals: readonly Festival[], horizonDays = 400): UpcomingFestival[] {
  const year = Number(date.slice(0, 4))
  const out: UpcomingFestival[] = []
  for (const f of festivals) {
    if (!f.enabled) continue
    for (const y of [year, year + 1, year + 2]) {
      const span = datesFor(f, y)
      if (!span || span.start <= date) continue
      const inDays = daysBetween(date, span.start)
      if (inDays <= horizonDays) out.push({ festival: f, ...span, inDays })
      break
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || b.festival.priority - a.festival.priority)
}

/** The festival's current or next days from that day on, or null when no date is known. */
export function nextSpan(f: Festival, date: string): UpcomingFestival | null {
  const year = Number(date.slice(0, 4))
  for (const y of [year - 1, year, year + 1, year + 2]) {
    const span = datesFor(f, y)
    if (span && span.end >= date) return { festival: f, ...span, inDays: Math.max(0, daysBetween(date, span.start)) }
  }
  return null
}

/** Its most recent days before that day. */
export function lastSpan(f: Festival, date: string): FestivalSpan | null {
  const year = Number(date.slice(0, 4))
  for (const y of [year, year - 1]) {
    const span = datesFor(f, y)
    if (span && span.end < date) return span
  }
  return null
}

/** The next major festival within that many days (the countdown), if any. */
export function comingSoon(date: string, festivals: readonly Festival[], withinDays: number): UpcomingFestival | null {
  if (withinDays <= 0) return null
  return upcomingFestivals(date, festivals, withinDays).find((u) => u.festival.major) ?? null
}

/** Built-in festivals switched on with no known date that year: the administrator should add them. */
export function missingDates(festivals: readonly Festival[], year: number): Festival[] {
  return festivals.filter((f) => !f.custom && f.enabled && !datesFor(f, year))
}

/**
 * The Vikram Samvat year on that day, both ways it is counted: from Chaitra
 * (Gudi Padwa, north India) and from Kartika (the Gujarati New Year after
 * Diwali). Null where that year's new-year date is not known.
 */
export function vikramSamvat(date: string, festivals: readonly Festival[]): { chaitradi: number | null; kartikadi: number | null } {
  const year = Number(date.slice(0, 4))
  const start = (id: string) => {
    const f = festivals.find((x) => x.id === id)
    return f ? datesFor(f, year)?.start ?? null : null
  }
  const padwa = start('gudi_padwa')
  const bestu = start('nutan_varsh')
  return {
    chaitradi: padwa ? year + (date >= padwa ? 57 : 56) : null,
    kartikadi: bestu ? year + (date >= bestu ? 57 : 56) : null,
  }
}

/* ===================== Navratri nights ===================== */

export const COLOUR_HEX: Record<string, string> = {
  orange: '#f97316', white: '#f8fafc', red: '#dc2626', 'royal blue': '#1d4ed8', blue: '#2563eb', yellow: '#facc15',
  green: '#16a34a', grey: '#6b7280', gray: '#6b7280', purple: '#9333ea', 'peacock green': '#0d9488', pink: '#ec4899',
  'sky blue': '#38bdf8', maroon: '#7f1d1d', golden: '#eab308', gold: '#eab308', 'rani pink': '#db2777', magenta: '#c026d3',
}

/**
 * "Night 3 of 9" for Navratri, "Vasi Uttarayan" for the second kite day,
 * "Day 2 of 4" for another festival that runs several days. Navratri nights
 * are not named after the goddess's forms: when a tithi is skipped or doubled
 * the night-to-form match moves, and a wrong name is worse than none.
 */
export function dayLabel(fd: FestivalDay): string | null {
  if (fd.days <= 1) return null
  if (fd.festival.id === 'navratri') return `Night ${fd.day} of ${fd.days}`
  if (fd.festival.id === 'makar_sankranti') return fd.day === 1 ? 'Uttarayan' : 'Vasi Uttarayan'
  return `Day ${fd.day} of ${fd.days}`
}

/**
 * Navratri's colour of the day: the administrator's list when set; else the
 * weekday colour, which every published list follows for the first seven
 * days. The last days' colours change every year, so they show only when the
 * administrator has entered them.
 */
export function navratriColour(fd: FestivalDay): { name: string; hex: string } | null {
  if (fd.festival.id !== 'navratri') return null
  const chosen = fd.festival.colours?.[fd.day - 1]?.trim()
  if (chosen) return { name: chosen, hex: COLOUR_HEX[chosen.toLowerCase()] ?? '#db2777' }
  return fd.day <= 7 ? NAVRATRI_WEEKDAY_COLOURS[weekdayOf(fd.date)] : null
}

/* ===================== What Robi says ===================== */

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
/** The same choice all day (so Robi does not change his mind on every open). */
export const pickFor = <T,>(list: readonly T[], seed: string): T => list[hash(seed) % list.length]

const named = (line: string, name: string) => line.split('{name}').join(name || 'friend')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export interface FestiveHello {
  kind: 'today' | 'soon'
  festivalId: string
  /** today: the whole greeting. soon: a sentence to add after the usual hello. */
  text: string
}

/** Robi's greeting for the festival ({name} filled in), with the night or day of a multi-day one. */
export function festivalLine(f: Festival, firstName: string, today: string, fd: FestivalDay | null = null): string {
  let text = f.greeting ? `${f.salutation}, ${firstName || 'friend'}! ${f.emoji} ${f.greeting}` : named(pickFor(f.robi, `${today}:${f.id}`), firstName)
  if (!fd || fd.days <= 1) return text
  if (f.id === 'navratri') {
    const colour = navratriColour(fd)
    text += ` It’s night ${fd.day} of ${fd.days}${colour ? `, and today’s colour is ${colour.name.toLowerCase()}` : ''}.`
  } else if (f.id === 'makar_sankranti') {
    if (fd.day === 2) text += ' Today is Vasi Uttarayan: one more day of kites!'
  } else {
    text += ` Day ${fd.day} of ${fd.days}.`
  }
  return text
}

/** Robi's hello on a festival day, or the countdown line before a major one. */
export function festiveHello(firstName: string, today: string, festivals: readonly Festival[], countdownDays: number): FestiveHello | null {
  const fd = festivalsOn(today, festivals)[0]
  if (fd) return { kind: 'today', festivalId: fd.festival.id, text: festivalLine(fd.festival, firstName, today, fd) }
  const soon = comingSoon(today, festivals, countdownDays)
  if (!soon) return null
  return {
    kind: 'soon',
    festivalId: soon.festival.id,
    text: soon.inDays === 1 ? `${soon.festival.name} is tomorrow! ${soon.festival.emoji}` : `Only ${plural(soon.inDays, 'day')} to ${soon.festival.name}! ${soon.festival.emoji}`,
  }
}

/** One line for Robi's AI about today's and the next festival, so his answers know the day. */
export function festivalContextLine(today: string, festivals: readonly Festival[]): string {
  const on = festivalsOn(today, festivals)
  const next = upcomingFestivals(today, festivals, 60).find((u) => u.festival.major) ?? upcomingFestivals(today, festivals, 60)[0]
  const parts = [`Today in India (IST) is ${longDate(today)}.`]
  if (on.length) parts.push(`Festival today: ${on.map((d) => d.festival.name + (dayLabel(d) ? ` (${dayLabel(d)})` : '')).join(', ')}.`)
  if (next) parts.push(`Next festival: ${next.festival.name} on ${longDate(next.start)}, in ${plural(next.inDays, 'day')}.`)
  return parts.join(' ')
}

/* ===================== Robi's replies to wishes and festival questions ===================== */

export interface FestivalReply {
  text: string
  /** A shorter version for Robi's voice. */
  speak: string
  festivalId: string | null
  /** Robi should throw a small celebration with the reply. */
  celebrate: boolean
  kind: 'wish' | 'when' | 'about' | 'list' | 'greeting'
}

/** Lower case, accents and punctuation gone, padded with spaces so " word " finds whole words. */
const norm = (s: string) =>
  ` ${s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `

const has = (message: string, words: RegExp) => words.test(message)

const WISH = /\b(happy|shubh|subh|wish|wishes|wishing|greetings|mubarak|shubhkamna|shubhkamnaye|shubhkamnayein|shubhechha|badhai|hardik|abhinandan|cheers)\b/
const WHEN = /\b(when|kab|date|dates|which day|what day|how many days|how long|days left|countdown|kitne din)\b/
const ABOUT = /\b(about|what is|what s|whats|why|story|history|significance|meaning|fact|facts|tradition|traditions|celebrated|celebrate|tell me|explain|kya hai|kya hota)\b/
const GENERATE = /\b(write|draft|generate|create|compose|make|prepare|suggest|give me|send me)\b/
const GREETING_WORDS = /\b(greeting|greetings|wish|wishes|message|msg|card|caption|post|note)\b/
const FESTIVAL_WORDS = /\b(festival|festivals|festive|tyohar|tehvar|utsav)\b/
const LIST = /\b(upcoming|next|coming|list|calendar|this month|this year|today|todays|aaj)\b/
/** Words that mean a work question, not a festival chat ("when is Ganesh Traders' payment due?"). */
const BUSINESS =
  /\b(overdue|payment|payments|invoice|invoices|customer|customers|client|clients|company|companies|quotation|quotations|follow ?up|followups|amount|due|bill|bills|lead|leads|score|scores|task|tasks|plan|coordinator|coordinators|report|send|mail|email|remind|reminder|traders|trading|enterprise|enterprises|industries|pvt|ltd|limited|corporation|agency|sales|order|orders|dispatch|stock)\b/
/** Phrases that are a greeting all by themselves. */
const GREETING_PHRASES = new Set([
  'kai po che', 'saal mubarak', 'sal mubarak', 'pongalo pongal', 'jai shri ram', 'jai shree ram', 'har har mahadev', 'ganpati bappa morya',
  'holi hai', 'jai mata di', 'jai ambe', 'jai hind', 'jai shri krishna', 'jai shree krishna', 'jai bajrang bali', 'jai hanuman',
  'navreh mubarak', 'om namah shivaya', 'nutan varshabhinandan', 'nutan varsh abhinandan',
])
/** Single words that are also people's or firms' names: they count only in a clear wish ("happy ganpati"). */
const WEAK = new Set(['ganesh', 'ganesha', 'ganpati', 'ganapati', 'bappa', 'govardhan', 'rakhi', 'garba', 'dandiya', 'holika', 'vasant'])

interface AliasHit {
  festival: Festival
  alias: string
}

function findFestival(m: string, festivals: readonly Festival[], today: string, wishy: boolean): AliasHit | null {
  let best: AliasHit | null = null
  for (const f of festivals) {
    if (!f.enabled) continue
    const near = (() => {
      const span = nextSpan(f, addDays(today, -2))
      return !!span && span.start <= addDays(today, 2)
    })()
    for (const alias of [...f.aliases, ...(near ? f.nearAliases : [])]) {
      const a = norm(alias).trim()
      if (!a || !m.includes(` ${a} `)) continue
      if (WEAK.has(a) && !wishy) continue
      if (!best || a.length > best.alias.length) best = { festival: f, alias: a }
    }
  }
  return best
}

function whenText(f: Festival, today: string): { text: string; speak: string } {
  const span = nextSpan(f, today)
  if (!span) {
    return {
      text: `I don’t have a confirmed date for ${f.name} yet, and I’d rather not guess. Your administrator can add it on the Festivals page.`,
      speak: `I don’t have a confirmed date for ${f.name} yet.`,
    }
  }
  const multi = span.end !== span.start
  if (span.start <= today) {
    const day = daysBetween(span.start, today) + 1
    const text = multi ? `${f.name} is on now: day ${day}, running until ${longDate(span.end)}. ${f.emoji}` : `${f.name} is today! ${f.emoji} ${longDate(today)}.`
    return { text, speak: multi ? `${f.name} is on now.` : `${f.name} is today!` }
  }
  const when = multi ? `from ${longDate(span.start)} to ${longDate(span.end)}` : `on ${longDate(span.start)}`
  const left = span.inDays === 1 ? 'That’s tomorrow!' : `That’s ${plural(span.inDays, 'day')} from now.`
  const note = noteFor(f, Number(span.start.slice(0, 4)))
  return {
    text: `${f.name} is ${when}. ${left} ${f.emoji}\nPanchang: ${f.panchang}.${note ? `\nNote: ${note}` : ''}`,
    speak: `${f.name} is ${when}. ${left}`,
  }
}

function aboutText(f: Festival, today: string): { text: string; speak: string } {
  const fact = f.facts.length ? pickFor(f.facts, `${today}:${f.id}:fact:${Math.floor(Date.now() / 60_000)}`) : null
  const lines = [`${f.emoji} ${f.name}${f.alt ? ` (${f.alt})` : ''}`, f.about]
  if (f.traditions.length) lines.push(`How it’s celebrated:\n${f.traditions.slice(0, 4).map((t) => `• ${t}`).join('\n')}`)
  if (f.regional.length) lines.push(`Across India: ${f.regional.join('; ')}.`)
  if (fact) lines.push(`Did you know? ${fact}`)
  lines.push(whenText(f, today).text.split('\n')[0])
  return { text: lines.join('\n\n'), speak: `${f.about}${fact ? ` Did you know? ${fact}` : ''}` }
}

function wishText(f: Festival, today: string, firstName: string): { text: string; speak: string; celebrate: boolean } {
  const name = firstName || 'friend'
  const raw = (f.greeting ?? pickFor(f.wishes, `${today}:${f.id}:wish`)).trim()
  // The administrator's own greeting may already end with "!".
  const wish = /[.!?…]$/.test(raw) ? raw : `${raw}.`
  const span = nextSpan(f, addDays(today, -1))
  const on = span && span.start <= today && today <= span.end
  if (on) {
    const text = `${f.salutation} to you too, ${name}! ${f.emoji} ${wish} I’ve lit up the screen for you. 🎉`
    return { text, speak: `${f.salutation} to you too, ${name}! ${wish}`, celebrate: true }
  }
  if (span && span.end === addDays(today, -1)) {
    return { text: `Thank you, ${name}! ${f.name} was yesterday. I hope it was a wonderful one. ${f.emoji}`, speak: `Thank you, ${name}! I hope ${f.name} was wonderful.`, celebrate: false }
  }
  const upcoming = nextSpan(f, today)
  if (upcoming) {
    const when = upcoming.inDays === 1 ? 'tomorrow' : `on ${longDate(upcoming.start)}, ${plural(upcoming.inDays, 'day')} away`
    return {
      text: `Thank you, ${name}! ${f.salutation} to you in advance. ${f.emoji} ${f.name} is ${when}. I’ll save the big celebration for the day!`,
      speak: `Thank you, ${name}! ${f.name} is ${when}.`,
      celebrate: upcoming.inDays <= 3,
    }
  }
  return { text: `Thank you, ${name}! ${f.salutation}! ${f.emoji}`, speak: `Thank you, ${name}! ${f.salutation}!`, celebrate: false }
}

/**
 * Robi's own answer when a message is a festival wish ("Happy Diwali!"), a
 * question about a festival ("when is Holi?", "tell me about Onam") or a
 * request for a greeting. Null for anything else, so the message goes to his
 * usual AI answer: work questions that mention a name like Ganesh are left alone.
 */
export function festivalChatReply(
  message: string,
  festivals: readonly Festival[],
  today: string,
  firstName: string
): FestivalReply | null {
  const m = norm(message)
  if (m.trim().length < 3 || m.length > 240) return null
  const generate = has(m, GENERATE) && has(m, GREETING_WORDS)
  const wishy = has(m, WISH) || [...GREETING_PHRASES].some((p) => m.includes(` ${p} `))
  if (!generate && has(m, BUSINESS)) return null

  const hit = findFestival(m, festivals, today, wishy || generate)
  const todays = festivalsOn(today, festivals)[0]?.festival ?? null
  const generic = has(m, FESTIVAL_WORDS)

  if (generate && (hit || generic || todays)) {
    const f = hit?.festival ?? todays ?? comingSoon(today, festivals, 30)?.festival ?? null
    if (!f) return null
    const text = makeGreeting(f, { tone: toneFor(m), from: firstName })
    return { text: `Here’s a ${f.name} greeting you can use. ${f.emoji}\n\n${text}\n\nOpen the festival chip at the top for more styles and a Share button.`, speak: `Here’s a ${f.name} greeting you can use.`, festivalId: f.id, celebrate: false, kind: 'greeting' }
  }

  if (hit) {
    const f = hit.festival
    if (has(m, WHEN)) return { ...whenText(f, today), festivalId: f.id, celebrate: false, kind: 'when' }
    if (has(m, ABOUT) && !wishy) return { ...aboutText(f, today), festivalId: f.id, celebrate: false, kind: 'about' }
    const span = nextSpan(f, addDays(today, -1))
    const near = !!span && daysBetween(today, span.start) <= 1
    if (wishy || near) return { ...wishText(f, today, firstName), festivalId: f.id, kind: 'wish' }
    return null
  }

  if (!generic) return null
  if (wishy && todays) return { ...wishText(todays, today, firstName), festivalId: todays.id, kind: 'wish' }
  if (has(m, ABOUT) && todays && /\b(today|todays|aaj)\b/.test(m)) return { ...aboutText(todays, today), festivalId: todays.id, celebrate: false, kind: 'about' }
  if (has(m, LIST) || has(m, WHEN) || wishy) {
    const on = festivalsOn(today, festivals)
    const next = upcomingFestivals(today, festivals, 120).slice(0, 6)
    const lines: string[] = []
    if (on.length) lines.push(`Today: ${on.map((d) => `${d.festival.emoji} ${d.festival.name}${dayLabel(d) ? ` (${dayLabel(d)})` : ''}`).join(', ')}`)
    if (next.length) lines.push(`Coming up:\n${next.map((u) => `• ${u.festival.emoji} ${u.festival.name}: ${shortDate(u.start, true)} (${u.inDays === 1 ? 'tomorrow' : `in ${plural(u.inDays, 'day')}`})`).join('\n')}`)
    if (!lines.length) lines.push('No festivals in the next few months that I have confirmed dates for.')
    const speak = on.length ? `Today is ${on[0].festival.name}!` : next.length ? `Next up is ${next[0].festival.name}, in ${plural(next[0].inDays, 'day')}.` : 'No festivals coming up that I know of.'
    return { text: `${wishy ? `Thank you, ${firstName || 'friend'}! 🎉 ` : ''}${lines.join('\n\n')}`, speak, festivalId: on[0]?.festival.id ?? next[0]?.festival.id ?? null, celebrate: !!on.length && wishy, kind: 'list' }
  }
  return null
}
