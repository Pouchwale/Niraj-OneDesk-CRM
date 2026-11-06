/**
 * Festivals (6 Nov 2026): today's festival or the countdown to the next,
 * the year's festival calendar from the Panchang, each person's own choices
 * (automatic celebrations, sound, Robi's voice, gentle mode) and, for the
 * administrator, the settings for everyone.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Info, PartyPopper, Play, Settings2, SlidersHorizontal, Sparkles, TriangleAlert, Volume2 } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/lib/utils'
import { playFanfare, unlockSound } from './festival-audio'
import { celebrate, openFestivalPanel } from './festival-bus'
import {
  countdownTo,
  datesFor,
  dayLabel,
  daysBetween,
  festivalLine,
  longDate,
  missingDates,
  noteFor,
  shortDate,
  upcomingFestivals,
  vikramSamvat,
  type Festival,
} from './festival-calendar'
import { useFestivalPrefs } from './festival-prefs'
import { THEMES } from './festival-themes'
import { FestivalAdminSettings } from './FestivalAdminSettings'
import { FestiveAccessory, FestivalIcon } from './FestiveAccessory'
import { useFestivals, useReducedMotion } from './useFestivals'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function start(f: Festival, mode: 'full' | 'ambient', reason: 'user' | 'preview' = 'user') {
  void unlockSound()
  celebrate({ festivalId: f.id, festival: f, mode, reason })
}

function Tile({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="min-w-16 rounded-2xl bg-background/70 px-3 py-2 text-center shadow-sm ring-1 ring-border/60">
      <div className="text-2xl font-bold tabular-nums leading-none">{String(value).padStart(2, '0')}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{unit}</div>
    </div>
  )
}

/** Today's festival, or the countdown to the next big one. */
function TodayCard() {
  const { user } = useAuth()
  const { config, today, festivals, todays, primary } = useFestivals()
  const next = useMemo(() => upcomingFestivals(today, festivals, 400).find((u) => u.festival.major) ?? null, [today, festivals])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const samvat = vikramSamvat(today, festivals)
  const firstName = user?.full_name.split(' ')[0] ?? ''

  const f = primary?.festival ?? next?.festival ?? null
  const theme = f ? THEMES[f.theme] : THEMES.celebration
  const cd = !primary && next ? countdownTo(next.start, new Date(now)) : null

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${theme.palette.join(', ')})` }} />
      <div className="flex flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl text-5xl" style={{ background: `${theme.accent}1f` }} aria-hidden>
            {f ? <FestivalIcon festival={f} size={44} /> : '🎉'}
            {f && (
              <span className="absolute -right-2 -top-2">
                <FestiveAccessory kind={theme.accessory} size={30} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{primary ? 'Today' : next ? 'Coming up' : 'Festivals'}</p>
            {f ? (
              <>
                <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl">{primary ? `${f.salutation}!` : f.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {primary ? (
                    <>
                      {f.name}
                      {f.alt ? ` · ${f.alt}` : ''}
                      {dayLabel(primary) ? ` · ${dayLabel(primary)}` : ''}
                    </>
                  ) : (
                    next && (next.end !== next.start ? `${longDate(next.start)} to ${longDate(next.end)}` : longDate(next.start))
                  )}
                </p>
                {primary && config.enabled && <p className="mt-2 max-w-xl text-sm">{festivalLine(f, firstName, today, primary)}</p>}
                {todays.length > 1 && <p className="mt-1 text-xs text-muted-foreground">Also today: {todays.slice(1).map((d) => `${d.festival.emoji} ${d.festival.name}`).join(', ')}</p>}
              </>
            ) : (
              <h2 className="text-xl font-bold">No confirmed festival dates ahead</h2>
            )}
          </div>
        </div>

        {cd && next && (
          <div className="flex items-center gap-2" aria-label={`${next.festival.name} in ${cd.days} days`}>
            <Tile value={cd.days} unit="days" />
            <Tile value={cd.hours} unit="hrs" />
            <Tile value={cd.minutes} unit="min" />
            <Tile value={cd.seconds} unit="sec" />
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          {f && (
            <Button onClick={() => start(f, 'full')} className="gap-1.5 text-white" style={{ background: theme.accent }}>
              <PartyPopper className="h-4 w-4" /> Celebrate now
            </Button>
          )}
          <Button variant="outline" onClick={() => openFestivalPanel(f?.id ?? null)} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> Greetings and music
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
        <span>India: {longDate(today)}</span>
        {samvat.chaitradi && <span>Vikram Samvat {samvat.chaitradi}</span>}
        {samvat.kartikadi && <span>Gujarati Samvat {samvat.kartikadi}</span>}
      </div>
    </GlassCard>
  )
}

function Calendar() {
  const { isAdmin } = useAuth()
  const { today, festivals } = useFestivals()
  const thisYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const rows = useMemo(
    () =>
      festivals
        .filter((f) => f.enabled)
        .map((f) => ({ f, span: datesFor(f, year) }))
        .filter((r): r is { f: Festival; span: NonNullable<ReturnType<typeof datesFor>> } => !!r.span)
        .sort((a, b) => a.span.start.localeCompare(b.span.start) || b.f.priority - a.f.priority),
    [festivals, year]
  )
  const missing = missingDates(festivals, year)
  const months = MONTHS.map((name, i) => ({ name, rows: rows.filter((r) => Number(r.span.start.slice(5, 7)) === i + 1) })).filter((m) => m.rows.length)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-muted p-0.5" role="radiogroup" aria-label="Year">
          {[thisYear, thisYear + 1, thisYear + 2].map((y) => (
            <button key={y} type="button" role="radio" aria-checked={year === y} onClick={() => setYear(y)} className={cn('rounded-full px-4 py-1.5 text-sm font-medium', year === y ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {y}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Dates from the Hindu Panchang (Drik Panchang, India time) and the government holiday lists.</p>
      </div>

      {missing.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {missing.length} festival{missing.length === 1 ? '' : 's'} have no confirmed date for {year} yet, so they are not shown. {isAdmin ? 'Add them in the Settings tab.' : 'The administrator can add them.'}
          </p>
        </div>
      )}

      {months.map((m) => (
        <section key={m.name} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {m.name} {year}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {m.rows.map(({ f, span }) => {
              const theme = THEMES[f.theme]
              const isToday = span.start <= today && today <= span.end
              const past = span.end < today
              const inDays = daysBetween(today, span.start)
              const note = noteFor(f, year)
              return (
                <div
                  key={f.id}
                  className={cn('flex gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 transition-colors dark:bg-card/90', isToday && 'ring-2', past && 'opacity-60')}
                  style={isToday ? ({ '--tw-ring-color': theme.accent } as CSSProperties) : undefined}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: `${theme.accent}22` }} aria-hidden>
                    <FestivalIcon festival={f} size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold leading-tight">{f.name}</p>
                      {isToday && (
                        <Badge className="h-5 px-1.5 text-[10px] text-white" style={{ background: theme.accent }}>
                          Today
                        </Badge>
                      )}
                      {f.major && !isToday && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          Big day
                        </Badge>
                      )}
                      {f.custom && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          Company
                        </Badge>
                      )}
                    </div>
                    {f.alt && <p className="truncate text-xs text-muted-foreground">{f.alt}</p>}
                    <p className="mt-1 text-sm">
                      {span.end !== span.start ? `${shortDate(span.start)} – ${shortDate(span.end)}` : shortDate(span.start)}
                      <span className="text-muted-foreground"> · {isToday ? 'today' : past ? 'done' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={f.regions}>
                      {f.regions}
                    </p>
                    {note && (
                      <p className="mt-1 flex gap-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400" title={note}>
                        <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{note}</span>
                      </p>
                    )}
                    {span.source === 'admin' && <p className="mt-1 text-[11px] text-muted-foreground">Date set by the administrator</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title={`Preview the ${f.name} celebration`} aria-label={`Preview the ${f.name} celebration`} onClick={() => start(f, 'full', 'preview')}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title={`About ${f.name}, greetings and music`} aria-label={`About ${f.name}`} onClick={() => openFestivalPanel(f.id)}>
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function MySettings() {
  const { user } = useAuth()
  const { config, today, festivals, primary } = useFestivals()
  const [prefs, setPrefs] = useFestivalPrefs(user?.id, config)
  const reduced = useReducedMotion()
  const sample = primary?.festival ?? upcomingFestivals(today, festivals, 400).find((u) => u.festival.major)?.festival ?? null

  const rows: { id: string; title: string; hint: string; checked: boolean; set: (on: boolean) => void; off?: string }[] = [
    {
      id: 'mine-auto',
      title: 'Celebrate automatically',
      hint: 'On a big festival the full-screen celebration plays once, the first time you open the CRM that day.',
      checked: prefs.auto && config.autoCelebrate,
      set: (on) => setPrefs({ auto: on }),
      off: config.autoCelebrate ? undefined : 'Switched off for everyone by the administrator.',
    },
    { id: 'mine-sound', title: 'Sound', hint: 'Fireworks, bells, festive sounds and music. Off keeps every celebration silent.', checked: !prefs.muted, set: (on) => setPrefs({ muted: !on }) },
    {
      id: 'mine-voice',
      title: 'Robi’s voice',
      hint: 'Robi says festival greetings aloud.',
      checked: prefs.voice && config.voice && !prefs.muted,
      set: (on) => setPrefs({ voice: on }),
      off: !config.voice ? 'Switched off for everyone by the administrator.' : prefs.muted ? 'Turn sound on first.' : undefined,
    },
    { id: 'mine-calm', title: 'Gentle mode', hint: 'Fewer and shorter effects.', checked: prefs.calm, set: (on) => setPrefs({ calm: on }) },
  ]

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4" /> My festival settings
        </h3>
        <p className="text-sm text-muted-foreground">Only for you, on this computer.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-4 rounded-xl border border-border/50 px-3 py-2.5">
            <div className="min-w-0">
              <Label htmlFor={r.id} className="text-sm font-medium">
                {r.title}
              </Label>
              <p className="text-xs text-muted-foreground">{r.off ?? r.hint}</p>
            </div>
            <Switch id={r.id} checked={r.checked} disabled={!!r.off} onCheckedChange={r.set} className="mt-0.5 shrink-0" />
          </div>
        ))}
      </div>
      {reduced && (
        <p className="rounded-xl bg-muted/50 p-3 text-sm">Your computer is set to reduce motion, so celebrations show as still pictures. Sounds and greetings still work.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="gap-1.5"
          disabled={prefs.muted}
          onClick={async () => {
            if (await unlockSound()) playFanfare('bells')
            else toast.error('The browser did not allow sound.', { description: 'Click anywhere on the page once, then try again.' })
          }}
        >
          <Volume2 className="h-4 w-4" /> Test sound
        </Button>
        {sample && (
          <Button variant="outline" className="gap-1.5" onClick={() => start(sample, 'full', 'preview')}>
            <Play className="h-4 w-4" /> Preview a celebration
          </Button>
        )}
      </div>
    </GlassCard>
  )
}

export function FestivalsPage() {
  const { isAdmin } = useAuth()
  const { config } = useFestivals()
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab = asked === 'admin' && isAdmin ? 'admin' : asked === 'mine' ? 'mine' : 'calendar'
  const setTab = (next: string) => setParams(next === 'calendar' ? {} : { tab: next }, { replace: true })

  return (
    <div className="space-y-6">
      <PageHeader title="Festivals" subtitle="Robi’s festival calendar, celebrations and greetings" icon={<PartyPopper className="h-5 w-5" />} />

      {!config.enabled && (
        <div className="flex gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Festivals are switched off for everyone. {isAdmin ? 'Turn them on in the Settings tab.' : 'The administrator can turn them on.'}</p>
        </div>
      )}

      <TodayCard />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="h-4 w-4" /> Calendar
          </TabsTrigger>
          <TabsTrigger value="mine" className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" /> My settings
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin" className="gap-1.5" data-testid="festival-admin-tab">
              <Settings2 className="h-4 w-4" /> Settings for everyone
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="calendar">
          <Calendar />
        </TabsContent>
        <TabsContent value="mine">
          <MySettings />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="admin">
            <FestivalAdminSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
