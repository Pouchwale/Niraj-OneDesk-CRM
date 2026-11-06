/**
 * Score history (6 Nov 2026): every module's scores by week, month and year,
 * for review, with each coordinator's final score out of 100. The team leader
 * and the administrator see everyone, a coordinator their own. Periods that
 * have ended are locked (two days after they end); the current one is live.
 * The administrator can work a locked period out again if old records were
 * corrected.
 *
 * Every table is fixed to the page width, so no desktop screen needs a
 * sideways scroll; the final score sits next to the name, where Robi's
 * button can never cover it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, History, Loader2, Lock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAllCoordinators, getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { scoreLabel, scoreTone } from '@/features/assistant/scores'
import { kpiGap } from '@/features/snapshots/transform'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  addDays,
  FINAL_HINT,
  finalScoreOf,
  LOCK_GRACE_DAYS,
  periodLabel,
  SCORE_MODULES,
  type PeriodKind,
  type PeriodScores,
  type ScoreEntry,
  type ScoreHistoryResponse,
  type ScoreModule,
} from '@/lib/score-history'
import { getScoreHistory, recalculatePeriod } from '@/lib/score-history-api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type View = ScoreModule | 'all'

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

const GOOD = 'text-emerald-600 dark:text-emerald-400'
const WARN = 'text-amber-600 dark:text-amber-400'
const BAD = 'text-rose-600 dark:text-rose-400'

/* Shared cell styles: compact below wide screens so every column fits. */
const TH = 'px-2 py-2 text-right text-[11px] font-medium xl:text-xs'
const TD = 'px-2 py-2 text-right text-[13px] tabular-nums xl:text-sm'
const NAME_TD = 'truncate px-3 py-2 text-left text-[13px] font-medium xl:text-sm'
/** The final score column, last in every table: tinted, bold, a divider before it. */
const FINAL_COL = 'border-l border-border/60 bg-primary/5 font-semibold'

/** A score written the way its own module writes it. */
function formatScore(module: ScoreModule, score: number | null): string {
  if (score === null || score === undefined) return '—'
  // Halves away from zero, as Robi's weekly average rounds.
  if (module === 'robi') return scoreLabel(Math.sign(score) * Math.round(Math.abs(score)) || 0)
  if (module === 'kpi' || module === 'kpi_dispute') return `${kpiGap(score)}%`
  if (module === 'quotations') return score.toFixed(1)
  if (module === 'self_leads') return `${score}%`
  return String(Math.round(score * 10) / 10)
}

function toneOf(module: ScoreModule, score: number | null): string {
  if (score === null || score === undefined) return 'text-muted-foreground'
  if (module === 'robi') return scoreTone(score)
  if (module === 'kpi' || module === 'kpi_dispute') return scoreTone(kpiGap(score))
  if (module === 'quotations') return score >= 50 ? GOOD : score >= 25 ? WARN : BAD
  if (module === 'billing') return score >= 50 ? GOOD : score >= 0 ? WARN : BAD
  if (module === 'service') return score >= 80 ? GOOD : score >= 50 ? WARN : BAD
  return 'text-foreground'
}

/** A final score from one module only is marked: a 100 from billing alone is not an all-round 100. */
const OneModule = ({ final }: { final: ReturnType<typeof finalScoreOf> }) =>
  final.parts.length === 1 ? <span className="ml-0.5 text-muted-foreground" title="Only one module had a score this period">*</span> : null

const round1 = (v: number) => Math.round(v * 10) / 10
const formatFinal = (score: number | null) => (score === null || score === undefined ? '—' : score.toFixed(1))
const finalTone = (score: number | null) => (score === null || score === undefined ? 'text-muted-foreground' : score >= 80 ? GOOD : score >= 50 ? WARN : BAD)

const plural = (n: number | null | undefined, word: string) => `${n ?? 0} ${word}${n === 1 ? '' : 's'}`
const moduleLabel = (m: ScoreModule) => SCORE_MODULES.find((x) => x.id === m)?.label ?? m

