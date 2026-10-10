/**
 * Overview → Attendance: the team leader or the administrator marks who is
 * on leave or on a half day, for today or ahead. Robi plans accordingly:
 * nothing on leave, four fresh tasks on a half day (see assistant/attendance.ts).
 */

import { useState, useSyncExternalStore } from 'react'
import { CalendarCheck } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import type { AttendanceEntry } from '@/lib/types'
import { cn, formatDate, todayISO } from '@/lib/utils'

type Choice = 'present' | AttendanceEntry['status']

const CHOICES: { id: Choice; label: string; on: string }[] = [
  { id: 'present', label: 'Present', on: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  { id: 'half_day', label: 'Half day', on: 'bg-amber-500 text-white hover:bg-amber-500' },
  { id: 'leave', label: 'Leave', on: 'bg-rose-600 text-white hover:bg-rose-600' },
]

const EFFECT: Record<Choice, string> = {
  present: '8 tasks',
  half_day: '4 tasks, 1 proof check',
  leave: 'No tasks; open work moves to the next working day',
}

export function AttendanceView({ coordinators }: { coordinators: { id: string; full_name: string }[] }) {
  const { user } = useAuth()
  const entries = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.attendance)
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState<string | null>(null)

  const statusOf = (userId: string): Choice => entries.find((a) => a.userId === userId && a.date === date)?.status ?? 'present'
  const upcoming = entries
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.userId.localeCompare(b.userId))

  const choose = async (userId: string, choice: Choice) => {
    if (!user || statusOf(userId) === choice) return
    setBusy(userId)
    try {
      if (choice === 'present') await demoCompanyStore.clearAttendance(userId, date)
      else await demoCompanyStore.setAttendance({ userId, date, status: choice, by: user.id, at: new Date().toISOString() })
      toast.success(`${getCoordinatorDisplayName(userId)}: ${CHOICES.find((c) => c.id === choice)!.label} on ${formatDate(date)}.`)
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="attendance">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <CalendarCheck className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Attendance</h3>
            <p className="text-xs text-muted-foreground">
              Mark who is on leave or on a half day, today or ahead. Robi gives no tasks on leave and 4 instead of 8 on a
              half day. A leave or half day doesn't count against the score.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Date</span>
          <input
            id="attendance-date"
            type="date"
            value={date}
            min={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Coordinator</th>
              <th className="px-4 py-2.5 font-medium">{date === today ? 'Today' : formatDate(date)}</th>
              <th className="px-4 py-2.5 font-medium">Robi gives</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {coordinators.map((c) => {
              const current = statusOf(c.id)
              return (
                <tr key={c.id} data-testid="attendance-row">
                  <td className="px-4 py-2.5 font-medium">{c.full_name}</td>
                  <td className="px-4 py-2.5">
                    <div className="inline-flex gap-1 rounded-lg border border-border p-0.5">
                      {CHOICES.map((choice) => (
                        <Button
                          key={choice.id}
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          aria-pressed={current === choice.id}
                          className={cn('h-7 px-2.5 text-xs', current === choice.id && choice.on)}
                          onClick={() => choose(c.id, choice.id)}
                        >
                          {choice.label}
                        </Button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{EFFECT[current]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {upcoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase text-muted-foreground">Marked from today on</p>
          <ul className="space-y-1 text-sm">
            {upcoming.map((a) => (
              <li key={`${a.userId}-${a.date}`}>
                <span className="tabular-nums">{formatDate(a.date)}</span> · {getCoordinatorDisplayName(a.userId)} ·{' '}
                <span className={a.status === 'leave' ? 'text-rose-600' : 'text-amber-600'}>
                  {a.status === 'leave' ? 'Leave' : 'Half day'}
                </span>
                <span className="text-xs text-muted-foreground"> (by {getCoordinatorDisplayName(a.by)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  )
}
