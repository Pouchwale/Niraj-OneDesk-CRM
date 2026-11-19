/**
 * Final score (6 Nov 2026; first called Score history, renamed by the user the same
 * day; the address stays /score-history): every module's scores by week, month and year,
 * for review, with each coordinator's final score. The team leader and the
 * administrator see everyone, a coordinator their own. Periods that have ended
 * are locked (two days after they end); the current one is live. The
 * administrator can work a locked period out again if old records were
 * corrected.
 *
 * Minus scoring (7 Nov 2026): every score is written as its gap from 100, so
 * full marks reads 0 (./format.ts). Scores are still kept and worked out of
 * 100, so the colours, the averages and the locked history are unchanged.
 *
 * The final score ratio (14 Nov 2026): the administrator gives each module a
 * share of the final score, by dates (FinalRatioCard): a period uses the ratio
 * in force on its first day, as it stood when it locked (an open one: now).
 *
 * Every table is fixed to the page width, so no desktop screen needs a
 * sideways scroll; the final score sits next to the name, where Robi's
 * button can never cover it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, History, Loader2, Lock, RefreshCw, Scale } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAllCoordinators, getCoordinatorDisplayName, getDisabledIds, useAuth } from '@/features/auth/AuthContext'
import { scoreTone } from '@/features/assistant/scores'
import { kpiGap } from '@/features/snapshots/transform'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  addDays,
  FINAL_HINT,
  FINAL_WEIGHTED_HINT,
  finalScoreOf,
  LOCK_GRACE_DAYS,
  lockGraceDays,
  periodLabel,
  SCORE_MODULES,
  type FinalWeights,
  ratioEnd,
  ratioOn,
  type FinalRatio,
  type PeriodKind,
  type PeriodScores,
  type ScoreEntry,
  type ScoreHistoryResponse,
  type ScoreModule,
} from '@/lib/score-history'
import { deleteFinalRatio, getScoreHistory, recalculatePeriod, saveFinalRatio } from '@/lib/score-history-api'
import { markSwitchedOff } from '@/lib/score-history'
import { useModuleAccess } from '@/features/auth/module-access'
import { LeadTargetCard } from './LeadTargetCard'
import { scoreModulesOff } from '../../../shared/module-access'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { formatFinal, formatPart, formatScore } from './format'

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

/** The colour of a score, judged on the score kept out of 100 (the same colours as before minus scoring). */
function toneOf(module: ScoreModule, score: number | null): string {
  if (score === null || score === undefined) return 'text-muted-foreground'
  if (module === 'robi') return scoreTone(score)
  if (module === 'kpi' || module === 'kpi_dispute') return scoreTone(kpiGap(score))
  if (module === 'quotations') return score >= 50 ? GOOD : score >= 25 ? WARN : BAD
  if (module === 'billing') return score >= 50 ? GOOD : score >= 0 ? WARN : BAD
  if (module === 'service') return score >= 80 ? GOOD : score >= 50 ? WARN : BAD
  return 'text-foreground'
}

/** A final score from one module only is marked: a 0 from billing alone is not an all-round 0. */
const OneModule = ({ final }: { final: ReturnType<typeof finalScoreOf> }) =>
  !final.weights && final.parts.length === 1 ? <span className="ml-0.5 text-muted-foreground" title="Only one module had a score this period">*</span> : null

