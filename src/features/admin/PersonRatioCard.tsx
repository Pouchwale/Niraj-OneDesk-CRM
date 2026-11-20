/**
 * Admin Panel → Final score ratio per person (20 Nov 2026, the user's
 * request): the administrator gives some coordinators a ratio of their own -
 * every module's share, adding up to 100% - instead of the team ratio set on
 * the Final score page. Tick people one by one, or a whole team at once and
 * untick some. No dates: it counts from now until it is removed. Open weeks,
 * months and years use it; locked ones keep the ratio they locked with. A
 * person is on one such ratio at most.
 */

import { useCallback, useEffect, useState } from 'react'
import { Scale } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAllCoordinators } from '@/features/auth/AuthContext'
import { deletePersonRatio, getScoreHistory, savePersonRatio } from '@/lib/score-history-api'
import { ratioOn, SCORE_MODULES, type FinalRatio, type FinalWeights, type PersonRatio } from '@/lib/score-history'
import { cn } from '@/lib/utils'

const sharesText = (weights: FinalWeights) =>
  SCORE_MODULES.filter((m) => (weights[m.id] ?? 0) > 0)
    .map((m) => `${m.short} ${weights[m.id]}%`)
    .join(' · ') || 'No shares'

export function PersonRatioCard() {
  const [ratios, setRatios] = useState<PersonRatio[] | null>(null)
  const [teamRatios, setTeamRatios] = useState<FinalRatio[]>([])
  const [today, setToday] = useState('')
  const [editing, setEditing] = useState<PersonRatio | 'new' | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const coordinators = [...getAllCoordinators()].sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
  const nameOf = (id: string) => coordinators.find((c) => c.id === id)?.full_name ?? 'Someone no longer active'
  const teams = [...new Set(coordinators.map((c) => c.module).filter((m) => Boolean(m)))].sort() as string[]

  const load = useCallback(async () => {
    try {
      const data = await getScoreHistory('week', 1)
      setRatios(data.personRatios ?? [])
      setTeamRatios(data.finalRatios)
      setToday(data.today)
    } catch (err) {
      toast.error('Could not load the ratios.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  // People already on another ratio of their own cannot be ticked here.
  const elsewhere = new Map<string, PersonRatio>()
  for (const r of ratios ?? []) if (editing === 'new' || r.id !== (editing as PersonRatio | null)?.id) for (const id of r.coordinatorIds) elsewhere.set(id, r)

  const start = (ratio: PersonRatio | 'new') => {
    const base = ratio === 'new' ? ratioOn(teamRatios, today)?.weights ?? {} : ratio.weights
    setPicked(new Set(ratio === 'new' ? [] : ratio.coordinatorIds))
    setDraft(Object.fromEntries(SCORE_MODULES.map((m) => [m.id, String(base[m.id] ?? 0)])))
    setEditing(ratio)
  }
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const pickTeam = (team: string) =>
    setPicked((prev) => new Set([...prev, ...coordinators.filter((c) => c.module === team && !elsewhere.has(c.id)).map((c) => c.id)]))

  const numbers = SCORE_MODULES.map((m) => ((draft[m.id] ?? '').trim() === '' ? 0 : Number(draft[m.id])))
  const valid = numbers.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)
  const total = Math.round(numbers.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0) * 100) / 100
  const totalOk = valid && Math.abs(total - 100) < 0.001
  const ok = totalOk && picked.size > 0

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const weights = Object.fromEntries(SCORE_MODULES.map((m, i) => [m.id, numbers[i]])) as FinalWeights
      const result = await savePersonRatio({ coordinatorIds: [...picked], weights }, editing === 'new' ? undefined : editing.id)
      setRatios(result.personRatios)
      toast.success(`Ratio saved for ${picked.size} ${picked.size === 1 ? 'person' : 'people'}.`, {
        description: 'Their open weeks, months and years use it from now on; locked ones keep theirs.',
      })
      setEditing(null)
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }
  const remove = async (ratio: PersonRatio) => {
    const who = ratio.coordinatorIds.map(nameOf).join(', ')
    if (!window.confirm(`Remove the ratio of ${who}? They go back to the team ratio (open periods only; locked ones keep theirs).`)) return
    try {
      const result = await deletePersonRatio(ratio.id)
      setRatios(result.personRatios)
      toast.success('Ratio removed.', { description: `${who} ${ratio.coordinatorIds.length === 1 ? 'is' : 'are'} back on the team ratio.` })
    } catch (err) {
      toast.error('Not removed.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }

  const teamNow = ratioOn(teamRatios, today)

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="person-ratio">
      <div className="flex flex-wrap items-start gap-3">
        <Scale className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Final score ratio per person</h3>
          <p className="text-xs text-muted-foreground">
            Give some coordinators their own share for each module (adding up to 100%) instead of the team ratio
            {teamNow ? ` (now: ${sharesText(teamNow.weights)})` : ' (none set yet: the plain average)'}. It counts from now until you remove
            it: open weeks, months and years use it; locked ones keep theirs.
          </p>
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => start('new')} disabled={ratios === null} data-testid="person-ratio-add">
            Add ratio
          </Button>
        )}
      </div>

      {ratios && ratios.length > 0 && (
        <div className="divide-y divide-border/50 rounded-md border border-border/50" data-testid="person-ratio-list">
          {ratios.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm" data-testid="person-ratio-row">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.coordinatorIds.map(nameOf).join(', ')}</p>
                <p className="text-xs text-muted-foreground">{sharesText(r.weights)}</p>
              </div>
              {!editing && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => start(r)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => void remove(r)}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {ratios && ratios.length === 0 && !editing && <p className="text-xs text-muted-foreground">Nobody has a ratio of their own: everyone uses the team ratio.</p>}

      {editing && (
        <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-3" data-testid="person-ratio-form">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">People</p>
              {teams.map((team) => (
                <Button key={team} size="sm" variant="outline" className="h-7 text-xs" onClick={() => pickTeam(team)} data-testid="person-ratio-team">
                  Whole {team} team
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPicked(new Set())}>
                Clear
              </Button>
              <span className="text-xs text-muted-foreground">{picked.size} chosen</span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {coordinators.map((c) => {
                const taken = elsewhere.get(c.id)
                return (
                  <label
                    key={c.id}
                    className={cn('flex items-center gap-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-1.5 text-sm', taken ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}
                    title={taken ? 'Already has a ratio of their own: change that one' : undefined}
                  >
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={picked.has(c.id)} disabled={Boolean(taken)} onChange={(e) => toggle(String(c.id), e.target.checked)} data-testid="person-ratio-person" />
                    <span className="truncate">{c.full_name}</span>
                    {c.module && <span className="ml-auto text-[10px] text-muted-foreground">{c.module}</span>}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Share of each module</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SCORE_MODULES.map((m) => (
                <label key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-1.5 text-sm">
                  <span className="truncate">{m.label}</span>
                  <span className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-8 w-[72px] text-right"
                      value={draft[m.id] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                      aria-label={`${m.label} share`}
                    />
                    %
                  </span>
                </label>
              ))}
            </div>
            <p className={cn('text-sm font-medium', totalOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600')} data-testid="person-ratio-total">
              Total {total}% {totalOk ? '' : '(must be 100%)'}
              {!picked.size && <span className="ml-2 text-rose-600">Choose at least one coordinator.</span>}
            </p>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={!ok || saving} data-testid="person-ratio-save">
              Save ratio
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
