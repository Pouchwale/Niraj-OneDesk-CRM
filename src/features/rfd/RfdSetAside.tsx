/**
 * Setting a Ready for Dispatch line aside: No physical quantity, Dispute or
 * Need to destroy, always with a reason (19 Nov 2026). A coordinator's choice
 * goes to the team leader for approval, as in payments; the team leader and
 * the administrator mark it directly and can put it back.
 */

import { useState, useSyncExternalStore } from 'react'
import { Ban, Hourglass, PackageX, RotateCcw, Scale, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { clearRfdLineMark, markRfdLine, pendingRfdRequest, requestRfdMark, RFD_MARK_KINDS, RFD_MARK_LABEL, rfdMarkKindOf } from '@/lib/rfd-marks'
import type { RfdDecisionKind, RfdMark, RfdMarkKind, RfdRow } from '@/lib/types'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const MIN_REASON = 5

export const RFD_MARK_STYLE: Record<RfdMarkKind, string> = {
  no_physical_qty: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400',
  dispute: 'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400',
  destroy: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400',
}

const ICON: Record<RfdMarkKind, typeof Ban> = { no_physical_qty: PackageX, dispute: Scale, destroy: Trash2 }

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : 'Try again in a moment.')

export function RfdMarkBadge({ kind }: { kind: RfdMarkKind }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', RFD_MARK_STYLE[kind])}>
      {RFD_MARK_LABEL[kind]}
    </Badge>
  )
}

/** The panel's section: the three buttons, the request waiting, or the mark with Put back. */
export function RfdSetAside({ line, currentUserId, canDecide }: { line: RfdRow; currentUserId?: string; canDecide: boolean }) {
  const marks = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.rfdMarks)
  useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.decisionRequests)
  const mark = marks.find((m) => m.lineId === line.id)
  const pending = pendingRfdRequest(line.id)
  const [kind, setKind] = useState<RfdMarkKind | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  if (!currentUserId) return null

  const send = async () => {
    if (!kind || note.trim().length < MIN_REASON) return
    setSaving(true)
    try {
      if (canDecide) {
        await markRfdLine(line, kind, note, currentUserId)
        toast.success(`SO ${line.sales_order ?? '—'} is marked ${RFD_MARK_LABEL[kind]}.`, {
          description: `${formatCurrency(line.pending_value)} leaves the Ready for Dispatch list and Robi's tasks.`,
        })
      } else {
        await requestRfdMark(line, kind, note, currentUserId)
        toast.success('Sent to your team leader for approval.', { description: 'The line stays in your list until it is approved.' })
      }
      setKind(null)
      setNote('')
    } catch (err) {
      toast.error('Not saved.', { description: reasonOf(err) })
    } finally {
      setSaving(false)
    }
  }

  const putBack = async (held: RfdMark) => {
    setSaving(true)
    try {
      await clearRfdLineMark(held.lineId)
      toast.success('Back in the Ready for Dispatch list.')
    } catch (err) {
      toast.error('Not saved.', { description: reasonOf(err) })
    } finally {
      setSaving(false)
    }
  }

  if (mark) {
    const Icon = ICON[mark.kind]
    return (
      <div className={cn('space-y-2 rounded-lg border p-4', RFD_MARK_STYLE[mark.kind])} data-testid="rfd-mark">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" /> {RFD_MARK_LABEL[mark.kind]}
        </div>
        <p className="text-sm text-foreground">Reason: {mark.note}</p>
        <p className="text-xs text-muted-foreground">
          {getCoordinatorDisplayName(mark.by)} · {formatDate(mark.at)}
          {mark.approvedBy && ` · approved by ${getCoordinatorDisplayName(mark.approvedBy)}`}
        </p>
        <p className="text-xs text-muted-foreground">Out of the Ready for Dispatch list, the pending total and Robi's tasks.</p>
        {canDecide && (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => putBack(mark)} data-testid="rfd-mark-clear">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Put back in the list
          </Button>
        )}
      </div>
    )
  }

  if (pending) {
    const asked = rfdMarkKindOf(pending.kind as RfdDecisionKind)
    return (
      <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm" data-testid="rfd-mark-pending">
        <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
          <Hourglass className="h-4 w-4" /> Waiting for the team leader: {RFD_MARK_LABEL[asked]}
        </div>
        <p>Reason: {pending.reason}</p>
        <p className="text-xs text-muted-foreground">
          Asked by {getCoordinatorDisplayName(pending.requestedBy)} · {formatDate(pending.requestedAt)}. The line stays in the list until it is approved.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4" data-testid="rfd-set-aside">
      <div>
        <h3 className="font-semibold">Set this line aside</h3>
        <p className="text-xs text-muted-foreground">
          {canDecide
            ? 'Takes this line out of the list, the pending total and Robi’s tasks. A reason is required.'
            : 'Goes to your team leader for approval, with your reason. Until then the line stays in your list.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {RFD_MARK_KINDS.map((k) => {
          const Icon = ICON[k]
          return (
            <Button
              key={k}
              size="sm"
              variant="outline"
              className={cn('h-8', kind === k && RFD_MARK_STYLE[k])}
              onClick={() => setKind(kind === k ? null : k)}
              data-testid={`rfd-mark-${k}`}
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" /> {RFD_MARK_LABEL[k]}
            </Button>
          )
        })}
      </div>
      {kind && (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`Why is this line ${RFD_MARK_LABEL[kind].toLowerCase()}? (required)`}
            rows={3}
            data-testid="rfd-mark-reason"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={saving || note.trim().length < MIN_REASON} onClick={send} data-testid="rfd-mark-send">
              {canDecide ? `Mark ${RFD_MARK_LABEL[kind]}` : 'Send for approval'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setKind(null); setNote('') }}>
              Cancel
            </Button>
            {note.trim().length < MIN_REASON && <span className="text-xs text-muted-foreground">At least {MIN_REASON} characters.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
