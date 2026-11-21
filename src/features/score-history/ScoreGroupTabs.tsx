/** The two scores (21 Nov 2026): Payments or Operations, on the Final score page and the team dashboard. */

import { SCORE_GROUPS, type ScoreGroup } from '@/lib/score-history'
import { cn } from '@/lib/utils'

export function ScoreGroupTabs({ value, onChange }: { value: ScoreGroup; onChange: (group: ScoreGroup) => void }) {
  return (
    <div className="flex rounded-full bg-muted p-0.5" role="radiogroup" aria-label="Payments or Operations score" data-testid="score-group-tabs">
      {SCORE_GROUPS.map((g) => (
        <button
          key={g.id}
          type="button"
          role="radio"
          aria-checked={value === g.id}
          onClick={() => onChange(g.id)}
          className={cn('rounded-full px-4 py-1.5 text-sm font-medium', value === g.id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          data-testid={`score-group-${g.id}`}
        >
          {g.label}
        </button>
      ))}
    </div>
  )
}