const round1 = (v: number) => Math.round(v * 10) / 10
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
      return d.weeks === 1 ? 'The score of 1 week' : `The average of ${plural(d.weeks, 'week')}’ scores`
    case 'quotations':
      return `${plural(d.quotations, 'quotation')}, ${d.conversions} converted (${d.newConversions} new, ${d.existingConversions} existing); ${plural(d.totalScore, 'point')} ÷ ${plural(d.customers, 'customer')}${d.amount ? `; ${formatCurrency(d.amount)}` : ''}`
    case 'billing':
      return kind === 'year' ? `${plural(d.issues, 'issue')}; average of ${plural(d.months, 'month')}` : plural(d.issues, 'issue')
    case 'service':
      if (kind === 'year') return `${plural(d.mails, 'mail')}; average of ${plural(d.months, 'month')}`
      if (kind === 'week' && d.customers === undefined) return `${plural(d.mails, 'mail')}, ${d.points} points (the score is monthly)`
      if (kind === 'week') return `${plural(d.mails, 'mail')}, ${d.points} points ÷ ${d.customers ?? '—'} customers with a PO closed that week`
      return `${plural(d.mails, 'mail')}, ${d.points} points ÷ ${d.customers ?? '—'} customers`
    case 'self_leads':
      // Before 16 Nov 2026 Self Leads was the conversion of the leads; since, the new leads against the week's target.
      if (d.connected !== undefined) return `${plural(d.leads, 'lead')}, ${d.connected} connected, ${d.closed} closed, ${d.lost} lost`
      if (kind === 'week') return `${plural(d.leads, 'new lead')} (target ${d.target}: 100%; fewer ${d.partial}%; none 0%)`
      if (kind === 'year') return `Average of ${plural(d.months, 'month')}`
      return `${plural(d.leads, 'new lead')}; average of ${plural(d.weeks, 'week')}`
  }
}

/** What a cell shows: the score, or for Service weeks the mails (the score itself is monthly); N/A when switched off. */
function cellText(e: ScoreEntry | undefined, kind: PeriodKind): string {
  if (!e) return '—'
  if (e.na) return 'N/A'
  // Weeks locked before 16 Nov 2026 kept only the mails; since, a week has its own score.
  if (e.module === 'service' && kind === 'week' && e.detail.customers === undefined) return plural(e.detail.mails, 'mail')
  return formatScore(e.module, e.score)
}

const averageOf = (scores: (number | null | undefined)[]) => {
  const list = scores.filter((s): s is number => typeof s === 'number')
  return list.length ? Math.round((list.reduce((a, s) => a + s, 0) / list.length) * 100) / 100 : null
}

