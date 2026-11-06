/**
 * Score history (6 Nov 2026): every module's scores by week, month and year,
 * for review. The team leader and the administrator see everyone, a
 * coordinator their own. Periods that have ended are locked (two days after
 * they end); the current one is live. The administrator can work a locked
 * period out again if old records were corrected.
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
import { addDays, LOCK_GRACE_DAYS, periodLabel, SCORE_MODULES, type PeriodKind, type PeriodScores, type ScoreEntry, type ScoreHistoryResponse, type ScoreModule } from '@/lib/score-history'
import { getScoreHistory, recalculatePeriod } from '@/lib/score-history-api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

const GOOD = 'text-emerald-600 dark:text-emerald-400'
const WARN = 'text-amber-600 dark:text-amber-400'
const BAD = 'text-rose-600 dark:text-rose-400'

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

const plural = (n: number | null | undefined, word: string) => `${n ?? 0} ${word}${n === 1 ? '' : 's'}`

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

export function ScoreHistoryPage() {
  const { user, isAdmin, canManageTeam } = useAuth()
  const [kind, setKind] = useState<PeriodKind>('week')
  const [module, setModule] = useState<ScoreModule | 'all'>('all')
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
    if (!canManageTeam) {
      rows.push(['Module', ...periods.map((p) => periodLabel(p.kind, p.key)), 'Details (latest)'])
      for (const m of SCORE_MODULES) {
        const last = [...periods].reverse().map((p) => entryOf(p, user?.id ?? '', m.id)).find(Boolean)
        rows.push([m.label, ...periods.map((p) => cellText(entryOf(p, user?.id ?? '', m.id), kind)), last ? detailText(last, kind) : ''])
      }
    } else if (module === 'all' && selected) {
      rows.push(['Coordinator', ...SCORE_MODULES.map((m) => m.label)])
      for (const person of people) rows.push([person.name, ...SCORE_MODULES.map((m) => cellText(entryOf(selected, person.id, m.id), kind))])
      rows.push([])
      rows.push(['Details'])
      for (const person of people)
        for (const m of SCORE_MODULES) {
          const e = entryOf(selected, person.id, m.id)
          if (e) rows.push([person.name, m.label, detailText(e, kind)])
        }
    } else if (module !== 'all') {
      rows.push(['Coordinator', ...periods.map((p) => periodLabel(p.kind, p.key)), 'Average'])
      for (const person of people) {
        const scores = periods.map((p) => entryOf(p, person.id, module)?.score ?? null)
        rows.push([person.name, ...periods.map((p) => cellText(entryOf(p, person.id, module), kind)), formatScore(module, averageOf(scores))])
      }
    }
    const what = module === 'all' ? (selected ? periodLabel(selected.kind, selected.key) : kind) : SCORE_MODULES.find((m) => m.id === module)?.label
    downloadWorkbook(`Score history - ${what}.xlsx`, [{ name: 'Scores', rows }])
  }

  const header = (
    <PageHeader title="Score history" subtitle="Every module’s scores by week, month and year, kept for review" icon={<History className="h-5 w-5" />}>
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
          <Select value={module} onValueChange={(v) => setModule(v as ScoreModule | 'all')}>
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

    /* A coordinator: their own modules, period by period. */
    if (!canManageTeam) {
      const me = user?.id ?? ''
      return (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Module</th>
                {periods.map((p) => (
                  <th key={p.id} className="whitespace-nowrap px-2 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      {p.lockedAt ? <Lock className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                      {periodLabel(p.kind, p.key, true)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCORE_MODULES.map((m) => (
                <tr key={m.id} className="border-t border-border/50">
                  <td className="sticky left-0 bg-background/95 px-3 py-2 font-medium" title={m.hint}>
                    {m.label}
                  </td>
                  {periods.map((p) => {
                    const e = entryOf(p, me, m.id)
                    return (
                      <td key={p.id} className={cn('px-2 py-2 text-right tabular-nums', e ? toneOf(m.id, e.score) : 'text-muted-foreground')} title={e ? detailText(e, kind) : 'Nothing to score'}>
                        {cellText(e, kind)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )
    }

    /* The team leader and the administrator: all modules for one period. */
    if (module === 'all' && selected) {
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
            <table className="w-full min-w-max text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Coordinator</th>
                  {SCORE_MODULES.map((m) => (
                    <th key={m.id} className="px-3 py-2 text-right font-medium" title={m.hint}>
                      {m.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id} className="border-t border-border/50">
                    <td className="px-3 py-2 font-medium">{person.name}</td>
                    {SCORE_MODULES.map((m) => {
                      const e = entryOf(selected, person.id, m.id)
                      return (
                        <td key={m.id} className={cn('px-2 py-2 text-right tabular-nums', e ? toneOf(m.id, e.score) : 'text-muted-foreground')} title={e ? detailText(e, kind) : 'Nothing to score'}>
                          {cellText(e, kind)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Team average</td>
                  {SCORE_MODULES.map((m) => {
                    const avg = averageOf(selected.entries.filter((e) => e.module === m.id).map((e) => e.score))
                    return (
                      <td key={m.id} className={cn('px-3 py-2 text-right tabular-nums', toneOf(m.id, avg))}>
                        {m.id === 'service' && kind === 'week' ? '—' : formatScore(m.id, avg)}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Point at a score to see the figures behind it.</p>
        </GlassCard>
      )
    }

    /* One module, period by period. */
    const m = SCORE_MODULES.find((x) => x.id === module)!
    return (
      <GlassCard className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{m.hint}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-muted/90 px-3 py-2 text-left font-medium">Coordinator</th>
                {periods.map((p) => (
                  <th key={p.id} className="whitespace-nowrap px-2 py-2 text-right font-medium" title={p.lockedAt ? `Locked ${formatDate(p.lockedAt.slice(0, 10))}` : 'Live'}>
                    <span className="inline-flex items-center gap-1">
                      {p.lockedAt ? <Lock className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                      {periodLabel(p.kind, p.key, true)}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Average</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const avg = averageOf(periods.map((p) => entryOf(p, person.id, m.id)?.score))
                return (
                  <tr key={person.id} className="border-t border-border/50">
                    <td className="sticky left-0 bg-background/95 px-3 py-2 font-medium">{person.name}</td>
                    {periods.map((p) => {
                      const e = entryOf(p, person.id, m.id)
                      return (
                        <td key={p.id} className={cn('px-2 py-2 text-right tabular-nums', e ? toneOf(m.id, e.score) : 'text-muted-foreground')} title={e ? detailText(e, kind) : 'Nothing to score'}>
                          {cellText(e, kind)}
                        </td>
                      )
                    })}
                    <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', toneOf(m.id, avg))}>{m.id === 'service' && kind === 'week' ? '—' : formatScore(m.id, avg)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    )
  })()

  return (
    <div className="space-y-6">
      {header}
      {controls}
      {body}
    </div>
  )
}
