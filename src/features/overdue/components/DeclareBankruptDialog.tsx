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
import { declareBankrupt } from '@/lib/overdue-api'
import type { OverduePayment } from '@/lib/types'

interface Props {
  payment: OverduePayment
  open: boolean
  onOpenChange: (open: boolean) => void
  declaredBy: string
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
 * The reason is asked for rather than required. Six months later, "which
 * insolvency was this?" is the first question anybody has, and a blank field
 * has no answer; but refusing the declaration over a missing note would just
 * teach people to type a full stop.
 */
export function DeclareBankruptDialog({ payment, open, onOpenChange, declaredBy, onDeclared }: Props) {
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const declare = async () => {
    setIsSaving(true)
    try {
      await declareBankrupt(payment.id, declaredBy, note)
      toast.success(`${payment.customer_name || payment.bp_code} is marked bankrupt.`, {
        description: 'It has left Active Payments, Overdue and every total. It is listed in the Bankrupt register.',
      })
      onOpenChange(false)
      setNote('')
      onDeclared()
    } catch {
      toast.error('That could not be saved. Try again in a moment.')
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
            Declare {payment.customer_name || payment.bp_code} bankrupt?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2 text-sm">
              <p>
                Use this when the company has gone under and there is no longer anybody to chase.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  The {formatCurrency(payment.balance_due)} balance, and this customer's invoices in
                  Active Payments, <strong>leave every total</strong> — the same as no follow-up.
                </li>
                <li>
                  It leaves Active Payments and Overdue entirely: no reminders, no daily plan, no
                  Critical &amp; closing in. It is listed only in the Bankrupt register.
                </li>
                <li>A re-import of the Excel file will not undo it, and you can reverse it here.</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="bankrupt-note" className="text-xs">
            Reason or reference <span className="text-muted-foreground">(optional)</span>
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
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Declare bankrupt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
