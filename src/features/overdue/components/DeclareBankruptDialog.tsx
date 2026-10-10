import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
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
import { formatCurrency } from '@/lib/utils'
import { declareCustomerBankrupt, requestDecision, type NoFollowupTarget } from '@/lib/no-followup-api'

interface Props {
  /** The record the call is made from — an invoice or an ageing row. */
  target: NoFollowupTarget & { name: string; amount: number }
  open: boolean
  onOpenChange: (open: boolean) => void
  declaredBy: string
  /** Where the person can find it afterwards differs for the team leader. */
  canManageTeam?: boolean
  onDeclared: () => void
}

/**
 * Declaring a customer bankrupt.
 *
 * This is somebody deciding that a debt will not be collected, so it asks
 * before it acts and says exactly what will happen: since 11 Sept 2026 the
 * customer leaves Active Payments, Overdue and every total, the way no
 * follow-up does, and is listed only in the Bankrupt register.
 *
 * The reason is required (at least 5 characters, checked on the server too):
 * six months later, "which insolvency was this?" is the first question anybody
 * has, and a blank field has no answer.
 */
export function DeclareBankruptDialog({ target, open, onOpenChange, declaredBy, canManageTeam, onDeclared }: Props) {
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const declare = async () => {
    setIsSaving(true)
    try {
      // A coordinator asks; the team leader or the administrator approves.
      if (!canManageTeam) {
        await requestDecision(target, 'bankrupt', declaredBy, note)
        toast.success('Sent to your team leader for approval.', {
          description: `${target.name} stays in your lists until it is approved.`,
        })
        onOpenChange(false)
        setNote('')
        onDeclared()
        return
      }
      await declareCustomerBankrupt(target, declaredBy, note)
      toast.success(`${target.name} is marked bankrupt.`, {
        description: canManageTeam
          ? 'It has left Active Payments, Overdue and every total. It is listed in the Bankrupt register.'
          : 'It has left your lists and every total. To undo it, open it from Set aside in My Active Payments.',
      })
      onOpenChange(false)
      setNote('')
      onDeclared()
    } catch (err) {
      toast.error('Not marked bankrupt.', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            Declare {target.name} bankrupt?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2 text-sm">
              <p>
                Use this when the company has gone under and there is no longer anybody to chase.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  The {formatCurrency(target.amount)} on this record, and everything else this customer
                  owes in Active Payments and Overdue, <strong>leaves every total</strong>, the same as
                  no follow-up.
                </li>
                <li>
                  It leaves both lists entirely: no reminders, no daily plan, no Critical &amp; closing
                  in. It is listed only in the Bankrupt register.
                </li>
                <li>A re-import of the Excel file will not undo it, and you can reverse it.</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="bankrupt-note" className="text-xs">
            Reason or reference <span className="text-rose-600">(required)</span>
          </Label>
          <Input
            id="bankrupt-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="NCLT petition no., liquidator's notice, who told you…"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            className="bg-rose-600 text-white hover:bg-rose-700"
            onClick={declare}
            disabled={isSaving || note.trim().length < 5}
          >
            {isSaving ? 'Saving…' : canManageTeam ? 'Declare bankrupt' : 'Send for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
