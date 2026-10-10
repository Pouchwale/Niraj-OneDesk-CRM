/**
 * Proof checks, for the team leader and the administrator: every screenshot
 * Robi asked a coordinator for, with the follow-up it proves, to approve or
 * reject - and the ones that were never sent.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Check, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { whenSaved } from '@/lib/shared-data'
import type { ProofRequest } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'

const STATUS: Record<ProofRequest['status'], { label: string; style: string }> = {
  submitted: { label: 'To review', style: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400' },
  approved: { label: 'Approved', style: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400' },
  rejected: { label: 'Rejected', style: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400' },
  missed: { label: 'Missed', style: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' },
  pending: { label: 'Waiting (timer running)', style: 'bg-muted text-muted-foreground border-border' },
}

const FILTERS: { id: 'all' | ProofRequest['status']; label: string }[] = [
  { id: 'submitted', label: 'To review' },
  { id: 'missed', label: 'Missed' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/** How many screenshots are waiting for a decision, for the tab's badge. */
export function useProofsToReview(): number {
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.proofRequests)
  return all.filter((r) => r.status === 'submitted').length
}

export function ProofReview() {
  const { user } = useAuth()
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.proofRequests)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('submitted')

  const rows = useMemo(
    () =>
      all
        .filter((r) => filter === 'all' || r.status === filter)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [all, filter]
  )
  const followupOf = (id: string | null) => (id ? demoCompanyStore.getAllFollowups().find((f) => f.id === id) : undefined)

  const review = async (request: ProofRequest, status: 'approved' | 'rejected') => {
    if (!user) return
    const note = status === 'rejected' ? window.prompt('Why is it rejected? (the coordinator does not see this yet)') ?? '' : ''
    demoCompanyStore.reviewProof(request.id, status, user.id, new Date().toISOString(), note || null)
    try {
      await whenSaved()
      toast.success(status === 'approved' ? 'Proof approved.' : 'Proof rejected.')
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="proof-review">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-semibold leading-tight">Proof checks</h3>
          <p className="text-xs text-muted-foreground">
            Each day Robi asks every coordinator for a screenshot on 2 of their tasks, within 10 minutes of logging
            the follow-up. Approve or reject what they sent; "Missed" means the 10 minutes ran out.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? all.length : all.filter((r) => r.status === f.id).length
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted/50'
              )}
            >
              {f.label}
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{count}</span>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const f = followupOf(r.followupId)
            return (
              <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row" data-testid="proof-row">
                <div className="shrink-0">
                  {r.fileUrl ? (
                    <a href={r.fileUrl} target="_blank" rel="noreferrer" title="Open full size">
                      <img src={r.fileUrl} alt={`Proof for ${r.entityName}`} className="h-28 w-44 rounded-lg border object-cover" />
                    </a>
                  ) : (
                    <div className="flex h-28 w-44 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                      No screenshot
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{getCoordinatorDisplayName(r.coordinatorId)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate">{r.entityName}</span>
                    <Badge variant="outline" className={cn('ml-auto whitespace-nowrap', STATUS[r.status].style)}>
                      {STATUS[r.status].label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Asked {time(r.requestedAt)} · {r.status === 'missed' ? `deadline ${time(r.dueAt)}` : r.submittedAt ? `sent ${time(r.submittedAt)}` : `due by ${time(r.dueAt)}`}
                    {r.reviewedAt && r.reviewedBy && ` · ${STATUS[r.status].label.toLowerCase()} by ${getCoordinatorDisplayName(r.reviewedBy)} ${time(r.reviewedAt)}`}
                  </p>
                  {f && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Follow-up {formatDate(f.followup_date)} ({f.mode}):</span> {f.notes || '—'}
                    </p>
                  )}
                  {r.reviewNote && r.status === 'rejected' && <p className="text-xs text-rose-600">Reason: {r.reviewNote}</p>}
                  {(r.status === 'submitted' || r.status === 'approved' || r.status === 'rejected') && (
                    <div className="flex gap-2 pt-1">
                      {r.status !== 'approved' && (
                        <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => review(r, 'approved')} data-testid="proof-approve">
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      {r.status !== 'rejected' && (
                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => review(r, 'rejected')}>
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}
