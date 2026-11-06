/**
 * Festivals → Settings, for the administrator (6 Nov 2026): everything about
 * Robi's celebrations for the whole team. The master switch, automatic
 * celebrations, default sound and voice, music, Robi's greeting, the header
 * garland, intensity and length; each festival on or off, celebrated
 * full-screen or not, its date corrected for any year, its own greeting; the
 * Navratri colours; and the company's own celebrations. Changes are a draft
 * until Save.
 */

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Info, PartyPopper, Play, Plus, RotateCcw, Save, Search, Settings2, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore } from '@/lib/demo-companies'
import { cleanFestivalConfig, DEFAULT_FESTIVAL_CONFIG } from '@/lib/festival-config'
import { whenSaved } from '@/lib/shared-data'
import type { CustomCelebration, FestivalConfig, FestivalOverride } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'
import { unlockSound } from './festival-audio'
import { celebrate } from './festival-bus'
import { addDays, COLOUR_HEX, datesFor, daysBetween, missingDates, noteFor, resolveFestivals, shortDate, type Festival } from './festival-calendar'
import { FESTIVAL_BY_ID, type FestivalId } from './festival-data'
import { PANCHANG_SOURCE } from './festival-dates'
import { THEME_KEYS, THEMES } from './festival-themes'
import { FestivalIcon } from './FestiveAccessory'
import { useFestivalConfig, useIstToday } from './useFestivals'

/** The settings without who saved them, to tell whether the draft differs. */
const comparable = (c: FestivalConfig) => JSON.stringify({ ...cleanFestivalConfig(c), updatedBy: null, updatedAt: null })

const COLOUR_NAMES = Object.keys(COLOUR_HEX)
  .filter((n) => n !== 'gray' && n !== 'gold')
  .map((n) => n.replace(/\b\w/g, (c) => c.toUpperCase()))

function SettingRow({ title, hint, checked, onChange, id }: { title: string; hint: string; checked: boolean; onChange: (on: boolean) => void; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 px-3 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  )
}

/** A festival override without empty keys; null when nothing is left. */
function tidy(o: FestivalOverride): FestivalOverride | null {
  const out: FestivalOverride = {}
  if (o.enabled !== undefined) out.enabled = o.enabled
  if (o.auto !== undefined) out.auto = o.auto
  if (o.dates && Object.keys(o.dates).length) out.dates = o.dates
  if (o.greeting?.trim()) out.greeting = o.greeting
  if (o.colours?.some((c) => c.trim())) out.colours = o.colours
  return Object.keys(out).length ? out : null
}

