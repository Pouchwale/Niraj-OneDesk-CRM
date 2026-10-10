import { useState } from 'react'
import { BellOff, RotateCcw, Scale } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { requestDecision, setNoFollowup, clearNoFollowup, type NoFollowupEntity } from '@/lib/no-followup-api'
import { isNoFollowup, type NoFollowupFields } from '@/lib/no-followup'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Props {
  entityType: NoFollowupEntity
  entityId: string
  /** How the customer is identified across both books; null when unknown. */
  bpCode: string | null
  name: string
  amount: number
  /** The record in hand, for its no_followup_* fields. */
  record: NoFollowupFields
  currentUserId?: string
  /** Team leader or admin: the only people who set aside, dispute or resume. */
  isAdmin?: boolean
  /** 'dispute': the same set-aside, recorded as a dispute with its own register. */
  kind?: 'dispute'
  onChanged: () => void
}

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : 'Try again in a moment.')

/**
 * "No follow-up": the customer leaves the working lists, and the balance leaves
 * the total.
 *
 * The neighbouring option, bankruptcy, stops the chasing but keeps the money in
 * what is owed. This one does both, which makes it the stronger claim of the
 * two - the outstanding figure on every screen goes down when it is used - so
 * the dialog says the amount out loud, the set-aside card keeps showing it
 * afterwards, and the Active Payments and Overdue headers carry a line for the
 * money held back. Excluded is not the same as gone, and the screens should
 * never let it read that way.
 *
 * Open to coordinators as well as the team leader: the person on the phone is
 * the one who learns that an account is not worth chasing, and routing that
 * through a request would just leave the list wrong in the meantime.
 */
export function NoFollowupControl({
  entityType,
  entityId,
  bpCode,
  name,
  amount,
  record,
  currentUserId,
  isAdmin,
  kind,
  onChanged,
}: Props) {
  const dispute = kind === 'dispute'
  const label = dispute ? 'Dispute' : 'No follow-up'
  const [isOpen, setIsOpen] = useState(false)
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (!currentUserId) return null

  const target = { entityType, entityId, bpCode }

  const stop = async () => {
    setIsSaving(true)
    try {
      // A coordinator asks; the team leader or the administrator approves.
      if (!isAdmin) {
        await requestDecision({ ...target, name, amount }, dispute ? 'dispute' : 'no_followup', currentUserId, note)
        toast.success('Sent to your team leader for approval.', {
          description: `${name} stays in your lists until it is approved.`,
        })
        setIsOpen(false)
        setNote('')
        onChanged()
        return
      }
      const rows = await setNoFollowup(target, currentUserId, note, kind ?? null)
      toast.success(dispute ? `${name} is marked as in dispute.` : `${name} is set to no follow-up.`, {
        description:
          `${formatCurrency(amount)} is now excluded from what is owed` +
          (rows > 1 ? ', in Active Payments and Overdue both.' : '.'),
      })
      setIsOpen(false)
      setNote('')
      onChanged()
    } catch (err) {
      toast.error('Not set to no follow-up.', { description: reasonOf(err) })
    } finally {
      setIsSaving(false)
    }
  }

  const resume = async () => {
    setIsSaving(true)
    try {
      await clearNoFollowup(target, currentUserId)
      toast.success(`${name} is back in the follow-up lists.`, {
        description: `${formatCurrency(amount)} counts towards what is owed again.`,
      })
      onChanged()
    } catch (err) {
      toast.error('Follow-up not resumed.', { description: reasonOf(err) })
    } finally {
      setIsSaving(false)
    }
  }

  if (isNoFollowup(record)) {
    const canResume = isAdmin
    const isDisputed = record.no_followup_kind === 'dispute'
    return (
      <div className={`rounded-lg border p-4 ${isDisputed ? 'border-orange-500/40 bg-orange-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
        <div className={`flex items-center gap-2 text-sm font-semibold ${isDisputed ? 'text-orange-600 dark:text-orange-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {isDisputed ? <Scale className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          {isDisputed ? 'In dispute' : 'No follow-up'}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {record.no_followup_by
            ? `Set by ${getCoordinatorDisplayName(record.no_followup_by)}`
            : 'Set aside'}
          {record.no_followup_at ? ` on ${formatDate(record.no_followup_at.slice(0, 10))}` : ''}.{' '}
          {formatCurrency(amount)} is held out of what is owed.
        </p>
        {record.no_followup_note && (
          <p className="mt-2 rounded border border-border/50 bg-background/60 p-2 text-xs">
            {record.no_followup_note}
          </p>
        )}
        {canResume ? (
          <Button variant="outline" size="sm" className="mt-3" disabled={isSaving} onClick={resume}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Resume follow-up
          </Button>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Only your team leader or the administrator can put this back into the lists.
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`w-full justify-start ${dispute ? 'text-orange-600 hover:text-orange-700 dark:text-orange-400' : 'text-amber-600 hover:text-amber-700 dark:text-amber-400'}`}
        onClick={() => setIsOpen(true)}
      >
        {dispute ? <Scale className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
        {label}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dispute ? <Scale className="h-5 w-5 text-orange-500" /> : <BellOff className="h-5 w-5 text-amber-500" />}
              {dispute ? `Mark ${name} as in dispute?` : `Stop following up ${name}?`}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm">
                <p>
                  {dispute
                    ? 'Use this when the customer disputes the amount and chasing stops until it is resolved.'
                    : 'Use this when the balance is not worth chasing and should not be counted.'}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    The {formatCurrency(amount)} balance is{' '}
                    <strong>taken out of what is owed</strong> - on your screens and the team
                    leader&apos;s.
                  </li>
                  <li>
                    It leaves the follow-up lists: no reminders, no daily plan, nothing from Robi.
                  </li>
                  <li>
                    It applies in Active Payments and Overdue together, so the customer does not
                    keep appearing in the other one.
                  </li>
                  <li>
                    A re-import of the Excel file will not undo it, and you can reverse it here.
                  </li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="no-followup-note" className="text-xs">
              Reason <span className="text-rose-600">(required)</span>
            </Label>
            <Input
              id="no-followup-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={dispute ? 'What is disputed: rate difference, damaged goods, short supply…' : 'Written off, customer closed, agreed hold…'}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={stop}
              disabled={isSaving || note.trim().length < 5}
            >
              {isSaving ? 'Saving…' : !isAdmin ? 'Send for approval' : dispute ? 'Mark as dispute' : 'Stop follow-up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
