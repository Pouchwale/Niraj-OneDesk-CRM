import { AlertTriangle, CalendarClock, Flame, LayoutList } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  ATTENTION_HINT,
  ATTENTION_LABEL,
  type Attention,
  type AttentionReason,
} from '@/lib/attention'

export type PaymentsView = 'all' | 'attention'

const REASON_ICON: Record<AttentionReason, React.ComponentType<{ className?: string }>> = {
  critical: Flame,
  overdue:AlertTriangle,
  due_soon: CalendarClock,
}

const REASON_CHIP: Record<AttentionReason, string> = {
  critical: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  overdue:'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30',
  due_soon: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30',
}

const REASON_RULE: Record<AttentionReason, string> = {
  critical: 'bg-rose-500',
  overdue:'bg-amber-500',
  due_soon: 'bg-sky-500',
}

interface ViewSwitchProps {
  value: PaymentsView
  onChange: (view: PaymentsView) => void
  allCount: number
  attentionCount: number
  className?: string
}

/**
 * The two windows: everything, or only what needs a decision this week.
 * Counts sit on the buttons so the second window is judged before it is opened.
 */
export function ViewSwitch({ value, onChange, allCount, attentionCount, className }: ViewSwitchProps) {
  const options: { id: PaymentsView; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'all', label: 'All payments', count: allCount, Icon: LayoutList },
    { id: 'attention', label: 'Critical & closing in', count: attentionCount, Icon: Flame },
  ]
  return (
    <div
      role="tablist"
      aria-label="Payments view"
      data-testid="view-switch"
      className={cn('inline-flex rounded-xl border border-border bg-muted/40 p-1', className)}
    >
      {options.map(({ id, label, count, Icon }) => {
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('h-4 w-4', id === 'attention' && count > 0 && 'text-rose-500')} />
            <span>{label}</span>
            <span
              className={cn(
                'rounded-full px-1.5 text-xs tabular-nums',
                active ? 'bg-muted text-foreground' : 'bg-muted/60 text-muted-foreground',
                id === 'attention' && count > 0 && 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Why a row is in the second window, in three words and a figure. */
export function AttentionChip({ attention, className }: { attention: Attention; className?: string }) {
  const Icon = REASON_ICON[attention.reason]
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4',
        REASON_CHIP[attention.reason],
        className
      )}
      title={ATTENTION_HINT[attention.reason]}
      data-reason={attention.reason}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {ATTENTION_LABEL[attention.reason]} · {attention.detail}
      </span>
    </span>
  )
}

/** A divider row in a table, naming the group that follows and how many rows it holds. */
export function AttentionGroupRow({
  reason,
  count,
  colSpan,
}: {
  reason: AttentionReason
  count: number
  colSpan: number
}) {
  return (
    <tr className="bg-muted/30" data-group={reason}>
      <td colSpan={colSpan} className="px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span className={cn('h-2 w-2 rounded-full', REASON_RULE[reason])} />
          {ATTENTION_LABEL[reason]}
          <span className="normal-case tracking-normal">· {count}</span>
          <span className="hidden font-normal normal-case tracking-normal sm:inline">— {ATTENTION_HINT[reason]}</span>
        </div>
      </td>
    </tr>
  )
}
