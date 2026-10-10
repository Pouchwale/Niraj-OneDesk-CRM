import { useState } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { NoFollowupControl } from '@/components/shared/NoFollowupControl'
import { DeclareBankruptDialog } from '@/features/overdue/components/DeclareBankruptDialog'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { pendingDecisionFor, reinstateBankruptCustomer, type NoFollowupEntity } from '@/lib/no-followup-api'
import { isBankrupt, isNoFollowup, type BankruptFields, type NoFollowupFields } from '@/lib/no-followup'
import { formatDate } from '@/lib/utils'

interface Props {
  entityType: NoFollowupEntity
  entityId: string
  bpCode: string | null
  name: string
  /** The balance on this record, said out loud in the dialogs. */
  amount: number
  record: NoFollowupFields & BankruptFields
  currentUserId?: string
  /** Team leader or admin: may undo anyone's decision, not only their own. */
  canManageTeam?: boolean
  /** Paid or settled: nothing left to decide about. */
  isSettled?: boolean
  onChanged: () => void
}

/**
 * The two ways a customer leaves the chase, side by side in the follow-up
 * section: no follow-up, and bankrupt.
 *
 * They sit where the coordinator is logging the call that tells them, rather
 * than elsewhere on the panel, and next to each other because they look alike
 * and people pick between them. Anyone working the account may decide; the
 * server holds a coordinator to their own accounts and their own name, and lets
 * them undo only what they decided.
 */
export function AccountDecisions({
  entityType,
  entityId,
  bpCode,
  name,
  amount,
  record,
  currentUserId,
  canManageTeam,
  isSettled,
  onChanged,
}: Props) {
  const [isBankruptOpen, setIsBankruptOpen] = useState(false)
  const [isReinstating, setIsReinstating] = useState(false)

  if (!currentUserId) return null

  const bankrupt = isBankrupt(record)
  const noFollowup = isNoFollowup(record)
  if (isSettled && !bankrupt && !noFollowup) return null

  const target = { entityType, entityId, bpCode }

  const reinstate = async () => {
    setIsReinstating(true)
    try {
      await reinstateBankruptCustomer(target, currentUserId)
      toast.success(`${name} is back in Active Payments, Overdue and the totals.`)
      onChanged()
    } catch (err) {
      toast.error('Not reinstated.', { description: err instanceof Error ? err.message : 'Try again in a moment.' })
    } finally {
      setIsReinstating(false)
    }
  }

  const noFollowupControl = (
    <NoFollowupControl
      entityType={entityType}
      entityId={entityId}
      bpCode={bpCode}
      name={name}
      amount={amount}
      record={record}
      currentUserId={currentUserId}
      isAdmin={canManageTeam}
      onChanged={onChanged}
    />
  )

  if (bankrupt || noFollowup) {
    return (
      <div className="space-y-3" data-testid="account-decisions">
        {bankrupt && (
          /*
           * Said on the record itself, not just as a badge: anyone opening this
           * needs to know why nothing is being chased, and who decided that,
           * without going to ask somebody.
           */
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
              Declared bankrupt
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {record.bankrupt_declared_by ? `By ${getCoordinatorDisplayName(record.bankrupt_declared_by)}` : 'Declared'}
              {record.bankrupt_declared_at ? ` on ${formatDate(record.bankrupt_declared_at.slice(0, 10))}` : ''}.
              This customer is held out of every list and total in Active Payments and Overdue, and appears
              only in the Bankrupt register.
            </p>
            {record.bankrupt_note && (
              <p className="mt-2 rounded border border-border/50 bg-background/60 p-2 text-xs">{record.bankrupt_note}</p>
            )}
            {canManageTeam ? (
              <Button variant="outline" size="sm" className="mt-3" disabled={isReinstating} onClick={reinstate}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                {isReinstating ? 'Reinstating…' : 'Reinstate for follow-up'}
              </Button>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Only your team leader or the administrator can reinstate this.</p>
            )}
          </div>
        )}
        {noFollowup && noFollowupControl}
      </div>
    )
  }

  // A request already waiting: say so, and do not take a second one.
  const pending = pendingDecisionFor(target)
  if (pending) {
    const label = pending.kind === 'bankrupt' ? 'Bankrupt' : pending.kind === 'dispute' ? 'Dispute' : 'No follow-up'
    return (
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm" data-testid="account-decisions">
        <p className="font-semibold text-blue-700 dark:text-blue-400">Waiting for approval: {label}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Asked by {getCoordinatorDisplayName(pending.requestedBy)} on {formatDate(pending.requestedAt.slice(0, 10))}.
          Nothing changes until the team leader or the administrator approves it
          {canManageTeam ? ' — in Overview → Approvals.' : '.'}
        </p>
        <p className="mt-2 rounded border border-border/50 bg-background/60 p-2 text-xs">{pending.reason}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4" data-testid="account-decisions">
      <div>
        <p className="text-sm font-medium">Still worth chasing?</p>
        <p className="text-xs text-muted-foreground">
          If not, stop the follow-up, mark it as in dispute, or declare the company bankrupt — with the reason.
          Each takes this customer out of the lists and out of what is owed, in Active Payments and Overdue both
          {canManageTeam ? '.' : ' — once your team leader approves it.'}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {noFollowupControl}
        <NoFollowupControl
          entityType={entityType}
          entityId={entityId}
          bpCode={bpCode}
          name={name}
          amount={amount}
          record={record}
          currentUserId={currentUserId}
          isAdmin={canManageTeam}
          kind="dispute"
          onChanged={onChanged}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
          onClick={() => setIsBankruptOpen(true)}
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Declare bankrupt
        </Button>
      </div>

      <DeclareBankruptDialog
        target={{ ...target, name, amount }}
        open={isBankruptOpen}
        onOpenChange={setIsBankruptOpen}
        declaredBy={currentUserId}
        canManageTeam={canManageTeam}
        onDeclared={onChanged}
      />
    </div>
  )
}