/** "Average of 4 modules: Robi tasks -25, Regular Overdue -40, …", or with the ratio "Robi tasks -25 × 30%, …" */
function finalDetail(final: ReturnType<typeof finalScoreOf>): string {
  if (final.score === null) return 'No module has a score in this period'
  const left = final.na?.length ? ` · N/A, left out: ${final.na.map(moduleLabel).join(', ')}` : ''
  if (final.weights) {
    const shares = SCORE_MODULES.filter((m) => (final.weights![m.id] ?? 0) > 0 && !final.na?.includes(m.id)).map((m) => {
      const part = final.parts.find((p) => p.module === m.id)
      return `${m.label} ${part ? formatPart(part.value) : 'no score (-100)'} × ${final.weights![m.id]}%`
    })
    return `By the ratio: ${shares.join(', ')}${left ? `${left} (the other shares scaled up to 100%)` : ''}`
  }
  return `Average of ${plural(final.parts.length, 'module')}: ${final.parts.map((p) => `${moduleLabel(p.module)} ${formatPart(p.value)}`).join(', ')}${left}`
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
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live · locks on {formatDate(addDays(period.end, lockGraceDays(period.kind) + 1))}
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
      setError(err instanceof Error ? err.message : 'Could not load the final scores.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load(kind)
  }, [kind, load])

  // Modules the administrator switched off for a coordinator: N/A and left out of the final, in every period.
  const access = useModuleAccess()
  const periods = useMemo(() => {
    const raw = data?.periods ?? []
    const ids = new Set<string>(access.map((a) => a.coordinatorId))
    return markSwitchedOff(raw, (id) => scoreModulesOff(access, id), [...ids])
  }, [data, access])
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
    // A disabled account is left out while disabled; its history is kept and returns when enabled.
    const disabled = getDisabledIds()
    for (const p of periods) for (const e of p.entries) if (!names.has(e.coordinatorId) && !disabled.has(e.coordinatorId)) names.set(e.coordinatorId, e.name)
    return [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [canManageTeam, user, periods])

  const entryOf = (period: PeriodScores | null, personId: string, m: ScoreModule) =>
    period?.entries.find((e) => e.coordinatorId === personId && e.module === m)
  const finalOf = (period: PeriodScores | null, personId: string) =>
    finalScoreOf(period?.entries.filter((e) => e.coordinatorId === personId) ?? [], period?.finalWeights ?? null)
  // The hint follows the period on screen: worked out by a ratio, or the plain average.
  const ratio = selected?.finalWeights ?? null
  const finalHint = ratio ? FINAL_WEIGHTED_HINT : FINAL_HINT

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
      rows.push(['Final score', ...periods.map((p) => formatFinal(finalOf(p, me).score))])
    } else if (view === 'all' && selected) {
      rows.push(['Coordinator', ...SCORE_MODULES.map((m) => m.label), 'Final score'])
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
    downloadWorkbook(`Final score - ${what}.xlsx`, [{ name: 'Scores', rows }])
  }

  const header = (
    <PageHeader title="Final score" subtitle="Each coordinator’s final score and every module’s score, by week, month and year, kept for review" icon={<History className="h-5 w-5" />}>
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
        Weeks run Saturday to Friday. A week is locked on the Tuesday after it ends (Saturday and Monday stay open for late entries and Monday’s automatic KPI score); a month or
        year {LOCK_GRACE_DAYS} days after it ends. After that, edits to old records do not change it.
      </p>
    </GlassCard>
  )

  const finalNote = (
    <p className="text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">Final score:</span> {finalHint}{' '}
      {!ratio && (
        <>
          <span className="text-foreground">*</span> only one module had a score that period.{' '}
        </>
      )}
      A locked period keeps the way its final score was worked out when it locked. Point at a score to see the figures behind it.
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
                <td className={cn(NAME_TD, 'font-semibold')} title={finalHint}>
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
                <th className={cn(TH, FINAL_COL, 'text-foreground')} title={finalHint}>
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
                      {m.id === 'service' && kind === 'week' && avg === null ? '—' : formatScore(m.id, avg)}
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
                    <td className={cn(TD, 'border-l border-border/60 font-semibold', toneOf(m.id, avg))}>{m.id === 'service' && kind === 'week' && avg === null ? '—' : formatScore(m.id, avg)}</td>
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
      <FinalRatioCard ratios={data?.finalRatios ?? []} today={data?.today ?? ''} isAdmin={isAdmin} loaded={Boolean(data)} onSaved={() => load(kind)} />
      <LeadTargetCard targets={data?.leadTargets ?? []} today={data?.today ?? ''} isAdmin={isAdmin} loaded={Boolean(data)} onSaved={() => load(kind)} />
      {body}
    </div>
  )
}

/**
 * The final score ratios by dates (14 Nov 2026): everyone sees them; the
 * administrator adds, changes and removes them. Each has a From date and an
 * optional To date (empty: from then on, until a newer ratio starts) and a
 * share per module adding up to 100. A week, month or year uses the ratio in
 * force on its first day; dates no ratio covers use the nearest earlier one.
 * A period already locked keeps the ratio it locked with.
 */
