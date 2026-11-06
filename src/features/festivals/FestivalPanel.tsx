/**
 * The festival panel (6 Nov 2026), opened from the chip in the header: the
 * festival of the day (or the next one) with its live countdown, and Robi's
 * festival buttons: celebrate now, play the animation, tell me about it,
 * play the music, make a greeting and share it. Coordinators and team leaders
 * get today's festival only: no other festivals, countdowns or calendar links
 * (the user's rule: only the administrator sees the festival calendar).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Copy, Info, MessageCircle, Music2, PartyPopper, RefreshCw, Share2, Sparkles, Square, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/lib/utils'
import { playMusic, speak, stopSpeaking, unlockSound } from './festival-audio'
import { celebrate } from './festival-bus'
import { countdownTo, dayLabel, festivalsOn, longDate, navratriColour, nextSpan, shortDate, upcomingFestivals, type Festival } from './festival-calendar'
import { GREETING_TONES, makeGreeting, type GreetingTone } from './festival-greetings'
import { useFestivalPrefs } from './festival-prefs'
import { strongColours, THEMES } from './festival-themes'
import { FestiveAccessory, FestivalIcon } from './FestiveAccessory'
import { useFestivals } from './useFestivals'

const COMPANY_KEY = 'onedesk.festivals.company'

/** Copies text, also on the office network address where the browser's clipboard API is not offered. */
async function copyText(text: string, host: HTMLElement | null): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall back below */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    // Inside the dialog, so its focus trap lets the selection happen.
    ;(host ?? document.body).appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

function Tile({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="min-w-14 rounded-xl bg-black/25 px-2 py-1.5 text-center backdrop-blur">
      <div className="text-xl font-bold tabular-nums leading-none">{String(value).padStart(2, '0')}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider opacity-80">{unit}</div>
    </div>
  )
}

