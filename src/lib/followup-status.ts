import type { FollowupStatus } from '@/lib/types'

/**
 * How a follow-up outcome is written and coloured, everywhere it appears.
 *
 * The timeline and the history list showed the same statuses in different
 * palettes, so "committed" was blue in one place and sky in the other. One
 * table keeps them honest.
 *
 * Each style pairs a light-theme step with a dark one: a 300/400 tint is
 * invisible on the pale tinted chip these sit on in light mode.
 */
export const FOLLOWUP_STATUS_STYLE: Record<FollowupStatus, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  committed: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  escalated: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30',
  no_response: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
}

export const FOLLOWUP_STATUS_LABEL: Record<FollowupStatus, string> = {
  pending: 'Pending',
  committed: 'Committed',
  paid: 'Paid',
  escalated: 'Escalated',
  no_response: 'No response',
}
