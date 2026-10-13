/**
 * Overview → Leaderboard: the coordinators ranked for a week by their score
 * (Robi's tasks, extra work counted up to 0%), with growth against the week
 * before and the work behind it. Live: it moves as follow-ups are logged.
 */

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { demoCompanyStore } from '@/lib/demo-companies'
import { addDaysISO, cn, formatCurrency, formatDate, todayISO } from '@/lib/utils'
import { onLeave, useScores } from './ScoresView'
import { scoreLabel, scoreTone, weekAverage, weekDays, weekStart, type DayScore } from './scores'

const MEDAL = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-900', 'bg-orange-400 text-orange-950']

export function Leaderboard({ coordinators }: { coordinators: { id: string; full_name: string }[] }) {
  const today = todayISO()
  const thisMonday = weekStart(today)
  const [monday, setMonday] = useState(thisMonday)
  const { scores, extra } = useScores(coordinators.map((c) => c.id))
  const days = weekDays(monday)
  const lastWeek = weekDays(addDaysISO(monday, -7))
  const followups = demoCompanyStore.getAllFollowups()

  const board = coordinators
    .map((c) => {
      const week = days.map((d) => scores.get(`${c.id}|${d}`))
      const scored = week.filter((s): s is DayScore => !!s)
      const score = weekAverage(week)
      const before = weekAverage(lastWeek.map((d) => scores.get(`${c.id}|${d}`)))
      const logged = followups.filter((f) => {
        const d = String(f.followup_date || f.created_at).slice(0, 10)
        return f.coordinator_id === c.id && d >= days[0] && d <= days[5]
      })
      const promises = logged.filter((f) => f.committed_date)
      return {
        id: c.id,
        name: c.full_name,
        score,
        growth: score !== null && before !== null ? score - before : null,
        done: scored.reduce((n, s) => n + s.done, 0),
        given: scored.reduce((n, s) => n + s.given, 0),
        extra: days.reduce((n, d) => n + (extra.get(`${c.id}|${d}`) ?? 0), 0),
        followups: logged.length,
        promises: promises.length,
        promised: promises.reduce((n, f) => n + (f.committed_amount ?? 0), 0),
        leave: days.filter((d) => onLeave(c.id, d)).length,
      }
    })
    .filter((r) => r.score !== null || r.followups > 0)
    // Best score first; then more tasks done, more extra work, more follow-ups.
    .sort((a, b) => (b.score ?? -1000) - (a.score ?? -1000) || b.done - a.done || b.extra - a.extra || b.followups - a.followups)

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="leaderboard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-400/15 p-2 text-amber-600">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Leaderboard</h3>
            <p className="text-xs text-muted-foreground">
              Ranked by the week score (Robi tasks, with extra work counted up to 0%), live as follow-ups come in. Growth
              is against the week before.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonday(addDaysISO(monday, -7))} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[170px] text-center text-sm font-medium tabular-nums">
            {monday === thisMonday ? 'This week' : `${formatDate(days[0])} – ${formatDate(days[5])}`}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonday(addDaysISO(monday, 7))} disabled={monday >= thisMonday} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {board.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No plans or follow-ups this week.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/50">
          <table className="w-full text-left text-sm" data-testid="leaderboard-table">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Rank</th>
                <th className="px-3 py-3 font-medium">Coordinator</th>
                <th className="px-3 py-3 text-center font-medium">Week score</th>
                <th className="px-3 py-3 text-center font-medium">Growth</th>
                <th className="px-3 py-3 text-right font-medium">Robi tasks</th>
                <th className="px-3 py-3 text-right font-medium">Extra</th>
                <th className="px-3 py-3 text-right font-medium">Follow-ups</th>
                <th className="px-3 py-3 text-right font-medium">Promises</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {board.map((r, i) => {
                const podium = i < 3 && r.score !== null
                return (
                  <tr key={r.id} className={cn(podium && 'bg-amber-400/[0.04]')} data-testid="leaderboard-row">
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                          podium ? MEDAL[i] : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium">
                      {r.name}
                      {r.leave > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({r.leave} leave)</span>}
                    </td>
                    <td className={cn('px-3 py-3 text-center text-base font-bold tabular-nums', scoreTone(r.score))}>{scoreLabel(r.score)}</td>
                    <td
                      className={cn(
                        'px-3 py-3 text-center text-xs font-semibold tabular-nums',
                        r.growth === null ? 'text-muted-foreground' : r.growth > 0 ? 'text-emerald-600' : r.growth < 0 ? 'text-rose-600' : 'text-muted-foreground'
                      )}
                    >
                      {r.growth === null ? '—' : r.growth > 0 ? `▲ ${r.growth} pts` : r.growth < 0 ? `▼ ${-r.growth} pts` : '= same'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.given ? `${r.done}/${r.given}` : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sky-600 dark:text-sky-400">{r.extra ? `+${r.extra}` : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.followups}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {r.promises ? (
                        <>
                          {r.promises} <span className="text-xs text-muted-foreground">· {formatCurrency(r.promised)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}
