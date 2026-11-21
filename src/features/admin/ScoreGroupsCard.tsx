/**
 * Admin Panel → Two scores (21 Nov 2026, the user's request): every scoring
 * module belongs to one of two separate scores, Payments or Operations. The
 * administrator moves a module with one click. Open weeks, months and years
 * follow at once; locked ones keep the groups they locked with.
 */

import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { getScoreHistory, saveScoreGroups } from '@/lib/score-history-api'
import { DEFAULT_SCORE_GROUPS, modulesInGroup, SCORE_GROUPS, SCORE_MODULES, scoreGroupLabel, type ScoreGroup, type ScoreGroupMap, type ScoreModule } from '@/lib/score-history'
import { cn } from '@/lib/utils'

export function ScoreGroupsCard({ onChanged }: { onChanged: () => void }) {
  const [groups, setGroups] = useState<ScoreGroupMap | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    getScoreHistory('week', 1)
      .then((data) => live && setGroups(data.scoreGroups ?? DEFAULT_SCORE_GROUPS))
      .catch((err) => toast.error('Could not load the two scores.', { description: err instanceof Error ? err.message : 'Try again.' }))
    return () => {
      live = false
    }
  }, [])

  const move = async (module: ScoreModule, label: string, group: ScoreGroup) => {
    if (!groups || groups[module] === group) return
    const from = groups[module]
    if (modulesInGroup(groups, from).length === 1) {
      toast.error(`${scoreGroupLabel(from)} needs at least one module.`)
      return
    }
    if (!window.confirm(`Move ${label} from ${scoreGroupLabel(from)} to ${scoreGroupLabel(group)}? Open weeks, months and years change now; locked ones stay. Check both ratios afterwards.`)) return
    setBusy(true)
    try {
      const result = await saveScoreGroups({ ...groups, [module]: group })
      setGroups(result.scoreGroups)
      toast.success(`${label} is now in ${scoreGroupLabel(group)}.`, { description: `Give it a share in the ${scoreGroupLabel(group)} ratio: at 0% it does not count.` })
      onChanged()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="score-groups">
      <div className="flex items-start gap-3">
        <Layers className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h3 className="text-base font-semibold">Two scores: Payments and Operations</h3>
          <p className="text-xs text-muted-foreground">
            Each coordinator gets two separate scores. Choose which score each module counts in. Each score has its own ratio adding up to 100%, set on the Final score page.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {SCORE_MODULES.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2" data-testid="score-group-row">
            <span className="truncate text-sm font-medium">{m.label}</span>
            <div className="flex shrink-0 rounded-full bg-muted p-0.5" role="radiogroup" aria-label={`Score for ${m.label}`}>
              {SCORE_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={groups?.[m.id] === g.id}
                  disabled={!groups || busy}
                  onClick={() => void move(m.id, m.label, g.id)}
                  className={cn('rounded-full px-3 py-1 text-xs font-medium', groups?.[m.id] === g.id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
