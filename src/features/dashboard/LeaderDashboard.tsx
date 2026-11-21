/**
 * The team leader's and administrator's Dashboard (21 Nov 2026, the user's
 * brief; leader-dashboard.ts does the arithmetic): a Saturday-to-Friday week
 * with ‹ › to go back, and only overall figures: team and team leader scores,
 * money received, quotations, and Ready for Dispatch waiting 30+ days.
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Crown, FileCheck2, FileText, Gauge, IndianRupee, Layers, Loader2, Package, Tag, Wallet, WrapText } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { Button } from '@/components/ui/button'
import { getAllCoordinators } from '@/features/auth/AuthContext'
import { useModuleAccess } from '@/features/auth/module-access'
import { formatFinal } from '@/features/score-history/format'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { openRfdRows } from '@/lib/rfd-marks'
import { markSwitchedOff, periodLabel, weekOf, type PeriodScores, type ScoreGroupMap } from '@/lib/score-history'
import { getScoreHistory } from '@/lib/score-history-api'
import { getSavedDay, listSavedDays } from '@/lib/snapshots-api'
import { addDaysISO, formatCurrency, todayISO } from '@/lib/utils'
import type { OverduePayment } from '@/lib/types'
import { scoreModulesOff } from '../../../shared/module-access'
import type { OverdueSnapshotMeta } from '../../../shared/snapshots'
import { leaderScores, moneyReceived, quotationsOfWeek, rfdWaiting, type MoneyReceived, type NewRepeat } from './leader-dashboard'

const WEEKS_BACK = 12

const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const scoreColor = (score: number | null) => (score === null ? 'blue' : score >= 80 ? 'emerald' : score >= 50 ? 'amber' : 'rose') as 'blue' | 'emerald' | 'amber' | 'rose'
const rupees = (v: number) => formatCurrency(v)
const countSplit = (s: NewRepeat) => `New ${s.new} · Repeat ${s.repeat}${s.unmarked ? ` · Not marked ${s.unmarked}` : ''}`
const valueSplit = (s: NewRepeat) => `New ${rupees(s.new)} · Repeat ${rupees(s.repeat)}${s.unmarked ? ` · Not marked ${rupees(s.unmarked)}` : ''}`
const lines = (n: number) => `${n} line${n === 1 ? '' : 's'}`

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  )
}

type Received = { value: MoneyReceived | null; note: string | null; loading: boolean }

export function LeaderDashboard() {
  const today = todayISO()
  const thisWeek = weekOf(today)
  const [weekStart, setWeekStart] = useState(thisWeek)
  const access = useModuleAccess()
  const quotations = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.quotations)
  const rfdSheet = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.rfdRows)
  const rfdMarks = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.rfdMarks)
  const overdueNow = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.overduePayments)
  const people = useMemo(() => getAllCoordinators().map((c) => ({ id: c.id, module: c.module })), [])

  const [weeks, setWeeks] = useState<PeriodScores[] | null>(null)
  const [scoreGroups, setScoreGroups] = useState<ScoreGroupMap | undefined>()
  const [days, setDays] = useState<OverdueSnapshotMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([getScoreHistory('week', WEEKS_BACK + 2), listSavedDays()])
      .then(([w, d]) => {
        if (!live) return
        setWeeks(w.periods)
        setScoreGroups(w.scoreGroups)
        setDays(d.days)
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : 'Could not load the scores.'))
    return () => {
      live = false
    }
  }, [])

  // A week's two Overdue books: its Saturday's saved day, and the next day saved after it ends (this week: today's book).
  const booksOf = useMemo(
    () => (week: string) => {
      const end = addDaysISO(week, 6)
      const start = days?.filter((d) => localDay(d.savedAt) === week).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null
      const after = !days || end >= today ? null : (days.filter((d) => localDay(d.savedAt) > end).sort((a, b) => a.savedAt.localeCompare(b.savedAt))[0] ?? null)
      return { start, after, running: end >= today }
    },
    [days, today]
  )
  const previousWeek = addDaysISO(weekStart, -7)
  const [books, setBooks] = useState<Record<string, OverduePayment[]>>({})
  useEffect(() => {
    for (const week of [weekStart, previousWeek]) {
      const { start, after } = booksOf(week)
      for (const d of [start, after]) {
        if (!d || books[d.id]) continue
        void getSavedDay(d.id).then((day) => setBooks((held) => ({ ...held, [d.id]: day.rows as unknown as OverduePayment[] })))
      }
    }
  }, [weekStart, previousWeek, booksOf, books])

  const receivedIn = (week: string): Received => {
    const { start, after, running } = booksOf(week)
    if (!days) return { value: null, note: null, loading: true }
    if (!start) return { value: null, note: 'No Overdue day was saved on that Saturday', loading: false }
    if (!running && !after) return { value: null, note: 'No day saved after that week yet', loading: false }
    const from = books[start.id]
    const to = running ? overdueNow : books[after!.id]
    if (!from || !to) return { value: null, note: null, loading: true }
    return { value: moneyReceived(from, to), note: null, loading: false }
  }
  const received = useMemo(() => receivedIn(weekStart), [weekStart, booksOf, books, overdueNow, days]) // eslint-disable-line react-hooks/exhaustive-deps
  const receivedBefore = useMemo(() => receivedIn(previousWeek), [previousWeek, booksOf, books, overdueNow, days]) // eslint-disable-line react-hooks/exhaustive-deps

  const shownWeeks = useMemo(
    () => (weeks ? markSwitchedOff(weeks, (id) => scoreModulesOff(access, id), access.map((a) => a.coordinatorId)) : null),
    [weeks, access]
  )
  const scores = useMemo(
    () => leaderScores(shownWeeks?.find((p) => p.key === weekStart) ?? null, people, scoreGroups),
    [shownWeeks, weekStart, people, scoreGroups]
  )
  const quotes = useMemo(() => quotationsOfWeek(quotations, weekStart, addDaysISO(weekStart, 6)), [quotations, weekStart])
  const rfd = useMemo(() => rfdWaiting(openRfdRows(rfdSheet, rfdMarks)), [rfdSheet, rfdMarks])

  if (error) return <GlassCard className="p-6 text-sm text-rose-600">{error}</GlassCard>
  if (!shownWeeks) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const firstWeek = addDaysISO(thisWeek, -7 * WEEKS_BACK)
  const isThisWeek = weekStart === thisWeek
  const label = `${periodLabel('week', weekStart)}${isThisWeek ? ' (this week)' : ''}`
  const moneyValue = (pick: (m: MoneyReceived) => number) => (received.value ? rupees(pick(received.value)) : received.loading ? '…' : '—')
  const moneyHint = (pick: (m: MoneyReceived) => number) => {
    if (received.note) return received.note
    const before = receivedBefore.value ? rupees(pick(receivedBefore.value)) : receivedBefore.loading ? '…' : '—'
    return `${isThisWeek ? 'So far this week · ' : ''}Week before: ${before}`
  }

  return (
    <div className="space-y-6" data-testid="leader-dashboard">
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

      <Section title="Scores" note="Minus scoring: 0 is full marks">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="leader-scores">
          {scores.teams.map((t) => (
            <KpiCard
              key={t.team}
              title={`${t.team} team`}
              value={formatFinal(t.final)}
              hint={`Payments ${formatFinal(t.payments)} · Operations ${formatFinal(t.operations)}`}
              icon={Gauge}
              color={scoreColor(t.final)}
              href="/score-history"
            />
          ))}
          <KpiCard
            title="Team leader score"
            value={formatFinal(scores.leader)}
            hint="Average of Pouchwale and GP3"
            icon={Crown}
            color={scoreColor(scores.leader)}
            href="/score-history"
            className="border-primary/40 bg-primary/5"
          />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <Section title="Payment received">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="leader-collection">
              <KpiCard title="31 to 120 days" value={moneyValue((m) => m.days31to120)} hint={moneyHint((m) => m.days31to120)} icon={Wallet} color="emerald" href="/overdue" valueClassName="lg:text-2xl" />
              <KpiCard title="121+ days" value={moneyValue((m) => m.days121Plus)} hint={moneyHint((m) => m.days121Plus)} icon={Wallet} color="emerald" href="/overdue" valueClassName="lg:text-2xl" />
            </div>
          </Section>
        </div>
        <div className="xl:col-span-3">
          <Section title="Quotations">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="leader-quotations">
              <KpiCard title="Total given" value={String(quotes.given.total)} hint={countSplit(quotes.given)} icon={FileText} color="blue" href="/quotations" valueClassName="lg:text-2xl" />
              <KpiCard title="Converted" value={String(quotes.converted.total)} hint={countSplit(quotes.converted)} icon={FileCheck2} color="emerald" href="/quotations" valueClassName="lg:text-2xl" />
              <KpiCard
                title="Converted value"
                valueClassName="lg:text-2xl"
                value={rupees(quotes.value.total)}
                hint={`${valueSplit(quotes.value)}${quotes.convertedWithoutValue ? ` · ${quotes.convertedWithoutValue} with no value entered` : ''}`}
                icon={IndianRupee}
                color="violet"
                href="/quotations"
              />
            </div>
          </Section>
        </div>
      </div>

      <Section title="Ready for Dispatch: 30+ days" note="Full RFD value, as of the last RFD sync">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="leader-rfd">
          <KpiCard title="Pouches" value={rupees(rfd.pouches.value)} hint={lines(rfd.pouches.lines)} icon={Package} color="amber" href="/rfd" />
          <KpiCard title="Labels" value={rupees(rfd.labels.value)} hint={lines(rfd.labels.lines)} icon={Tag} color="amber" href="/rfd" />
          <KpiCard title="Sleeves" value={rupees(rfd.sleeves.value)} hint={lines(rfd.sleeves.lines)} icon={WrapText} color="amber" href="/rfd" />
          <KpiCard title="All combined" value={rupees(rfd.all.value)} hint={lines(rfd.all.lines)} icon={Layers} color="rose" href="/rfd" className="border-primary/40 bg-primary/5" />
        </div>
      </Section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Team score: the average of its Payments and Operations scores. Team leader score: the average of the two teams. Payment received: regular customers
        whose balance fell since the week&apos;s saved Saturday, taken from their oldest dues first. Quotations: given in the week; converted and value are those
        closed in the week. Repeat means an existing customer.
      </p>
    </div>
  )
}
