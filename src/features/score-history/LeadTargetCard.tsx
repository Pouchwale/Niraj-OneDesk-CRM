/**
 * Final score → Self Leads target (16 Nov 2026): how many new leads in a week
 * earn full marks, and the score for fewer (at least one). The administrator
 * sets them by dates like the final score ratio: a week uses the target in
 * force on its Saturday; dates no target covers use the nearest earlier one;
 * before any, 3 leads and 30%. A locked period keeps the scores it locked with.
 */

import { useState } from 'react'
import { Loader2, Target } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { DEFAULT_LEAD_TARGET, ratioEnd, ratioOn, type LeadTarget } from '@/lib/score-history'
import { deleteLeadTarget, saveLeadTarget } from '@/lib/score-history-api'
import { cn, formatDate } from '@/lib/utils'

const rule = (t: { full: number; partial: number }) =>
  `${t.full}+ new leads in a week 100% (0) · 1${t.full > 2 ? `–${t.full - 1}` : ''} ${t.partial}% (${t.partial - 100}) · none 0% (-100)`

export function LeadTargetCard({ targets, today, isAdmin, loaded, onSaved }: { targets: LeadTarget[]; today: string; isAdmin: boolean; loaded: boolean; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<LeadTarget | 'new' | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [full, setFull] = useState('')
  const [partial, setPartial] = useState('')
  const [saving, setSaving] = useState(false)
  if (!loaded) return null

  const inForce = ratioOn(targets, today)
  const start = (t: LeadTarget | 'new') => {
    const base = t === 'new' ? targets[targets.length - 1] ?? DEFAULT_LEAD_TARGET : t
    setFrom(t === 'new' ? today : t.from)
    setTo(t === 'new' ? '' : t.to ?? '')
    setFull(String(base.full))
    setPartial(String(base.partial))
    setEditing(t)
  }
  const fullN = Number(full)
  const partialN = Number(partial)
  const ok = Boolean(from) && (!to || to >= from) && Number.isInteger(fullN) && fullN >= 1 && fullN <= 100 && Number.isFinite(partialN) && partial.trim() !== '' && partialN >= 0 && partialN <= 100

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await saveLeadTarget({ from, to: to || null, full: fullN, partial: partialN }, editing === 'new' ? undefined : editing.id)
      toast.success('Self Leads target saved.', { description: 'Weeks and months from these dates that are still open use it; locked ones keep theirs.' })
      setEditing(null)
      await onSaved()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }
  const remove = async (t: LeadTarget) => {
    if (!window.confirm(`Remove the Self Leads target from ${formatDate(t.from)}? Open weeks in its dates go to the nearest earlier target (or 3 leads, 30%).`)) return
    try {
      await deleteLeadTarget(t.id)
      toast.success('Target removed.')
      await onSaved()
    } catch (err) {
      toast.error('Not removed.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }
  const datesOf = (t: LeadTarget) => {
    const end = ratioEnd(t, targets)
    return `${formatDate(t.from)} – ${end ? formatDate(end) : 'onward'}${!t.to && end ? ' (until the next target)' : ''}`
  }

  return (
    <GlassCard className="space-y-3 p-4" data-testid="lead-targets">
      <div className="flex flex-wrap items-center gap-3">
        <Target className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Self Leads target</p>
        <p className="text-xs text-muted-foreground">
          {targets.length ? 'A week uses the target in force on its Saturday; a month is the average of its weeks. Locked periods keep theirs.' : `Not set: ${rule(DEFAULT_LEAD_TARGET)}.`}
        </p>
        {isAdmin && !editing && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => start('new')} data-testid="lead-target-add">
            Set target
          </Button>
        )}
      </div>

      {targets.length > 0 && (
        <div className="divide-y divide-border/50 rounded-md border border-border/50">
          {[...targets].reverse().map((t) => (
            <div key={t.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm', inForce?.id === t.id && 'bg-primary/5')}>
              <span className="min-w-[230px] font-medium">
                {datesOf(t)}
                {inForce?.id === t.id && <Badge variant="outline" className="ml-2 font-normal">In force today</Badge>}
              </span>
              <span className="flex-1 text-muted-foreground">{rule(t)}</span>
              <span className="text-xs text-muted-foreground">
                Set by {getCoordinatorDisplayName(t.updatedBy)} on {formatDate(t.updatedAt.slice(0, 10))}
              </span>
              {isAdmin && !editing && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => start(t)}>
                    Change
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-rose-600" onClick={() => void remove(t)}>
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
              <Label htmlFor="lead-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="lead-from" type="date" className="h-9 w-[160px]" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-to" className="text-xs text-muted-foreground">To (empty = onward)</Label>
              <Input id="lead-to" type="date" className="h-9 w-[160px]" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-full" className="text-xs text-muted-foreground">New leads a week for 100%</Label>
              <Input id="lead-full" type="number" min={1} max={100} step={1} className="h-9 w-24 text-right" value={full} onChange={(e) => setFull(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-partial" className="text-xs text-muted-foreground">Score for fewer (at least 1)</Label>
              <div className="flex items-center gap-1.5">
                <Input id="lead-partial" type="number" min={0} max={100} step="any" className="h-9 w-24 text-right" value={partial} onChange={(e) => setPartial(e.target.value)} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className={cn('text-sm', ok ? 'text-muted-foreground' : 'text-rose-600')}>
              {ok ? rule({ full: fullN, partial: partialN }) : 'Check the dates and numbers'}
            </p>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!ok || saving} onClick={() => void save()}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save target
              </Button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
