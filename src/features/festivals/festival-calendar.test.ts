/**
 * Robi's festival calendar: the day in India, which festival is on, what is
 * coming, the countdown, Robi's festive lines and his replies to wishes.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_FESTIVAL_CONFIG } from '@/lib/festival-config'
import type { FestivalConfig } from '@/lib/types'
import {
  comingSoon,
  countdownTo,
  datesFor,
  dayLabel,
  festivalChatReply,
  festivalsOn,
  festiveHello,
  istDate,
  missingDates,
  navratriColour,
  noteFor,
  resolveFestivals,
  upcomingFestivals,
  vikramSamvat,
} from './festival-calendar'
import { FESTIVAL_INFO } from './festival-data'
import { DATE_NOTES, PANCHANG_DATES, PANCHANG_YEARS } from './festival-dates'
import { makeGreeting } from './festival-greetings'
import { hasFestivalArt } from './FestivalArt'
import { THEMES } from './festival-themes'

const festivals = resolveFestivals(null)
const byId = (id: string) => festivals.find((f) => f.id === id)!
const config = (patch: Partial<FestivalConfig>): FestivalConfig => ({ ...DEFAULT_FESTIVAL_CONFIG, ...patch })

describe('the date in India', () => {
  it('rolls over at midnight IST, not the computer’s midnight', () => {
    expect(istDate(new Date('2026-11-05T18:29:00Z'))).toBe('2026-11-05')
    expect(istDate(new Date('2026-11-05T18:30:00Z'))).toBe('2026-11-06')
  })

  it('counts down to midnight IST at the start of the festival day', () => {
    const c = countdownTo('2026-11-08', new Date('2026-11-06T06:30:00Z'))
    expect(c).toMatchObject({ days: 1, hours: 12, minutes: 0, seconds: 0 })
    expect(countdownTo('2026-11-08', new Date('2026-11-08T00:00:00Z')).ms).toBe(0)
  })
})

describe('the Panchang table', () => {
  it('has every lunar festival for 2026-2028, each date a real day in its own year', () => {
    for (const info of FESTIVAL_INFO) {
      if (info.fixed) continue
      for (const year of PANCHANG_YEARS) {
        const entry = PANCHANG_DATES[info.id]?.[year]
        expect(entry, `${info.id} ${year}`).toBeTruthy()
        const [start, end] = typeof entry === 'string' ? [entry, entry] : entry!
        expect(start.startsWith(String(year)), `${info.id} ${year}`).toBe(true)
        expect(end >= start).toBe(true)
        expect(Number.isNaN(Date.parse(start))).toBe(false)
      }
    }
  })

  it('keeps the festivals of one season in their Panchang order', () => {
    for (const year of PANCHANG_YEARS) {
      const day = (id: string) => datesFor(byId(id), year)!.start
      expect(day('holika_dahan') < day('holi')).toBe(true)
      expect(day('navratri') < day('dussehra')).toBe(true)
      expect(datesFor(byId('navratri'), year)!.end < day('dussehra')).toBe(true)
      expect(day('dhanteras') <= day('kali_chaudas')).toBe(true)
      expect(day('kali_chaudas') < day('diwali')).toBe(true)
      expect(day('diwali') < day('nutan_varsh')).toBe(true)
      expect(day('nutan_varsh') < day('bhai_dooj')).toBe(true)
      expect(day('bhai_dooj') < day('labh_pancham')).toBe(true)
      expect(day('gudi_padwa')).toBe(day('ugadi'))
    }
  })

  it('gives every festival a look and words for chat, and no two festivals share a word', () => {
    const seen = new Map<string, string>()
    for (const info of FESTIVAL_INFO) {
      expect(THEMES[info.theme], info.id).toBeTruthy()
      expect(info.robi.length, info.id).toBeGreaterThan(0)
      expect(info.wishes.length, info.id).toBeGreaterThan(0)
      for (const alias of [...info.aliases, ...(info.nearAliases ?? [])]) {
        expect(seen.get(alias), `${alias} is in ${seen.get(alias)} and ${info.id}`).toBeUndefined()
        seen.set(alias, info.id)
      }
    }
  })

  it('shows a caution only on a Panchang date, not one the administrator has set', () => {
    expect(DATE_NOTES.holi?.[2027]).toBeTruthy()
    expect(noteFor(byId('holi'), 2027)).toMatch(/23 Mar/)
    const fixed = resolveFestivals(config({ festivals: { holi: { dates: { '2027': { start: '2027-03-23' } } } } }))
    const holi = fixed.find((f) => f.id === 'holi')!
    expect(datesFor(holi, 2027)).toEqual({ start: '2027-03-23', end: '2027-03-23', source: 'admin' })
    expect(noteFor(holi, 2027)).toBeNull()
  })
})

describe('which festival is on', () => {
  it('knows today, 6 Nov 2026, is Dhanteras, with Diwali two days away', () => {
    expect(festivalsOn('2026-11-06', festivals)[0].festival.id).toBe('dhanteras')
    const soon = comingSoon('2026-11-05', festivals, 7)!
    expect(soon.festival.id).toBe('dhanteras')
    expect(upcomingFestivals('2026-11-06', festivals, 10).map((u) => [u.festival.id, u.inDays])).toEqual([
      ['kali_chaudas', 1],
      ['diwali', 2],
      ['nutan_varsh', 4],
      ['bhai_dooj', 5],
      ['labh_pancham', 8],
      ['chhath_puja', 9],
    ])
  })

  it('celebrates only one festival first when two share a day', () => {
    const day = festivalsOn('2027-10-27', festivals)
    expect(day.map((d) => d.festival.id)).toEqual(['dhanteras', 'kali_chaudas'])
    const padwa = festivalsOn('2027-04-07', festivals)
    expect(padwa[0].festival.id).toBe('gudi_padwa')
    expect(padwa.map((d) => d.festival.id).sort()).toEqual(['gudi_padwa', 'navreh', 'ugadi'])
  })

  it('counts Navratri nights, with the weekday colour only where every list agrees', () => {
    const night5 = festivalsOn('2026-10-15', festivals)[0]
    expect(night5.festival.id).toBe('navratri')
    expect(dayLabel(night5)).toBe('Night 5 of 9')
    expect(navratriColour(night5)?.name).toBe('Yellow') // a Thursday
    const night8 = festivalsOn('2026-10-18', festivals)[0]
    expect(navratriColour(night8)).toBeNull()
    const coloured = resolveFestivals(config({ festivals: { navratri: { colours: ['', '', '', '', '', '', '', 'Purple', 'Peacock green'] } } }))
    expect(navratriColour(festivalsOn('2026-10-18', coloured)[0])).toEqual({ name: 'Purple', hex: '#9333ea' })
  })

  it('keeps Uttarayan on 14 Jan with Vasi Uttarayan next day, above Pongal', () => {
    expect(dayLabel(festivalsOn('2027-01-14', festivals)[0])).toBe('Uttarayan')
    const vasi = festivalsOn('2027-01-15', festivals)
    expect(vasi[0].festival.id).toBe('makar_sankranti')
    expect(dayLabel(vasi[0])).toBe('Vasi Uttarayan')
    expect(vasi.map((d) => d.festival.id)).toContain('pongal')
  })

  it('leaves out a festival the administrator switched off, and adds the company’s own day every year', () => {
    const cfg = config({
      festivals: { dhanteras: { enabled: false } },
      custom: [{ id: 'founding', name: 'Foundation Day', date: '2020-02-29', yearly: true, theme: 'celebration', emoji: '🏭', greeting: '', about: '', enabled: true, auto: true }],
    })
    const list = resolveFestivals(cfg)
    expect(festivalsOn('2026-11-06', list)).toEqual([])
    expect(festivalsOn('2027-02-28', list)[0].festival.name).toBe('Foundation Day')
    expect(festivalsOn('2028-02-29', list)[0].festival.name).toBe('Foundation Day')
  })

  it('names the festivals with no confirmed date for a year, never guessing one', () => {
    const missing = missingDates(festivals, 2029).map((f) => f.id)
    expect(missing).toContain('diwali')
    expect(missing).not.toContain('republic_day')
    expect(festivalsOn('2029-11-05', festivals)).toEqual([])
    expect(missingDates(festivals, 2027)).toEqual([])
  })

  it('counts the Vikram Samvat year both ways', () => {
    expect(vikramSamvat('2026-11-06', festivals)).toEqual({ chaitradi: 2083, kartikadi: 2082 })
    expect(vikramSamvat('2026-11-10', festivals)).toEqual({ chaitradi: 2083, kartikadi: 2083 })
  })
})

describe('what Robi says', () => {
  it('greets with the festival on its day, and counts down before a big one', () => {
    const hello = festiveHello('Niraj', '2026-11-06', festivals, 7)!
    expect(hello.kind).toBe('today')
    expect(hello.text).toMatch(/Dhanteras, Niraj/)
    const navratri = festiveHello('Niraj', '2026-10-15', festivals, 7)!
    expect(navratri.text).toMatch(/night 5 of 9, and today’s colour is yellow/)
    expect(festiveHello('Niraj', '2026-11-01', festivals, 7)).toEqual({ kind: 'soon', festivalId: 'dhanteras', text: 'Only 5 days to Dhanteras! 🪙' })
    expect(festiveHello('Niraj', '2026-12-01', festivals, 7)).toBeNull()
  })

  it('uses the administrator’s own greeting first', () => {
    const own = resolveFestivals(config({ festivals: { dhanteras: { greeting: 'Team, the sweets are in the pantry.' } } }))
    expect(festiveHello('Niraj', '2026-11-06', own, 7)!.text).toBe('Happy Dhanteras, Niraj! 🪙 Team, the sweets are in the pantry.')
  })

  const reply = (message: string, today = '2026-11-06') => festivalChatReply(message, festivals, today, 'Niraj')

  it('answers a wish on the day with a celebration', () => {
    expect(reply('Happy Dhanteras Robi!')).toMatchObject({ kind: 'wish', festivalId: 'dhanteras', celebrate: true })
    const own = resolveFestivals(config({ festivals: { dhanteras: { greeting: 'Sweets are in the pantry, team!' } } }))
    expect(festivalChatReply('happy dhanteras', own, '2026-11-06', 'Niraj')!.text).toBe(
      'Happy Dhanteras to you too, Niraj! 🪙 Sweets are in the pantry, team! I’ve lit up the screen for you. 🎉'
    )
    expect(reply('Saal Mubarak', '2026-11-10')).toMatchObject({ kind: 'wish', festivalId: 'nutan_varsh', celebrate: true })
    expect(reply('happy new year!', '2026-11-10')?.festivalId).toBe('nutan_varsh')
  })

  it('thanks an early wish with the date', () => {
    const r = reply('happy diwali')!
    expect(r.kind).toBe('wish')
    expect(r.text).toMatch(/Sunday, 8 November 2026, 2 days away/)
  })

  it('answers when and what, with the caution where sources differ', () => {
    const when = reply('when is holi?')!
    expect(when.kind).toBe('when')
    expect(when.text).toMatch(/Monday, 22 March 2027/)
    expect(when.text).toMatch(/Note: .*23 Mar/)
    const about = reply('tell me about onam')!
    expect(about.kind).toBe('about')
    expect(about.text).toMatch(/Kerala/)
    expect(reply('any festival today?')).toMatchObject({ kind: 'list' })
  })

  it('writes a greeting when asked', () => {
    const r = reply('write a diwali greeting for my clients')!
    expect(r.kind).toBe('greeting')
    expect(r.text).toMatch(/Dear Valued Partner/)
  })

  it('leaves work questions and ordinary greetings to his usual answer', () => {
    expect(reply('what is the overdue of ganesh traders?')).toBeNull()
    expect(reply('call ganesh tomorrow about the invoice')).toBeNull()
    expect(reply('tell me about Vasant Enterprises')).toBeNull()
    expect(reply('jai shri krishna')).toBeNull()
    expect(reply('happy new year', '2027-01-01')).toBeNull()
    expect(reply('show my plan')).toBeNull()
    expect(reply('happy ganpati')?.festivalId).toBe('ganesh_chaturthi')
  })
})

describe('greetings', () => {
  const diwali = byId('diwali')

  it('writes a client greeting with the names and company', () => {
    const text = makeGreeting(diwali, { tone: 'business', to: 'Mr. Shah', from: 'Niraj', company: 'Pouchwale' })
    expect(text.startsWith('Dear Mr. Shah,')).toBe(true)
    expect(text).toMatch(/Shubh Deepavali!/)
    expect(text.endsWith('Warm regards,\nNiraj\nPouchwale')).toBe(true)
  })

  it('shows the deity or the brother and sister, and names them in every greeting, for the festivals that have them', () => {
    const who: Record<string, RegExp> = {
      diwali: /Lakshmi|Rama?\b/,
      janmashtami: /Krishna|Kanha|Gopal/,
      maha_shivratri: /Shiva|Mahadev|Bholenath/,
      ganesh_chaturthi: /Ganesha|Bappa|Vighnaharta/,
      raksha_bandhan: /brother|sister/i,
    }
    for (const [id, re] of Object.entries(who)) {
      expect(hasFestivalArt(id), id).toBe(true)
      for (const line of [...byId(id).wishes, ...byId(id).robi]) expect(line, `${id}: ${line}`).toMatch(re)
    }
    expect(hasFestivalArt('holi')).toBe(false)
  })

  it('keeps the flag for shared national-day greetings but not on screen, where Windows cannot draw it', () => {
    const republic = byId('republic_day')
    expect(republic.emoji).toBe('🎉')
    expect(makeGreeting(republic, { tone: 'warm' })).toMatch(/^Happy Republic Day! 🇮🇳/)
    expect(festiveHello('Niraj', '2027-01-26', festivals, 7)!.text).toBe('Happy Republic Day, Niraj! 🎉 Jai Hind!')
  })

  it('words it differently each time it is generated again', () => {
    const a = makeGreeting(diwali, { tone: 'fun', variant: 0 })
    const b = makeGreeting(diwali, { tone: 'fun', variant: 1 })
    expect(a).not.toBe(b)
    expect(makeGreeting(diwali, { tone: 'warm', variant: 5 })).toMatch(/^Shubh Deepavali! 🪔/)
  })
})
