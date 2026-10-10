/**
 * Overview → Approvals: coordinators' requests to mark a customer No follow-up,
 * Dispute or Bankrupt. Nothing changes until the team leader or the
 * administrator approves; approving applies it in the coordinator's name.
 */

import { useState, useSyncExternalStore } from 'react'
import { Check, ClipboardCheck, X } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { approveDecision, rejectDecision } from '@/lib/no-followup-api'
import type { DecisionRequest } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'

const KIND: Record<DecisionRequest['kind'], { label: string; style: string }> = {
  no_followup: { label: 'No follow-up', style: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' },
  dispute: { label: 'Dispute', style: 'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400' },
  bankrupt: { label: 'Bankrupt', style: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400' },
}

const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/** Requests waiting for a decision, for the tab's badge. */
export function usePendingDecisions(): number {
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.decisionRequests)
  return all.filter((r) => r.status === 'pending').length
}

export function DecisionApprovals({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth()
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.decisionRequests)
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const rows = all
    .filter((r) => (showDone ? r.status !== 'pending' : r.status === 'pending'))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))

  const act = async (r: DecisionRequest, approve: boolean) => {
    if (!user) return
    const note = approve ? null : window.prompt('Why is it rejected?') ?? null
    if (!approve && note === null) return
    setBusy(r.id)
    try {
      if (approve) await approveDecision(r, user.id)
      else await rejectDecision(r, user.id, note)
      toast.success(approve ? `${r.name} is now marked ${KIND[r.kind].label}.` : 'Request rejected.')
      onChanged?.()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="decision-approvals">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Approvals</h3>
            <p className="text-xs text-muted-foreground">
              Coordinators asking to mark a customer No follow-up, Dispute or Bankrupt. Approving applies it — the
              customer leaves the lists and the totals — in the coordinator's name with their reason.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Show waiting' : 'Show decided'}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{showDone ? 'Nothing decided yet.' : 'Nothing waiting for approval.'}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="space-y-1 rounded-xl border border-border p-3 text-sm" data-testid="decision-row">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn('whitespace-nowrap', KIND[r.kind].style)}>{KIND[r.kind].label}</Badge>
                <span className="font-medium">{r.name}</span>
                {r.bpCode && <span className="font-mono text-xs text-muted-foreground">{r.bpCode}</span>}
                <span className="tabular-nums text-muted-foreground">· {formatCurrency(r.amount)}</span>
                {r.status !== 'pending' && (
                  <Badge variant="outline" className="ml-auto">{r.status === 'approved' ? 'Approved' : 'Rejected'}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Asked by {getCoordinatorDisplayName(r.requestedBy)} · {time(r.requestedAt)}
                {r.reviewedBy && ` · ${r.status} by ${getCoordinatorDisplayName(r.reviewedBy)} ${time(r.reviewedAt)}`}
              </p>
              <p className="rounded border border-border/50 bg-muted/30 p-2 text-xs">Reason: {r.reason}</p>
              {r.reviewNote && <p className="text-xs text-rose-600">Rejected because: {r.reviewNote}</p>}
              {r.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 px-2.5 text-xs" disabled={busy !== null} onClick={() => act(r, true)} data-testid="decision-approve">
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={busy !== null} onClick={() => act(r, false)}>
                    <X className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
