/**
 * The team leader's and administrator's dashboard (16 Nov 2026, the user's
 * picks; team-dashboard.ts does the arithmetic): a Saturday-to-Friday week,
 * this one by default with ‹ › to go back, headline cards for the team, then
 * one line per coordinator: final score (change from the week before, the
 * month's, the module costing most), overdue collected since the Saturday,
 * client commitments, quotations, Ready for Dispatch waiting, billing issues.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileText, Gauge, HandCoins, Loader2, PackageCheck, ReceiptText, Wallet } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { Button } from '@/components/ui/button'
import { getAllCoordinators } from '@/features/auth/AuthContext'
import { useModuleAccess } from '@/features/auth/module-access'
import { formatFinal } from '@/features/score-history/format'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { getFollowupCommitments, type Commitment } from '@/lib/followups-api'
import { markSwitchedOff, periodLabel, weekOf, type PeriodScores } from '@/lib/score-history'
import { getScoreHistory } from '@/lib/score-history-api'
import { getSavedDay, listSavedDays } from '@/lib/snapshots-api'
import { cn, formatCurrency, todayISO } from '@/lib/utils'
import type { OverduePayment } from '@/lib/types'
import { modulesOff, scoreModulesOff } from '../../../shared/module-access'
import type { OverdueSnapshotMeta } from '../../../shared/snapshots'
import { addDaysISO, teamTotals, teamWeek, type TeamWeekRow } from './team-dashboard'

const WEEKS_BACK = 12
type Book = Pick<OverduePayment, 'bp_code' | 'balance_due' | 'assigned_coordinator_id'>[]

const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const tone = (score: number | null) =>
  score === null ? 'text-muted-foreground' : score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
const money = (v: number) => formatCurrency(v, true)
const NA = <span className="text-muted-foreground">N/A</span>

export function TeamDashboard() {
  const today = todayISO()
  const thisWeek = weekOf(today)
  const [weekStart, setWeekStart] = useState(thisWeek)
  const access = useModuleAccess()
  const quotations = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.quotations)
  const rfdRows = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.rfdRows)
  const billingIssues = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.billingIssues)
  const overdueNow = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.overduePayments)
  const coordinators = useMemo(() => getAllCoordinators().map((c) => ({ id: c.id, name: c.full_name ?? c.id })).sort((a, b) => a.name.localeCompare(b.name)), [])

  // Scores (weeks and months), the saved Overdue days, and the open client commitments.
  const [weeks, setWeeks] = useState<PeriodScores[] | null>(null)
  const [months, setMonths] = useState<PeriodScores[] | null>(null)
  const [days, setDays] = useState<OverdueSnapshotMeta[] | null>(null)
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([getScoreHistory('week', WEEKS_BACK + 2), getScoreHistory('month', 4), listSavedDays()])
      .then(([w, m, d]) => {
        if (!live) return
        setWeeks(w.periods)
        setMonths(m.periods)
        setDays(d.days)
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : 'Could not load the scores.'))
    return () => {
      live = false
    }
  }, [])
  const version = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.followups)
  useEffect(() => {
    let live = true
    void getFollowupCommitments().then((c) => live && setCommitments(c))
    return () => {
      live = false
    }
  }, [version])

  // The Overdue book on the week's Saturday, and at its end (the next Saturday's day; this week: today's book).
  const [books, setBooks] = useState<Record<string, Book>>({})
  const end = addDaysISO(weekStart, 6)
  const startDay = useMemo(() => days?.filter((d) => localDay(d.savedAt) === weekStart).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null, [days, weekStart])
  const endDay = useMemo(() => {
    if (!days || end >= today) return null
    return days.filter((d) => localDay(d.savedAt) > end).sort((a, b) => a.savedAt.localeCompare(b.savedAt))[0] ?? null
  }, [days, end, today])
  useEffect(() => {
    for (const d of [startDay, endDay]) {
      if (!d || books[d.id]) continue
      void getSavedDay(d.id).then((day) => setBooks((b) => ({ ...b, [d.id]: day.rows as unknown as Book })))
    }
  }, [startDay, endDay, books])

  const shown = (list: PeriodScores[] | null) => (list ? markSwitchedOff(list, (id) => scoreModulesOff(access, id), access.map((a) => a.coordinatorId)) : null)
  const weekPeriods = useMemo(() => shown(weeks), [weeks, access]) // eslint-disable-line react-hooks/exhaustive-deps
  const monthPeriods = useMemo(() => shown(months), [months, access]) // eslint-disable-line react-hooks/exhaustive-deps
  const atStart = startDay ? books[startDay.id] ?? null : null
  const atEnd = end >= today ? overdueNow : endDay ? books[endDay.id] ?? null : null
  const loadingBooks = Boolean((startDay && !books[startDay.id]) || (endDay && !books[endDay.id]))

  const rows: TeamWeekRow[] = useMemo(
    () =>
      teamWeek({
        weekStart,
        today,
        coordinators,
        week: weekPeriods?.find((p) => p.key === weekStart) ?? null,
        previousWeek: weekPeriods?.find((p) => p.key === addDaysISO(weekStart, -7)) ?? null,
        month: monthPeriods?.find((p) => p.key === weekStart.slice(0, 7)) ?? null,
        overdueAtStart: atStart,
        overdueAtEnd: atEnd ?? [],
        commitments,
        quotations,
        rfdRows,
        billingIssues,
        modulesOff: (id) => modulesOff(access, id),
      }),
    [weekStart, today, coordinators, weekPeriods, monthPeriods, atStart, atEnd, commitments, quotations, rfdRows, billingIssues, access]
  )
  const t = teamTotals(rows)
  const collectedNote = !startDay ? 'No Overdue day was saved on that Saturday' : !atEnd ? 'No day saved after the week yet' : null

  const firstWeek = addDaysISO(thisWeek, -7 * WEEKS_BACK)
  const label = `${periodLabel('week', weekStart)}${weekStart === thisWeek ? ' (this week)' : ''}`

  if (error) return <GlassCard className="p-6 text-sm text-rose-600">{error}</GlassCard>
  if (!weekPeriods) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5" data-testid="team-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">Team performance</h2>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Previous week" disabled={weekStart <= firstWeek} onClick={() => setWeekStart(addDaysISO(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[210px] text-center text-sm font-medium" data-testid="team-week">
            {label}
          </span>
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Next week" disabled={weekStart >= thisWeek} onClick={() => setWeekStart(addDaysISO(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Team final score"
          value={formatFinal(t.final)}
          hint={`Month ${formatFinal(t.monthFinal)}${t.change !== null ? ` · ${t.change >= 0 ? '+' : ''}${t.change} vs last week` : ''}`}
          icon={Gauge}
          color={t.final === null ? 'blue' : t.final >= 80 ? 'emerald' : t.final >= 50 ? 'amber' : 'rose'}
          href="/score-history"
        />
        <KpiCard
          title="Collected in the week"
          value={t.collected === null ? '—' : money(t.collected)}
          hint={collectedNote ?? 'Overdue that came down since Saturday'}
          icon={Wallet}
          color="emerald"
          href="/overdue"
        />
        <KpiCard title="Promises due in the week" value={money(t.dueThisWeek)} hint={`${t.dueCount} promise${t.dueCount === 1 ? '' : 's'} · ${money(t.open)} promised in all`} icon={HandCoins} color="violet" href="/companies" />
        <KpiCard title="Promises missed" value={money(t.missed)} hint={`${t.missedCount} past the date given, still open`} icon={HandCoins} color={t.missedCount ? 'rose' : 'emerald'} href="/companies" />
        <KpiCard
          title="Quotations in the week"
          value={`${t.quotationsMade} made`}
          hint={`${t.quotationsClosed} closed · ${money(t.valueWon)} won`}
          icon={FileText}
          color="blue"
          href="/quotations"
        />
        <KpiCard
          title="Ready for Dispatch"
          value={money(t.rfdPending)}
          hint={`${t.rfdRows} lines waiting (now) · ${t.billingIssues} billing issue${t.billingIssues === 1 ? '' : 's'} in the week`}
          icon={PackageCheck}
          color="amber"
          href="/rfd"
        />
      </div>

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm" data-testid="team-table">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Coordinator</th>
              <th className="px-3 py-2.5 text-right font-medium">Final score</th>
              <th className="px-3 py-2.5 text-right font-medium">vs last week</th>
              <th className="px-3 py-2.5 text-right font-medium">Month</th>
              <th className="px-3 py-2.5 text-left font-medium">Losing most on</th>
              <th className="px-3 py-2.5 text-right font-medium">Collected{loadingBooks && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</th>
              <th className="px-3 py-2.5 text-right font-medium">Promises due / missed</th>
              <th className="px-3 py-2.5 text-right font-medium">Quotations</th>
              <th className="px-3 py-2.5 text-right font-medium">RFD waiting</th>
              <th className="px-3 py-2.5 text-right font-medium">Billing issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((r) => (
              <tr key={r.coordinatorId} className="hover:bg-muted/30" data-testid="team-row">
                <td className="whitespace-nowrap px-4 py-2.5 font-medium">{r.name}</td>
                <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', tone(r.final))}>{formatFinal(r.final)}</td>
                <td className={cn('px-3 py-2.5 text-right tabular-nums', r.change === null ? 'text-muted-foreground' : r.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                  {r.change === null ? '—' : `${r.change >= 0 ? '▲ +' : '▼ '}${r.change}`}
                </td>
                <td className={cn('px-3 py-2.5 text-right tabular-nums', tone(r.monthFinal))}>{formatFinal(r.monthFinal)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-left">
                  {r.weakest ? (
                    <span title={`${r.weakest.lost} points of the final score lost here`}>
                      {r.weakest.label} <span className="text-xs text-rose-600 dark:text-rose-400">-{r.weakest.lost}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.collected === null ? (collectedNote ? <span className="text-muted-foreground">—</span> : NA) : money(r.collected)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {r.commitments ? (
                    <span title={`${r.commitments.dueCount} due this week · ${r.commitments.missedCount} missed · ${money(r.commitments.open)} open in all`}>
                      {money(r.commitments.dueThisWeek)} <span className="text-muted-foreground">/</span>{' '}
                      <span className={r.commitments.missed > 0 ? 'text-rose-600 dark:text-rose-400' : ''}>{money(r.commitments.missed)}</span>
                    </span>
                  ) : (
                    NA
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {r.quotations ? (
                    <span title={`${r.quotations.made} made · ${r.quotations.closed} closed · ${r.quotations.lost} lost${r.quotations.winRate !== null ? ` · ${r.quotations.winRate}% won` : ''}`}>
                      {r.quotations.made} made · {r.quotations.closed} won{r.quotations.valueWon ? ` · ${money(r.quotations.valueWon)}` : ''}
                    </span>
                  ) : (
                    NA
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{r.rfd ? `${money(r.rfd.pending)} · ${r.rfd.rows}` : NA}</td>
                <td className={cn('px-3 py-2.5 text-right tabular-nums', r.billingIssues ? 'text-rose-600 dark:text-rose-400' : '')}>{r.billingIssues === null ? NA : r.billingIssues}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
      <p className="text-xs text-muted-foreground">
        Scores in minus scoring (0 is full marks). Collected: how much each coordinator's overdue came down since the week's Saturday (saved day), new
        overdue not subtracted. Promises: due in the week / already past their date and still open. Quotations: made in the week, won (closed) in the
        week. RFD: lines and value waiting now. N/A: the module is switched off for that coordinator.
      </p>
      <p className="text-xs text-muted-foreground">
        <Link className="underline" to="/score-history">Final score</Link> · <Link className="underline" to="/overdue">Overdue Payments</Link> ·{' '}
        <Link className="underline" to="/quotations">Quotations</Link> · <Link className="underline" to="/rfd">Ready for Dispatch</Link> ·{' '}
        <Link className="underline" to="/billing-issues">Billing Issues</Link>
      </p>
    </div>
  )
}
