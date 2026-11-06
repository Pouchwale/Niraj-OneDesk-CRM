/**
 * Admin Panel → Robi days off: the administrator switches Robi's daily tasks
 * off for everyone on a chosen day (a festival, a stock-taking day) and back
 * on. That day nobody gets a plan or proof checks, and the scores show N/A.
 * A plan already made that day is set aside and its open tasks come forward,
 * exactly as for a coordinator on leave.
 */

import { useState, useSyncExternalStore } from 'react'
import { Bot, CalendarOff, Power } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { whenSaved } from '@/lib/shared-data'
import { cn, formatDate, todayISO } from '@/lib/utils'

const dayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })

export function RobiOffDaysCard({ userId }: { userId: string }) {
  const days = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.robiOffDays)
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const upcoming = sorted.filter((d) => d.date >= today)
  const past = sorted.filter((d) => d.date < today).reverse().slice(0, 10)
  const chosenIsOff = days.some((d) => d.date === date)

  const turnOff = async () => {
    if (!date) return
    setBusy(true)
    try {
      demoCompanyStore.setRobiOffDay({ date, by: userId, at: new Date().toISOString(), note: note.trim() || null })
      await whenSaved()
      setNote('')
      toast.success(`Robi is off on ${formatDate(date)}.`, { description: 'No tasks for anyone that day; scores show N/A.' })
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const turnOn = async (day: string) => {
    setBusy(true)
    try {
      demoCompanyStore.clearRobiOffDay(day)
      await whenSaved()
      toast.success(`Robi is back on for ${formatDate(day)}.`)
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const row = (d: (typeof days)[number]) => (
    <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {formatDate(d.date)} · {dayName(d.date)}
          {d.date === today && <Badge variant="outline" className="border-rose-500/40 text-rose-600">Today</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          {d.note ? `${d.note} · ` : ''}set by {getCoordinatorDisplayName(d.by)}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => turnOn(d.date)} disabled={busy} data-testid={`robi-on-${d.date}`}>
        <Power className="mr-2 h-4 w-4" /> Turn Robi back on
      </Button>
    </li>
  )

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="robi-off-days">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <Bot className="h-4 w-4" /> Robi days off
        </h3>
        <p className="text-sm text-muted-foreground">
          On a day off Robi gives no tasks and no proof checks to any coordinator, and the day shows N/A in the scores. If plans were
          already made that day, their open tasks come back on the next working day.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="robi-off-date">Day</Label>
          <Input id="robi-off-date" type="date" className="h-9 w-[170px]" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label htmlFor="robi-off-note">Reason (optional)</Label>
          <Input id="robi-off-note" className="h-9" placeholder="e.g. Diwali holiday, stock taking" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {chosenIsOff ? (
          <Button variant="outline" onClick={() => turnOn(date)} disabled={busy || !date}>
            <Power className="mr-2 h-4 w-4" /> Turn Robi back on
          </Button>
        ) : (
          <Button className={cn('bg-rose-600 text-white hover:bg-rose-700')} onClick={turnOff} disabled={busy || !date} data-testid="robi-off-save">
            <CalendarOff className="mr-2 h-4 w-4" /> Turn Robi off for this day
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">Coming up</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No days off planned. Robi gives tasks every working day.</p>
        ) : (
          <ul className="space-y-2">{upcoming.map(row)}</ul>
        )}
      </div>
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Earlier days off</p>
          <ul className="space-y-2">{past.map(row)}</ul>
        </div>
      )}
    </GlassCard>
  )
}