export function FestivalAdminSettings() {
  const { user } = useAuth()
  const saved = useFestivalConfig()
  const [draft, setDraft] = useState<FestivalConfig>(() => cleanFestivalConfig(saved))
  const dirty = comparable(draft) !== comparable(saved)
  const [busy, setBusy] = useState(false)

  // Someone else saved meanwhile and nothing is being edited here: show theirs.
  useEffect(() => {
    if (!dirty) setDraft(cleanFestivalConfig(saved))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const today = useIstToday()
  const thisYear = Number(today.slice(0, 4))
  const years = [thisYear, thisYear + 1, thisYear + 2, thisYear + 3]
  const [year, setYear] = useState(thisYear)
  const [search, setSearch] = useState('')

  const festivals = useMemo(() => resolveFestivals(draft), [draft])
  const builtIn = festivals.filter((f) => !f.custom)
  const missing = missingDates(festivals, year)
  const shown = builtIn
    .filter((f) => !search.trim() || `${f.name} ${f.alt ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (datesFor(a, year)?.start ?? '9999').localeCompare(datesFor(b, year)?.start ?? '9999') || a.name.localeCompare(b.name))

  const set = (patch: Partial<FestivalConfig>) => setDraft((d) => ({ ...d, ...patch }))
  const setOverride = (id: string, change: (o: FestivalOverride) => FestivalOverride) =>
    setDraft((d) => {
      const next = tidy(change(d.festivals[id] ?? {}))
      const festivalsNext = { ...d.festivals }
      if (next) festivalsNext[id] = next
      else delete festivalsNext[id]
      return { ...d, festivals: festivalsNext }
    })

  /** Sets (or clears) the administrator's date for that year; a date equal to the Panchang's is no change. */
  const setDate = (f: Festival, start: string, end?: string) =>
    setOverride(f.id, (o) => {
      const dates = { ...(o.dates ?? {}) }
      const panchang = f.panchangDates[year]
      const [pStart, pEnd] = typeof panchang === 'string' ? [panchang, panchang] : panchang ?? [null, null]
      if (!start || (start === pStart && (end ?? start) === pEnd)) delete dates[String(year)]
      else dates[String(year)] = end && end > start ? { start, end } : { start }
      return { ...o, dates }
    })

  const preview = (f: Festival) => {
    void unlockSound()
    celebrate({ festivalId: f.id, festival: f, mode: 'full', reason: 'preview', seconds: 10 })
  }

  const setCustom = (id: string, patch: Partial<CustomCelebration>) => set({ custom: draft.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const addCustom = () =>
    set({
      custom: [
        ...draft.custom,
        { id: `c${Date.now().toString(36)}`, name: '', date: today, yearly: true, theme: 'celebration', emoji: '🎉', greeting: '', about: '', enabled: true, auto: true },
      ],
    })

  const save = async () => {
    if (draft.custom.some((c) => !c.name.trim())) {
      toast.error('Give every company celebration a name.', { description: 'Or delete the empty one.' })
      return
    }
    setBusy(true)
    try {
      demoCompanyStore.saveFestivalConfig({ ...draft, updatedBy: user?.id ?? null, updatedAt: new Date().toISOString() })
      await whenSaved()
      toast.success('Festival settings saved.', { description: 'Everyone sees the change within a few seconds.' })
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const navratri = festivals.find((f) => f.id === 'navratri')
  const colours = draft.festivals.navratri?.colours ?? []

  return (
    <div className="space-y-6" data-testid="festival-admin">
      {/* For everyone */}
      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Settings2 className="h-4 w-4" /> For everyone
            </h3>
            <p className="text-sm text-muted-foreground">Each person can still mute sounds, turn Robi’s voice off or stop automatic celebrations for themselves.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {saved.updatedAt ? `Last saved by ${getCoordinatorDisplayName(saved.updatedBy ?? '')} on ${formatDate(saved.updatedAt.slice(0, 10))}` : 'Using the default settings'}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <SettingRow id="fest-enabled" title="Festivals on" hint="The festival chip, Robi’s festive greetings, decorations and celebrations." checked={draft.enabled} onChange={(on) => set({ enabled: on })} />
          <SettingRow id="fest-auto" title="Celebrate automatically" hint="On a big festival the full-screen celebration plays once a day when someone opens the CRM." checked={draft.autoCelebrate} onChange={(on) => set({ autoCelebrate: on })} />
          <SettingRow id="fest-sound" title="Sounds on by default" hint="Fireworks, bells and festive sounds for people who have not chosen." checked={draft.sound} onChange={(on) => set({ sound: on })} />
          <SettingRow id="fest-voice" title="Robi’s voice" hint="Robi says festival greetings aloud (each person can turn it off)." checked={draft.voice} onChange={(on) => set({ voice: on })} />
          <SettingRow id="fest-music" title="Festival music" hint="A Play music button with a short tune in a traditional raga." checked={draft.music} onChange={(on) => set({ music: on })} />
          <SettingRow id="fest-robi" title="Robi’s festive greeting" hint="Robi opens with the festival’s wishes, and counts down to the next big one." checked={draft.robiGreeting} onChange={(on) => set({ robiGreeting: on })} />
          <SettingRow id="fest-toran" title="Toran under the header" hint="A garland of marigolds, or bunting, on festival days." checked={draft.decorations} onChange={(on) => set({ decorations: on })} />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Effects</Label>
            <Select value={draft.intensity} onValueChange={(v) => set({ intensity: v as FestivalConfig['intensity'] })}>
              <SelectTrigger className="h-9 w-40" aria-label="Effects">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="rich">Rich</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fest-seconds">Celebration length (seconds)</Label>
            <Input id="fest-seconds" type="number" min={5} max={60} className="h-9 w-32" value={draft.durationSec} onChange={(e) => set({ durationSec: Math.min(60, Math.max(5, Number(e.target.value) || 12)) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fest-countdown">Countdown starts (days before)</Label>
            <Input id="fest-countdown" type="number" min={0} max={30} className="h-9 w-32" value={draft.countdownDays} onChange={(e) => set({ countdownDays: Math.min(30, Math.max(0, Number(e.target.value) || 0)) })} />
          </div>
        </div>
      </GlassCard>

      {/* Festivals and their dates */}
      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <CalendarClock className="h-4 w-4" /> Festivals and dates
            </h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Dates come from {PANCHANG_SOURCE.replace(/, \d.*$/, '')} for {thisYear} to 2028. Change a date if your calendar says otherwise; clear it to go back to the Panchang date. Lunar dates are never guessed: a year with no date is not shown until you add it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-muted p-0.5" role="radiogroup" aria-label="Year">
              {years.map((y) => (
                <button key={y} type="button" role="radio" aria-checked={year === y} onClick={() => setYear(y)} className={cn('rounded-full px-3 py-1 text-xs font-medium', year === y ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {y}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a festival" className="h-8 w-44 pl-8 text-sm" aria-label="Find a festival" />
            </div>
          </div>
        </div>

        {missing.length > 0 && (
          <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              No confirmed date for {year}: {missing.map((f) => f.name).join(', ')}. They stay hidden that year until you enter their dates below (from Drik Panchang or the government holiday list).
            </p>
          </div>
        )}

        <div className="divide-y divide-border/60 rounded-xl border border-border/60">
          {shown.map((f) => {
            const span = datesFor(f, year)
            const note = noteFor(f, year)
            const info = FESTIVAL_BY_ID.get(f.id as FestivalId)
            const multi = !!span && span.end !== span.start
            const o = draft.festivals[f.id] ?? {}
            return (
              <div key={f.id} className={cn('grid items-center gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.25fr)_auto_minmax(0,1.3fr)_auto]', !f.enabled && 'bg-muted/40')}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg" style={{ background: `${THEMES[f.theme].accent}22` }} aria-hidden>
                    <FestivalIcon festival={f} size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className={cn('truncate text-sm font-medium', !f.enabled && 'text-muted-foreground line-through')}>{f.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{f.panchang}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      type="date"
                      className="h-8 w-[150px] text-sm"
                      min={`${year}-01-01`}
                      max={`${year}-12-31`}
                      value={span?.start ?? ''}
                      onChange={(e) => setDate(f, e.target.value, multi && span ? addDays(e.target.value, daysBetween(span.start, span.end)) : undefined)}
                      aria-label={`${f.name} date in ${year}`}
                      disabled={!!f.fixed}
                    />
                    {multi && span && (
                      <>
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="date" className="h-8 w-[150px] text-sm" min={span.start} max={`${year}-12-31`} value={span.end} onChange={(e) => setDate(f, span.start, e.target.value)} aria-label={`${f.name} last day in ${year}`} />
                      </>
                    )}
                    {span?.source === 'admin' && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Back to the Panchang date" onClick={() => setDate(f, '')}>
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {span ? (
                      <>
                        {shortDate(span.start)}
                        {span.source === 'admin' ? <Badge variant="outline" className="h-4 px-1.5 text-[10px]">set by you</Badge> : span.source === 'fixed' ? ' · fixed date' : span.source === 'panchang' ? ' · Panchang' : ''}
                      </>
                    ) : (
                      <span className="text-amber-600">No date for {year}</span>
                    )}
                    {note && (
                      <span className="inline-flex items-center gap-1 text-amber-600" title={note}>
                        <TriangleAlert className="h-3 w-3" /> {note}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch checked={f.enabled} onCheckedChange={(on) => setOverride(f.id, (x) => ({ ...x, enabled: on ? undefined : false }))} aria-label={`Show ${f.name}`} />
                    Show
                  </label>
                  <label className="flex items-center gap-1.5 text-xs" title="Plays the full-screen celebration by itself on its day">
                    <Switch checked={f.auto} onCheckedChange={(on) => setOverride(f.id, (x) => ({ ...x, auto: on === info?.major ? undefined : on }))} aria-label={`Full-screen celebration for ${f.name}`} disabled={!f.enabled} />
                    Full-screen
                  </label>
                </div>

                <Input
                  value={o.greeting ?? ''}
                  onChange={(e) => setOverride(f.id, (x) => ({ ...x, greeting: e.target.value }))}
                  placeholder={`Own greeting (default: ${f.wishes[0]})`}
                  className="h-8 text-sm"
                  maxLength={300}
                  aria-label={`Own greeting for ${f.name}`}
                />

                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => preview(f)}>
                  <Play className="h-3.5 w-3.5" /> Preview
                </Button>
              </div>
            )
          })}
        </div>
      </GlassCard>

      {/* Navratri colours */}
      {navratri && (
        <GlassCard className="space-y-3 p-4 sm:p-6">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">💃 Navratri colours</h3>
            <p className="text-sm text-muted-foreground">
              The colour of each night. Left on Automatic, the first seven nights use the weekday colours every published list follows, and the last nights show no colour until you set one (they change every year).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="space-y-1">
                <Label className="text-xs">Night {i + 1}</Label>
                <Select
                  value={colours[i]?.trim() || 'auto'}
                  onValueChange={(v) =>
                    setOverride('navratri', (x) => {
                      const next = Array.from({ length: 9 }, (_, j) => x.colours?.[j] ?? '')
                      next[i] = v === 'auto' ? '' : v
                      return { ...x, colours: next }
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs" aria-label={`Night ${i + 1} colour`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic</SelectItem>
                    {COLOUR_NAMES.map((n) => (
                      <SelectItem key={n} value={n}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: COLOUR_HEX[n.toLowerCase()] }} />
                          {n}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* The company's own celebrations */}
      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <PartyPopper className="h-4 w-4" /> Company celebrations
            </h3>
            <p className="text-sm text-muted-foreground">Your own days, such as the company’s foundation day or a team milestone. Robi celebrates them like a festival.</p>
          </div>
          <Button size="sm" variant="outline" onClick={addCustom} disabled={draft.custom.length >= 50} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add a celebration
          </Button>
        </div>
        {draft.custom.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <div className="space-y-3">
            {draft.custom.map((c) => {
              const f = festivals.find((x) => x.id === `custom:${c.id}`)
              return (
                <div key={c.id} className="space-y-3 rounded-xl border border-border/60 p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-20 space-y-1">
                      <Label className="text-xs">Emoji</Label>
                      <Input value={c.emoji} onChange={(e) => setCustom(c.id, { emoji: e.target.value.slice(0, 8) })} className="h-9 text-center text-lg" aria-label="Emoji" />
                    </div>
                    <div className="min-w-[200px] flex-1 space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input value={c.name} onChange={(e) => setCustom(c.id, { name: e.target.value })} placeholder="e.g. Foundation Day" className={cn('h-9', !c.name.trim() && 'border-amber-500')} maxLength={60} aria-label="Name" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date</Label>
                      <Input type="date" value={c.date} onChange={(e) => e.target.value && setCustom(c.id, { date: e.target.value })} className="h-9 w-[160px]" aria-label="Date" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Look</Label>
                      <Select value={c.theme} onValueChange={(v) => setCustom(c.id, { theme: v })}>
                        <SelectTrigger className="h-9 w-56" aria-label="Look">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {THEME_KEYS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {THEMES[k].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input value={c.greeting} onChange={(e) => setCustom(c.id, { greeting: e.target.value })} placeholder="Greeting, e.g. Thank you all for another great year!" className="h-9 min-w-[240px] flex-1" maxLength={300} aria-label="Greeting" />
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch checked={c.yearly} onCheckedChange={(on) => setCustom(c.id, { yearly: on })} aria-label="Every year" /> Every year
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch checked={c.enabled} onCheckedChange={(on) => setCustom(c.id, { enabled: on })} aria-label="Show" /> Show
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch checked={c.auto} onCheckedChange={(on) => setCustom(c.id, { auto: on })} aria-label="Full-screen" /> Full-screen
                    </label>
                    {f && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => preview(f)} disabled={!c.name.trim()}>
                        <Play className="h-3.5 w-3.5" /> Preview
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-rose-600 hover:text-rose-700" onClick={() => set({ custom: draft.custom.filter((x) => x.id !== c.id) })}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                  <Input value={c.about} onChange={(e) => setCustom(c.id, { about: e.target.value })} placeholder="About (optional): what the day is, for “Tell me about it”" className="h-9" maxLength={600} aria-label="About" />
                </div>
              )
            })}
          </div>
        )}
      </GlassCard>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> Effects are drawn and played in the browser only; no device is ever switched on.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => {
            if (window.confirm('Put every festival setting back to the defaults? Your date changes and company celebrations are removed when you save.')) setDraft({ ...DEFAULT_FESTIVAL_CONFIG })
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
        </Button>
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-20">
          <GlassCard variant="strong" className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-5">
            <p className="text-sm font-medium">You have unsaved festival settings.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(cleanFestivalConfig(saved))} disabled={busy}>
                Discard
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={busy} className="gap-1.5" data-testid="festival-save">
                <Save className="h-4 w-4" /> Save for everyone
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