export default function FestivalPanel({ open, onOpenChange, festivalId }: { open: boolean; onOpenChange: (open: boolean) => void; festivalId: string | null }) {
  const { user, isAdmin } = useAuth()
  const { config, festivals, today, todays, soon } = useFestivals()
  const [prefs, setPrefs] = useFestivalPrefs(user?.id, config)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Coordinators and team leaders: the festival that is on today, nothing else.
  const todayOnly = !isAdmin
  const isToday = (id: string | null) => !!id && todays.some((d) => d.festival.id === id)

  const upcoming = useMemo(() => (todayOnly ? [] : upcomingFestivals(today, festivals, 400)), [todayOnly, today, festivals])
  const options = useMemo(() => {
    const seen = new Set<string>()
    const list: { festival: Festival; when: string }[] = []
    for (const d of todays) if (!seen.has(d.festival.id)) seen.add(d.festival.id), list.push({ festival: d.festival, when: 'today' })
    for (const u of upcoming) if (!seen.has(u.festival.id)) seen.add(u.festival.id), list.push({ festival: u.festival, when: shortDate(u.start) })
    // Opened for a festival that is not coming up (one already past this year): list it too.
    const asked = festivalId && !todayOnly ? festivals.find((f) => f.id === festivalId) : null
    if (asked && !seen.has(asked.id)) list.unshift({ festival: asked, when: 'this year' })
    return list
  }, [todays, upcoming, festivalId, festivals, todayOnly])

  const fallbackId = todays[0]?.festival.id ?? (todayOnly ? null : (soon?.festival.id ?? upcoming[0]?.festival.id)) ?? null
  const askedId = festivalId && (!todayOnly || isToday(festivalId)) ? festivalId : null
  const [selectedId, setSelectedId] = useState<string | null>(askedId ?? fallbackId)
  useEffect(() => {
    if (open) setSelectedId(askedId ?? fallbackId)
    // Only when it opens: the choice stays while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, festivalId])

  const festival = (!todayOnly || isToday(selectedId) ? festivals.find((f) => f.id === selectedId) : null) ?? null
  const fd = festival ? festivalsOn(today, festivals).find((d) => d.festival.id === festival.id) ?? null : null
  const span = festival && !fd ? nextSpan(festival, today) : null
  const theme = festival ? THEMES[festival.theme] : THEMES.celebration
  const nextBig = upcoming.find((u) => u.festival.major && u.festival.id !== festival?.id) ?? null

  // The countdown ticks while the panel is open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open])
  const countdown = span ? countdownTo(span.start, new Date(now)) : null
  const nextCountdown = !span && nextBig ? countdownTo(nextBig.start, new Date(now)) : null

  /* ----- About ----- */
  const [about, setAbout] = useState(false)
  const voiceOn = !prefs.muted && config.voice && prefs.voice
  const tellMe = async () => {
    if (!festival) return
    const next = !about
    setAbout(next)
    if (!next) return stopSpeaking()
    if (voiceOn && (await unlockSound())) speak(festival.about)
  }

  /* ----- Music ----- */
  const stopMusic = useRef<() => void>(() => {})
  const [music, setMusic] = useState(false)
  const toggleMusic = async () => {
    if (!festival) return
    if (music) {
      stopMusic.current()
      setMusic(false)
      return
    }
    if (prefs.muted) setPrefs({ muted: false })
    if (!(await unlockSound())) {
      toast.error('The browser did not allow sound.', { description: 'Click anywhere on the page once, then try again.' })
      return
    }
    stopMusic.current = playMusic(theme.music)
    setMusic(true)
    window.setTimeout(() => setMusic(false), 40_000)
  }
  useEffect(() => {
    if (open) return
    stopMusic.current()
    stopSpeaking()
    setMusic(false)
    setAbout(false)
  }, [open])
  useEffect(() => {
    stopMusic.current()
    setMusic(false)
    setAbout(false)
  }, [selectedId])

  /* ----- Greetings ----- */
  const [tone, setTone] = useState<GreetingTone>('business')
  const [to, setTo] = useState('')
  const [from, setFrom] = useState(user?.full_name ?? '')
  const [company, setCompany] = useState(() => {
    try {
      return localStorage.getItem(COMPANY_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [variant, setVariant] = useState(0)
  const [text, setText] = useState('')
  useEffect(() => {
    if (festival) setText(makeGreeting(festival, { tone, to, from, company, variant }))
  }, [festival, tone, to, from, company, variant])
  useEffect(() => {
    try {
      localStorage.setItem(COMPANY_KEY, company)
    } catch {
      /* not remembered */
    }
  }, [company])

  const copy = async () => {
    const ok = await copyText(text, bodyRef.current)
    if (ok) toast.success('Greeting copied.', { description: 'Paste it into WhatsApp, email or anywhere.' })
    else toast.error('Could not copy.', { description: 'Select the text and press Ctrl+C.' })
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const share = async () => {
    try {
      await navigator.share({ title: festival?.salutation, text })
    } catch {
      /* cancelled */
    }
  }
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')

  const start = (mode: 'full' | 'ambient') => {
    if (!festival) return
    if (!prefs.muted) void unlockSound()
    onOpenChange(false)
    // Let the dialog close first so the celebration is not drawn behind it.
    window.setTimeout(() => celebrate({ festivalId: festival.id, mode, reason: 'user' }), 180)
  }

  const label = fd ? dayLabel(fd) : null
  const colour = fd ? navratriColour(fd) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden bg-background p-0 sm:rounded-3xl">
        {!festival ? (
          <div className="p-6">
            <DialogTitle>Festivals</DialogTitle>
            <DialogDescription className="mt-2">
              {todayOnly ? 'No festival today. Robi will celebrate with you on the day.' : 'No festival dates are confirmed for the coming months. The administrator can add them on the Festivals page.'}
            </DialogDescription>
          </div>
        ) : (
          <>
            {/* The festival, its day and the countdown. */}
            <div className="relative overflow-hidden px-5 pb-4 pt-5 text-white" style={{ background: `linear-gradient(135deg, ${strongColours(theme).join(', ')})` }}>
              <div className="absolute inset-0 bg-black/25" aria-hidden />
              <div className="relative flex items-start gap-4 pr-6">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-4xl backdrop-blur" aria-hidden>
                  <FestivalIcon festival={festival} size={34} />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-2xl font-extrabold leading-tight drop-shadow">{festival.name}</DialogTitle>
                  <DialogDescription className="text-sm text-white/90">
                    {festival.alt ? `${festival.alt} · ` : ''}
                    {fd ? `Today · ${longDate(today)}` : span ? (span.end !== span.start ? `${longDate(span.start)} to ${longDate(span.end)}` : longDate(span.start)) : 'Date not confirmed yet'}
                  </DialogDescription>
                  {(label || colour) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                      {label && <span className="rounded-full bg-white/20 px-2 py-0.5 font-medium">{label}</span>}
                      {colour && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-medium">
                          <span className="h-2.5 w-2.5 rounded-full border border-white/60" style={{ background: colour.hex }} />
                          Colour of the day: {colour.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <FestiveAccessory kind={theme.accessory} size={44} className="hidden sm:block" />
              </div>
              {countdown && (
                <div className="relative mt-4 flex items-center gap-2">
                  <Tile value={countdown.days} unit="days" />
                  <Tile value={countdown.hours} unit="hrs" />
                  <Tile value={countdown.minutes} unit="min" />
                  <Tile value={countdown.seconds} unit="sec" />
                  <span className="ml-1 text-xs text-white/90">to go (India time)</span>
                </div>
              )}
              {fd && <p className="relative mt-3 text-sm font-medium">{festival.salutation}! It’s today. 🎉</p>}
            </div>

            <div ref={bodyRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {/* Coordinators and team leaders choose only between festivals on the same day. */}
              {(!todayOnly || options.length > 1) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Festival</span>
                  <Select value={festival.id} onValueChange={setSelectedId}>
                    <SelectTrigger className="h-9 w-auto min-w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(({ festival: f, when }) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.emoji} {f.name} · {when}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Robi's festival buttons. */}
              <div className={cn('grid gap-2', config.music || !todayOnly ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
                <Button onClick={() => start('full')} className="h-auto flex-col gap-1 py-3 text-white" style={{ background: theme.accent }}>
                  <PartyPopper className="h-5 w-5" />
                  <span className="text-xs font-semibold">Celebrate now</span>
                </Button>
                <Button variant="outline" onClick={() => start('ambient')} className="h-auto flex-col gap-1 py-3">
                  <Sparkles className="h-5 w-5" />
                  <span className="text-xs font-semibold">Play animation</span>
                </Button>
                <Button variant="outline" onClick={() => void tellMe()} className={cn('h-auto flex-col gap-1 py-3', about && 'border-primary')} aria-pressed={about}>
                  <Info className="h-5 w-5" />
                  <span className="text-xs font-semibold">Tell me about it</span>
                </Button>
                {config.music ? (
                  <Button variant="outline" onClick={() => void toggleMusic()} className={cn('h-auto flex-col gap-1 py-3', music && 'border-primary')} aria-pressed={music}>
                    {music ? <Square className="h-5 w-5" /> : <Music2 className="h-5 w-5" />}
                    <span className="text-xs font-semibold">{music ? 'Stop music' : 'Play music'}</span>
                  </Button>
                ) : (
                  !todayOnly && (
                    <Button variant="outline" asChild className="h-auto flex-col gap-1 py-3">
                      <Link to="/festivals" onClick={() => onOpenChange(false)}>
                        <CalendarDays className="h-5 w-5" />
                        <span className="text-xs font-semibold">Calendar</span>
                      </Link>
                    </Button>
                  )
                )}
              </div>

              {about && (
                <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm leading-relaxed">
                  <p>{festival.about}</p>
                  {festival.traditions.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">How it’s celebrated</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {festival.traditions.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {festival.regional.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Across India</p>
                      <p>{festival.regional.join(' · ')}</p>
                    </div>
                  )}
                  {festival.facts.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Did you know?</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {festival.facts.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Panchang: {festival.panchang} · Celebrated in: {festival.regions}
                  </p>
                </div>
              )}

              {/* Greetings: make one, then copy or share it. */}
              <div className="space-y-3 rounded-2xl border border-border/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Festival greeting</p>
                  <div className="flex rounded-full bg-muted p-0.5" role="radiogroup" aria-label="Style">
                    {GREETING_TONES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={tone === t.value}
                        title={t.hint}
                        onClick={() => setTone(t.value)}
                        className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', tone === t.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={cn('grid gap-2', tone === 'business' ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                  <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={tone === 'business' ? 'To (e.g. Mr. Shah)' : 'To (optional)'} aria-label="To" />
                  <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" aria-label="From" />
                  {tone === 'business' && <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" aria-label="Company" />}
                </div>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={tone === 'business' ? 8 : 5} className="resize-none text-sm" aria-label="Greeting" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setVariant((v) => v + 1)} className="gap-1.5">
                    <RefreshCw className="h-4 w-4" /> Generate again
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void copy()} className="gap-1.5">
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={whatsapp} className="gap-1.5">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                  {canShare && (
                    <Button size="sm" variant="outline" onClick={() => void share()} className="gap-1.5">
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                  )}
                </div>
              </div>

              {nextBig && nextCountdown && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
                  <span>
                    Next big festival: <span className="font-semibold">{nextBig.festival.emoji} {nextBig.festival.name}</span> on {shortDate(nextBig.start, true)}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {nextCountdown.days}d {nextCountdown.hours}h {nextCountdown.minutes}m {nextCountdown.seconds}s
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-sm">
                <label className="flex items-center gap-2">
                  <Switch checked={!prefs.muted} onCheckedChange={(on) => setPrefs({ muted: !on })} aria-label="Sound" />
                  {prefs.muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
                  Sound
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={prefs.auto} onCheckedChange={(on) => setPrefs({ auto: on })} aria-label="Automatic celebrations" />
                  Celebrate automatically
                </label>
                {!todayOnly && (
                  <Link to="/festivals" onClick={() => onOpenChange(false)} className="font-medium text-primary hover:underline">
                    All festivals →
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