function FinalRatioCard({ ratios, today, isAdmin, loaded, onSaved }: { ratios: FinalRatio[]; today: string; isAdmin: boolean; loaded: boolean; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<FinalRatio | 'new' | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  if (!loaded || (!ratios.length && !isAdmin)) return null

  const inForce = ratioOn(ratios, today)
  const start = (ratio: FinalRatio | 'new') => {
    const base = ratio === 'new' ? ratios[ratios.length - 1] : ratio
    setFrom(ratio === 'new' ? today : ratio.from)
    setTo(ratio === 'new' ? '' : ratio.to ?? '')
    setDraft(Object.fromEntries(SCORE_MODULES.map((m) => [m.id, String(base?.weights[m.id] ?? 0)])))
    setEditing(ratio)
  }
  const numbers = SCORE_MODULES.map((m) => ((draft[m.id] ?? '').trim() === '' ? 0 : Number(draft[m.id])))
  const valid = numbers.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)
  const total = Math.round(numbers.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0) * 100) / 100
  const datesOk = Boolean(from) && (!to || to >= from)
  const ok = valid && Math.abs(total - 100) < 0.001 && datesOk

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await saveFinalRatio(
        { from, to: to || null, weights: Object.fromEntries(SCORE_MODULES.map((m, i) => [m.id, numbers[i]])) as FinalWeights },
        editing === 'new' ? undefined : editing.id
      )
      toast.success('Final score ratio saved.', { description: 'Weeks, months and years from these dates that are still open use it; locked ones keep theirs.' })
      setEditing(null)
      await onSaved()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }
  const remove = async (ratio: FinalRatio) => {
    if (!window.confirm(`Remove the ratio from ${formatDate(ratio.from)}? Open periods in its dates go to the nearest earlier ratio (or the plain average).`)) return
    try {
      await deleteFinalRatio(ratio.id)
      toast.success('Ratio removed.')
      await onSaved()
    } catch (err) {
      toast.error('Not removed.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }
  const datesOf = (r: FinalRatio) => {
    const end = ratioEnd(r, ratios)
    return `${formatDate(r.from)} – ${end ? formatDate(end) : 'onward'}${!r.to && end ? ' (until the next ratio)' : ''}`
  }

  return (
    <GlassCard className="space-y-3 p-4" data-testid="final-ratio">
      <div className="flex flex-wrap items-center gap-3">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Final score ratio</p>
        <p className="text-xs text-muted-foreground">
          {ratios.length
            ? 'A week, month or year uses the ratio in force on its first day; dates no ratio covers use the nearest earlier one. Locked periods keep theirs.'
            : 'Not set: the final score is the plain average of the modules that have a score.'}
        </p>
        {isAdmin && !editing && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => start('new')} data-testid="final-ratio-add">
            Add ratio
          </Button>
        )}
      </div>

      {ratios.length > 0 && (
        <div className="divide-y divide-border/50 rounded-md border border-border/50" data-testid="final-ratio-list">
          {[...ratios].reverse().map((r) => (
            <div key={r.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm', inForce?.id === r.id && 'bg-primary/5')}>
              <span className="min-w-[230px] font-medium">
                {datesOf(r)}
                {inForce?.id === r.id && <Badge variant="outline" className="ml-2 font-normal">In force today</Badge>}
              </span>
              <span className="flex-1 text-muted-foreground">
                {SCORE_MODULES.filter((m) => (r.weights[m.id] ?? 0) > 0)
                  .map((m) => `${m.label} ${r.weights[m.id]}%`)
                  .join(' · ')}
              </span>
              <span className="text-xs text-muted-foreground">
                Set by {getCoordinatorDisplayName(r.updatedBy)} on {formatDate(r.updatedAt.slice(0, 10))}
              </span>
              {isAdmin && !editing && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => start(r)}>
                    Change
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-rose-600" onClick={() => void remove(r)}>
                    Remove
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-md border border-primary/30 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ratio-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="ratio-from" type="date" className="h-9 w-[160px]" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ratio-to" className="text-xs text-muted-foreground">To (empty = onward)</Label>
              <Input id="ratio-to" type="date" className="h-9 w-[160px]" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {from ? `${formatDate(from)} – ${to ? formatDate(to) : 'onward, until a newer ratio starts'}` : 'Choose the date the ratio starts'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SCORE_MODULES.map((m) => (
              <label key={m.id} className="space-y-1">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    inputMode="decimal"
                    aria-label={`${m.label} share`}
                    className="h-9 w-24 text-right"
                    value={draft[m.id] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className={cn('text-sm font-medium', ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600')} data-testid="final-ratio-total">
              Total {total}%{Math.abs(total - 100) < 0.001 ? '' : ' (must be 100%)'}
              {!datesOk && ' · check the dates'}
            </p>
            <p className="text-xs text-muted-foreground">A module with no score that period counts as -100 for its share; give 0% to a module the team does not use.</p>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!ok || saving} onClick={() => void save()}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save ratio
              </Button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
