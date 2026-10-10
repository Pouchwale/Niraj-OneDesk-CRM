/**
 * Coordinator scores: the team's week for the team leader and the
 * administrator (Overview → Scores), and a coordinator's own on their
 * Dashboard. See scores.ts for how a day is scored.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Target } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { addDaysISO, cn, formatDate, todayISO } from '@/lib/utils'
import { customerLookup, openAccountKeys } from './daily-plan'
import { planHistory } from './plan-history'
import { dailyScores, scoreLabel, scoreTone, weekAverage, weekDays, weekStart, type DayScore } from './scores'

/** Every coordinator's day scores, live from the shared records. */
function useScores(coordinatorIds: string[]): Map<string, DayScore> {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeToDemoStore(() => setVersion((v) => v + 1)), [])
  const key = coordinatorIds.join(',')
  return useMemo(() => {
    void version
    const companies = demoCompanyStore.getAllCompanies()
    const overdue = demoCompanyStore.getAllOverduePayments()
    const owed = openAccountKeys(companies, overdue)
    const mine = new Map(
      coordinatorIds.map((id) => [
        id,
        openAccountKeys(
          companies.filter((c) => c.assigned_coordinator_id === id),
          overdue.filter((p) => p.assigned_coordinator_id === id)
        ),
      ])
    )
    const plans = demoCompanyStore.getDailyPlans().filter((p) => mine.has(p.userId))
    const rows = planHistory(plans, demoCompanyStore.getAllFollowups(), todayISO(), owed, mine, customerLookup(companies, overdue), (u, d) =>
      demoCompanyStore.getAttendance(u, d)?.status ?? null
    )
    return dailyScores(rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, key])
}

const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })

/** On leave that day: shown as such and never scored (marked in Overview → Attendance). */
const onLeave = (userId: string, date: string) => demoCompanyStore.getAttendance(userId, date)?.status === 'leave'

function Cell({ s, today, leave }: { s?: DayScore; today: boolean; leave?: boolean }) {
  if (leave) return <span className="text-xs text-muted-foreground" title="On leave: not scored">Leave</span>
  if (!s) return <span className="text-muted-foreground">—</span>
  return (
    <span title={`${s.done} of ${s.given} tasks done${today ? ' so far today' : ''}`}>
      <span className={cn('font-semibold tabular-nums', scoreTone(s.score))}>{scoreLabel(s.score)}</span>
      <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
        {s.done}/{s.given}
      </span>
    </span>
  )
}

/** Overview → Scores: the team, Monday to Saturday, with the weekly average and an Excel download. */
export function WeeklyScores({ coordinators }: { coordinators: { id: string; full_name: string }[] }) {
  const today = todayISO()
  const [monday, setMonday] = useState(() => weekStart(today))
  const days = weekDays(monday)
  const scores = useScores(coordinators.map((c) => c.id))

  const table = coordinators.map((c) => {
    const week = days.map((d) => scores.get(`${c.id}|${d}`))
    return { id: c.id, name: c.full_name, week, average: weekAverage(week) }
  })
  const rows = table.filter((r) => r.week.some(Boolean))
  const teamAverage = weekAverage(rows.flatMap((r) => r.week))

  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    const header = ['Coordinator', ...days.map((d) => `${dayName(d)} ${d}`), 'Weekly average']
    const body = rows.map((r) => [
      r.name,
      ...r.week.map((s, i) => (onLeave(r.id, days[i]) ? 'Leave' : s ? `${s.score}% (${s.done}/${s.given})` : '—')),
      r.average === null ? '—' : `${r.average}%`,
    ])
    const raw = [
      ['Coordinator', 'Date', 'Done', 'Tasks given', 'Score %'],
      ...rows.flatMap((r) =>
        days.flatMap((d, i) => (r.week[i] ? [[r.name, d, r.week[i]!.done, r.week[i]!.given, r.week[i]!.score]] : []))
      ),
    ]
    downloadWorkbook(`Coordinator scores - week of ${monday}.xlsx`, [
      { name: 'Weekly scores', rows: [header, ...body, ['Team average', ...days.map(() => ''), teamAverage === null ? '—' : `${teamAverage}%`]] },
      { name: 'Daily detail', rows: raw },
    ])
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="weekly-scores">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Coordinator scores</h3>
            <p className="text-xs text-muted-foreground">
              Each day: tasks done ÷ tasks on Robi's list (8 fresh + any leftovers), shown as the gap from 100% —
              0% is every task done, -20% is 80% done. Monday to Saturday; days with no plan, and leave days
              marked in Attendance, show — or Leave and are left out of the average.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonday(addDaysISO(monday, -7))} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[170px] text-center text-sm font-medium tabular-nums">
            {formatDate(days[0])} – {formatDate(days[5])}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonday(addDaysISO(monday, 7))} disabled={monday >= weekStart(today)} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={download} disabled={rows.length === 0} data-testid="scores-download">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No plans this week.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/50">
          <table className="w-full text-left text-sm" data-testid="scores-table">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Coordinator</th>
                {days.map((d) => (
                  <th key={d} className={cn('px-3 py-3 text-center font-medium', d === today && 'text-primary')}>
                    {dayName(d)}
                    <div className="text-[10px] font-normal normal-case">{formatDate(d).replace(/ \d{4}$/, '')}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-medium">Week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{r.name}</td>
                  {r.week.map((s, i) => (
                    <td key={days[i]} className={cn('whitespace-nowrap px-3 py-3 text-center', days[i] === today && 'bg-primary/5')}>
                      <Cell s={s} today={days[i] === today} leave={onLeave(r.id, days[i])} />
                    </td>
                  ))}
                  <td className={cn('px-4 py-3 text-center text-base font-bold tabular-nums', scoreTone(r.average))}>{scoreLabel(r.average)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/50">
              <tr>
                <td className="px-4 py-3 font-semibold">Team average</td>
                <td colSpan={6} />
                <td className={cn('px-4 py-3 text-center text-base font-bold tabular-nums', scoreTone(teamAverage))}>{scoreLabel(teamAverage)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </GlassCard>
  )
}

/** A coordinator's own score on their Dashboard: today so far, this week, and each day. */
export function MyScoreCard({ userId }: { userId: string }) {
  const today = todayISO()
  const days = weekDays(weekStart(today))
  const scores = useScores([userId])
  const week = days.map((d) => scores.get(`${userId}|${d}`))
  const todayScore = scores.get(`${userId}|${today}`)
  const average = weekAverage(week)

  return (
    <GlassCard className="space-y-3 p-4 sm:p-5" data-testid="my-score">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">My score</h3>
        <span className="text-xs text-muted-foreground">0% means every task on Robi's list done</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">Today so far</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', scoreTone(todayScore?.score))}>{onLeave(userId, today) ? 'Leave' : scoreLabel(todayScore?.score)}</p>
          {todayScore && <p className="text-xs text-muted-foreground">{todayScore.done} of {todayScore.given} done</p>}
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">This week</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', scoreTone(average))}>{scoreLabel(average)}</p>
          <p className="text-xs text-muted-foreground">Mon–Sat average</p>
        </div>
        <div className="col-span-2 flex items-end justify-between gap-1 rounded-lg border border-border/60 p-3">
          {days.map((d, i) => (
            <div key={d} className={cn('flex-1 text-center', d === today && 'font-semibold')}>
              <p className="text-[11px] text-muted-foreground">{dayName(d)}</p>
              <p className={cn('text-sm tabular-nums', scoreTone(week[i]?.score))}>{onLeave(userId, d) ? 'Leave' : scoreLabel(week[i]?.score)}</p>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