/** The figures behind a score, for its tooltip and the Excel sheet. */
function detailText(e: ScoreEntry, kind: PeriodKind): string {
  const d = e.detail
  switch (e.module) {
    case 'robi':
      return `${d.done} of ${d.given} tasks done over ${plural(d.days, 'day')}${d.extra ? `, ${d.extra} extra customers` : ''}`
    case 'kpi':
    case 'kpi_dispute':
      return `${e.score?.toFixed(2)} of 100, ${plural(d.weeks, 'week')}`
    case 'quotations':
      return `${plural(d.quotations, 'quotation')}, ${d.conversions} converted (${d.newConversions} new, ${d.existingConversions} existing); score ${d.totalScore} ÷ ${plural(d.customers, 'customer')}${d.amount ? `; ${formatCurrency(d.amount)}` : ''}`
    case 'billing':
      return kind === 'year' ? `${plural(d.issues, 'issue')}; average of ${plural(d.months, 'month')}` : plural(d.issues, 'issue')
    case 'service':
      if (kind === 'year') return `${plural(d.mails, 'mail')}; average of ${plural(d.months, 'month')}`
      if (kind === 'week') return `${plural(d.mails, 'mail')}, ${d.points} points (the score is monthly)`
      return `${plural(d.mails, 'mail')}, ${d.points} points ÷ ${d.customers ?? '—'} customers`
    case 'self_leads':
      return `${plural(d.leads, 'lead')}, ${d.connected} connected, ${d.closed} closed, ${d.lost} lost`
  }
}

/** What a cell shows: the score, or for Service weeks the mails (the score itself is monthly). */
function cellText(e: ScoreEntry | undefined, kind: PeriodKind): string {
  if (!e) return '—'
  if (e.module === 'service' && kind === 'week') return plural(e.detail.mails, 'mail')
  return formatScore(e.module, e.score)
}

const averageOf = (scores: (number | null | undefined)[]) => {
  const list = scores.filter((s): s is number => typeof s === 'number')
  return list.length ? Math.round((list.reduce((a, s) => a + s, 0) / list.length) * 100) / 100 : null
}

/** "Average of 4 modules: Robi tasks 75, Weekly KPI 60, …" */
function finalDetail(final: ReturnType<typeof finalScoreOf>): string {
  if (final.score === null) return 'No module has a score in this period'
  return `Average of ${plural(final.parts.length, 'module')} out of 100: ${final.parts.map((p) => `${moduleLabel(p.module)} ${Math.round(p.value * 10) / 10}`).join(', ')}`
}

