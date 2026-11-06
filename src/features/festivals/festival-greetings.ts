/**
 * Festival greetings (6 Nov 2026): a ready-to-send message in three styles,
 * for clients, for the team, or just for fun. Each "Generate again" picks a
 * different wording.
 */

import type { Festival } from './festival-calendar'

export type GreetingTone = 'business' | 'warm' | 'fun'

export const GREETING_TONES: { value: GreetingTone; label: string; hint: string }[] = [
  { value: 'business', label: 'For clients', hint: 'Polite, with a thank-you for the business' },
  { value: 'warm', label: 'For the team', hint: 'Warm and friendly' },
  { value: 'fun', label: 'Fun', hint: 'Light-hearted, with emoji' },
]

export interface GreetingOptions {
  tone: GreetingTone
  /** Who it is for ("Mr. Shah", "Team"); blank for a general message. */
  to?: string
  /** Who it is from. */
  from?: string
  /** The company line under the name, for clients. */
  company?: string
  /** Picks a different wording each time. */
  variant?: number
}

const BUSINESS_LINES = [
  'Thank you for your trust and partnership. We look forward to serving you in the year ahead.',
  'Thank you for being a valued customer. Here’s to growing together.',
  'We are grateful for your continued support and wish you and your team a wonderful celebration.',
  'It is a privilege to work with you. Wishing your business continued growth and success.',
]

const WARM_LINES = [
  'Enjoy the day with your loved ones!',
  'Have a wonderful celebration with family and friends.',
  'Here’s to good times, good food and great company.',
  'May the day be full of smiles and sweet moments.',
]

/** Light-hearted lines by festival look. */
const FUN_LINES: Partial<Record<string, string[]>> = {
  diwali: ['May your sweets be many and your calories zero', 'May your rangoli be perfect and your mithai box never empty'],
  nutanvarsh: ['New year, new chopda, same awesome you', 'Saal Mubarak! May this year’s targets be met by Labh Pancham'],
  holi: ['May your colours be bright and your white clothes forgiving', 'Go ahead: today nobody can tell who is who'],
  holika: ['Toss every worry into tonight’s bonfire'],
  sankranti: ['May your kite never get cut and your manja never tangle', 'Keep your chikki close and your firki closer'],
  navratri: ['May your garba never miss a beat and your dandiya never miss a partner', 'Nine nights, very little sleep, one hundred percent garba'],
  dussehra: ['May your fafda be crisp and your jalebi extra sweet', 'Time to burn the Ravana of Monday blues'],
  ganesh: ['May your modaks be many and your obstacles few', 'Bappa’s favourite is modak; ours is a long weekend'],
  janmashtami: ['May your dahi handi be high and your makhan never run out'],
  gold: ['May your gold glitter and your bank balance grow'],
  rakhi: ['May your rakhi be pretty and your gifts be generous'],
  bhaidooj: ['May the gifts be big and the sibling fights small'],
  tricolor: ['Proud, loud and tricolour all day'],
  spring: ['Wear yellow, think bright, shine like spring'],
  shivratri: ['Stay calm and chant Om'],
  harvest: ['May your harvest be big and your worries small'],
  onam: ['May your sadhya have twenty-six dishes and room for dessert'],
  newyear: ['New year, fresh start, same great team'],
}

const FUN_GENERIC = ['Let the celebrations begin', 'Eat, laugh, repeat', 'Time to celebrate like there’s no follow-up tomorrow']

const at = <T,>(list: readonly T[], n: number): T => list[((n % list.length) + list.length) % list.length]

/** Which style a chat request asks for: clients, fun, or warm by default. */
export function toneFor(text: string): GreetingTone {
  const t = text.toLowerCase()
  if (/\b(client|clients|customer|customers|business|formal|professional|partner|partners|vendor|vendors)\b/.test(t)) return 'business'
  if (/\b(fun|funny|friends|friend|cool|casual)\b/.test(t)) return 'fun'
  return 'warm'
}

/** A complete greeting message for the festival. */
export function makeGreeting(f: Festival, options: GreetingOptions): string {
  const n = options.variant ?? 0
  const to = options.to?.trim() ?? ''
  const from = options.from?.trim() ?? ''
  const company = options.company?.trim() ?? ''
  const wish = f.greeting ?? at(f.wishes.length ? f.wishes : [`Wishing you a wonderful ${f.name}`], n)
  const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)

  if (options.tone === 'business') {
    const sign = ['Warm regards,', from, company].filter(Boolean).join('\n')
    return [`Dear ${to || 'Valued Partner'},`, `${f.salutation}! ${stop(wish)}`, at(BUSINESS_LINES, n), sign].join('\n\n')
  }
  if (options.tone === 'fun') {
    const fun = at(FUN_LINES[f.theme] ?? FUN_GENERIC, n)
    return [`${f.shareEmoji} ${f.salutation}${to ? `, ${to}` : ''}! ${f.shareEmoji}`, `${fun}! ${wish.replace(/[.!]$/, '')}! 🎉`, from ? `— ${from}` : '']
      .filter(Boolean)
      .join('\n\n')
  }
  return [`${f.salutation}${to ? `, ${to}` : ''}! ${f.shareEmoji}`, `${stop(wish)} ${at(WARM_LINES, n)}`, from ? `— ${from}` : ''].filter(Boolean).join('\n\n')
}