function PeriodStatus({ period }: { period: PeriodScores }) {
  if (period.lockedAt) {
    const by = period.lockedBy && period.lockedBy !== 'auto' ? `, worked out again by ${getCoordinatorDisplayName(period.lockedBy)}` : ''
    return (
      <Badge variant="outline" className="gap-1 font-normal">
        <Lock className="h-3 w-3" /> Locked {formatDate(period.lockedAt.slice(0, 10))}
        {by}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-400">
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live · locks on {formatDate(addDays(period.end, LOCK_GRACE_DAYS + 1))}
    </Badge>
  )
}

/** A period column's heading: lock or live dot, and its short name. */
function PeriodHead({ p }: { p: PeriodScores }) {
  return (
    <th className={TH} title={p.lockedAt ? `Locked ${formatDate(p.lockedAt.slice(0, 10))}` : 'Live'}>
      <span className="inline-flex items-center justify-end gap-1">
        {p.lockedAt ? <Lock className="h-3 w-3 shrink-0" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
        {periodLabel(p.kind, p.key, true)}
      </span>
    </th>
  )
}

export function ScoreHistoryPage() {
  const { user, isAdmin, canManageTeam } = useAuth()
  const [kind, setKind] = useState<PeriodKind>('week')
  const [view, setView] = useState<View>('all')
  const [data, setData] = useState<ScoreHistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (k: PeriodKind) => {
    setLoading(true)
    setError(null)
    try {
      const body = await getScoreHistory(k)
      setData(body)
      setSelectedId((id) => (id && body.periods.some((p) => p.id === id) ? id : body.periods[body.periods.length - 1]?.id ?? null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the score history.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load(kind)
  }, [kind, load])

  const periods = data?.periods ?? []
  // As many periods as fit beside the names: no desktop screen scrolls sideways. Averages and Excel use them all.
  const xxl = useMediaQuery('(min-width: 1600px)')
  const wide = useMediaQuery('(min-width: 1440px)')
  const xl = useMediaQuery('(min-width: 1280px)')
  const lg = useMediaQuery('(min-width: 1024px)')
  const md = useMediaQuery('(min-width: 768px)')
  // One column goes to the final score.
  const fit = xxl ? 12 : wide ? 11 : xl ? 9 : lg ? 7 : md ? 5 : 2
  const visible = periods.slice(-fit)
  const selected = periods.find((p) => p.id === selectedId) ?? periods[periods.length - 1] ?? null
  const selectedIndex = selected ? periods.indexOf(selected) : -1

  // The people the tables list: today's coordinators, and anyone named in the history who has left since.
  const people = useMemo(() => {
    if (!canManageTeam) return user ? [{ id: user.id, name: user.full_name }] : []
    const names = new Map(getAllCoordinators().map((c) => [c.id, c.full_name ?? c.id]))
    for (const p of periods) for (const e of p.entries) if (!names.has(e.coordinatorId)) names.set(e.coordinatorId, e.name)
    return [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [canManageTeam, user, periods])

  const entryOf = (period: PeriodScores | null, personId: string, m: ScoreModule) =>
    period?.entries.find((e) => e.coordinatorId === personId && e.module === m)
  const finalOf = (period: PeriodScores | null, personId: string) => finalScoreOf(period?.entries.filter((e) => e.coordinatorId === personId) ?? [])

  const workOutAgain = async () => {
    if (!selected?.lockedAt) return
    if (!window.confirm(`Work out ${periodLabel(selected.kind, selected.key)} again from today’s records? The locked scores are replaced.`)) return
    setBusy(true)
    try {
      await recalculatePeriod(selected.id)
      toast.success('Worked out again and locked.', { description: periodLabel(selected.kind, selected.key) })
      await load(kind)
    } catch (err) {
      toast.error('Not done.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  /* ----- Excel: the table on screen ----- */
  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    type Cell = string | number | null
    const rows: Cell[][] = []
    const me = user?.id ?? ''
    if (!canManageTeam) {
      rows.push(['', ...periods.map((p) => periodLabel(p.kind, p.key))])
      for (const m of SCORE_MODULES) rows.push([m.label, ...periods.map((p) => cellText(entryOf(p, me, m.id), kind))])
      rows.push(['Final score (out of 100)', ...periods.map((p) => formatFinal(finalOf(p, me).score))])
    } else if (view === 'all' && selected) {
      rows.push(['Coordinator', ...SCORE_MODULES.map((m) => m.label), 'Final score (out of 100)'])
      for (const person of people) {
        rows.push([person.name, ...SCORE_MODULES.map((m) => cellText(entryOf(selected, person.id, m.id), kind)), formatFinal(finalOf(selected, person.id).score)])
      }
      rows.push([])
      rows.push(['Details'])
      for (const person of people) {
        for (const m of SCORE_MODULES) {
          const e = entryOf(selected, person.id, m.id)
          if (e) rows.push([person.name, m.label, detailText(e, kind)])
        }
        rows.push([person.name, 'Final score', finalDetail(finalOf(selected, person.id))])
      }
    } else if (view !== 'all') {
      rows.push(['Coordinator', ...periods.map((p) => periodLabel(p.kind, p.key)), 'Average', `Final score (average of ${periods.length} ${kind}s)`])
      for (const person of people) {
        const scores = periods.map((p) => entryOf(p, person.id, view)?.score ?? null)
        const final = averageOf(periods.map((p) => finalOf(p, person.id).score))
        rows.push([person.name, ...periods.map((p) => cellText(entryOf(p, person.id, view), kind)), formatScore(view, averageOf(scores)), formatFinal(final === null ? null : round1(final))])
      }
    }
    const what = view === 'all' ? (selected ? periodLabel(selected.kind, selected.key) : kind) : moduleLabel(view)
    downloadWorkbook(`Score history - ${what}.xlsx`, [{ name: 'Scores', rows }])
  }

  const header = (
    <PageHeader title="Score history" subtitle="Every module’s scores and a final score, by week, month and year, kept for review" icon={<History className="h-5 w-5" />}>
      <Button variant="outline" onClick={() => void download()} disabled={!periods.length}>
        <Download className="mr-2 h-4 w-4" /> Excel
      </Button>
    </PageHeader>
  )

  const controls = (
    <GlassCard className="flex flex-wrap items-end gap-4 p-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Period</p>
        <div className="flex rounded-full bg-muted p-0.5" role="radiogroup" aria-label="Week, month or year">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn('rounded-full px-4 py-1.5 text-sm font-medium', kind === k.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {canManageTeam && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Show</p>
          <Select value={view} onValueChange={(v) => setView(v as View)}>
            <SelectTrigger className="h-9 w-64" aria-label="Module">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules, one period</SelectItem>
              {SCORE_MODULES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label} over time
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <p className="ml-auto max-w-md text-xs text-muted-foreground">
        A period is locked {LOCK_GRACE_DAYS} days after it ends, so entries made late for its last days still count. After that, edits to old records do not change it.
      </p>
    </GlassCard>
  )

  const finalNote = (
    <p className="text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">Final score:</span> {FINAL_HINT} <span className="text-foreground">*</span> only one module had a score that period. Point at a score to see the figures behind it.
    </p>
  )

  const body = (() => {
    if (loading && !data) {
      return (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )
    }
    if (error) return <GlassCard className="p-6 text-sm text-rose-600">{error}</GlassCard>
    if (!periods.length) return <GlassCard className="p-6 text-sm text-muted-foreground">No scores yet.</GlassCard>

    /* A coordinator: each module, then their final score, period by period. */
    if (!canManageTeam) {
      const me = user?.id ?? ''
      return (
        <GlassCard className="space-y-3 p-4">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed lg:min-w-0">
            <colgroup>
              <col className="w-32 xl:w-40" />
            </colgroup>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className={cn(TH, 'text-left')}>Module</th>
                {visible.map((p) => (
                  <PeriodHead key={p.id} p={p} />
                ))}
              </tr>
            </thead>
            <tbody>
              {SCORE_MODULES.map((m) => (
                <tr key={m.id} className="border-t border-border/50">
                  <td className={NAME_TD} title={m.hint}>
                    {m.label}
                  </td>
                  {visible.map((p) => {
                    const e = entryOf(p, me, m.id)
                    return (
                      <td key={p.id} className={cn(TD, e ? toneOf(m.id, e.score) : 'text-muted-foreground')} title={e ? detailText(e, kind) : 'Nothing to score'}>
                        {cellText(e, kind)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-primary/5">
                <td className={cn(NAME_TD, 'font-semibold')} title={FINAL_HINT}>
                  Final score
                </td>
                {visible.map((p) => {
                  const f = finalOf(p, me)
                  return (
                    <td key={p.id} className={cn(TD, 'font-semibold', finalTone(f.score))} title={finalDetail(f)}>
                      {formatFinal(f.score)}
                      <OneModule final={f} />
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
          </div>
          {finalNote}
        </GlassCard>
      )
    }

    /* The team leader and the administrator: all modules for one period, the final score last. */
    if (view === 'all' && selected) {
      const finals = people.map((person) => finalOf(selected, person.id))
      return (
        <GlassCard className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={selectedIndex <= 0} onClick={() => setSelectedId(periods[selectedIndex - 1]?.id ?? null)} aria-label="Earlier period">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={selected.id} onValueChange={setSelectedId}>
                <SelectTrigger className="h-8 w-60" aria-label="Period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...periods].reverse().map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {periodLabel(p.kind, p.key)}
                      {p.lockedAt ? '' : ' (live)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={selectedIndex >= periods.length - 1} onClick={() => setSelectedId(periods[selectedIndex + 1]?.id ?? null)} aria-label="Later period">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodStatus period={selected} />
              {isAdmin && selected.lockedAt && (
                <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => void workOutAgain()} disabled={busy}>
                  <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Work out again
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed lg:min-w-0" data-testid="score-table">
            <colgroup>
              <col className="w-[19%]" />
              {SCORE_MODULES.map((m) => (
                <col key={m.id} />
              ))}
              <col className="w-[10%]" />
            </colgroup>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className={cn(TH, 'text-left')}>Coordinator</th>
                {SCORE_MODULES.map((m) => (
                  <th key={m.id} className={TH} title={m.hint}>
                    {m.short}
                  </th>
                ))}
                <th className={cn(TH, FINAL_COL, 'text-foreground')} title={FINAL_HINT}>
                  Final score
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((person, i) => (
                <tr key={person.id} className="border-t border-border/50">
                  <td className={NAME_TD} title={person.name}>
                    {person.name}
                  </td>
                  {SCORE_MODULES.map((m) => {
                    const e = entryOf(selected, person.id, m.id)
                    return (
                      <td key={m.id} className={cn(TD, e ? toneOf(m.id, e.score) : 'text-muted-foreground')} title={e ? detailText(e, kind) : 'Nothing to score'}>
                        {cellText(e, kind)}
                      </td>
                    )
                  })}
                  <td className={cn(TD, FINAL_COL, finalTone(finals[i].score))} title={finalDetail(finals[i])}>
                    {formatFinal(finals[i].score)}
                    <OneModule final={finals[i]} />
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className={NAME_TD}>Team average</td>
                {SCORE_MODULES.map((m) => {
                  const avg = averageOf(selected.entries.filter((e) => e.module === m.id).map((e) => e.score))
                  return (
                    <td key={m.id} className={cn(TD, toneOf(m.id, avg))}>
                      {m.id === 'service' && kind === 'week' ? '—' : formatScore(m.id, avg)}
                    </td>
                  )
                })}
                {(() => {
                  const avg = averageOf(finals.map((f) => f.score))
                  return <td className={cn(TD, FINAL_COL, finalTone(avg))}>{formatFinal(avg === null ? null : Math.round(avg * 10) / 10)}</td>
                })()}
              </tr>
            </tbody>
          </table>
          </div>
          {finalNote}
        </GlassCard>
      )
    }

    /* One module, period by period, with each person's final score last (as in All modules). */
    const m = SCORE_MODULES.find((x) => x.id === view)!
    const span = `${periods.length} ${kind}${periods.length === 1 ? '' : 's'}`
    return (
      <GlassCard className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{m.hint}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed lg:min-w-0" data-testid="score-table">
            <colgroup>
              <col className="w-32 xl:w-40" />
              {visible.map((p) => (
                <col key={p.id} />
              ))}
              <col />
              <col className="w-16 xl:w-20" />
            </colgroup>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className={cn(TH, 'text-left')}>Coordinator</th>
                {visible.map((p) => (
                  <PeriodHead key={p.id} p={p} />
                ))}
                <th className={cn(TH, 'border-l border-border/60 text-foreground')} title={`Average of the last ${span}`}>
                  Average
                </th>
                <th className={cn(TH, FINAL_COL, 'text-foreground')} title={`The average of each ${kind}’s final score over the last ${span}`}>
                  Final score
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const avg = averageOf(periods.map((p) => entryOf(p, person.id, m.id)?.score))
                const finals = periods.map((p) => finalOf(p, person.id))
                const final = averageOf(finals.map((x) => x.score))
                const onlyOne = finals.some((x) => x.score !== null) && finals.every((x) => x.score === null || x.parts.length === 1)
                return (
                  <tr key={person.id} className="border-t border-border/50">
                    <td className={NAME_TD} title={person.name}>
                      {person.name}
                    </td>
                    {visible.map((p) => {
                      const e = entryOf(p, person.id, m.id)
                      return (
                        <td key={p.id} className={cn(TD, e ? toneOf(m.id, e.score) : 'text-muted-foreground')} title={e ? detailText(e, kind) : 'Nothing to score'}>
                          {cellText(e, kind)}
                        </td>
                      )
                    })}
                    <td className={cn(TD, 'border-l border-border/60 font-semibold', toneOf(m.id, avg))}>{m.id === 'service' && kind === 'week' ? '—' : formatScore(m.id, avg)}</td>
                    <td className={cn(TD, FINAL_COL, finalTone(final))} title={`Average final score over the last ${span}`}>
                      {formatFinal(final === null ? null : round1(final))}
                      {onlyOne && (
                        <span className="ml-0.5 text-muted-foreground" title="Only one module had a score in these periods">
                          *
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Final score:</span> the average of each {kind}’s final score (as in All modules) over the last {span}.{' '}
          <span className="text-foreground">*</span> only one module had a score in those {kind}s.
        </p>
      </GlassCard>
    )
  })()

  return (
    // Room at the foot of the page, so the last row can scroll clear of Robi's button.
    <div className="space-y-6 pb-24">
      {header}
      {controls}
      {body}
    </div>
  )
}
