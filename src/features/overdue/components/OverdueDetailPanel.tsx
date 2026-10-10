import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { IndianRupee, User, Building2, Layers, CreditCard, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { FollowUpTimeline } from '@/features/companies/FollowUpTimeline'
import { getAllCoordinators, getCoordinatorDisplayName, rowOwner } from '@/features/auth/AuthContext'
import { OwnerName, ownerNameProps } from '@/components/shared/OwnerFilter'
import { reassignOverduePayment } from '@/lib/overdue-api'
import { getCompanies } from '@/lib/companies-api'
import { sameBpCode } from '@/lib/bp-code'
import { isNoFollowup, isSetAside } from '@/lib/no-followup'
import { oldestAgeingBand, summariseAgeing } from '@/lib/ageing'
import { clearFocusedRecord, setFocusedRecord } from '@/features/assistant/screen-context'
import { SendReminderDialog } from '@/features/messaging/SendReminderDialog'
import { AccountDecisions } from '@/components/shared/AccountDecisions'
import { formatCurrency, cn } from '@/lib/utils'
import type { OverduePayment, OverdueStatus } from '@/lib/types'

interface OverdueDetailPanelProps {
  payment: OverduePayment | null
  open: boolean
  onClose: () => void
  isAdmin?: boolean
  currentUserId?: string
  onChanged?: () => void
}

function statusColor(status: OverdueStatus) {
  switch (status) {
    case 'critical':
      return 'bg-rose-500/10 text-rose-500 border-rose-500/20'
    case 'overdue':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    case 'settled':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    case 'bankrupt':
      return 'bg-rose-500/15 text-rose-600 border-rose-500/40 dark:text-rose-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/**
 * The ageing breakdown, spelled out.
 *
 * Every figure is money still owed, split by how long it has been
 * outstanding - never an amount that has been collected. The caption and the
 * tie-out line below say so, because five bare numbers under five date ranges
 * can be read either way.
 */
function AgeingBreakdown({ payment }: { payment: OverduePayment }) {
  const ageing = summariseAgeing(payment)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-medium">Ageing Breakdown</h4>
        <p className="text-xs text-muted-foreground">
          Still unpaid, by how long it has been outstanding — not amounts collected.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {ageing.rows.map((bucket) => (
          <div
            key={bucket.key}
            className={cn(
              'rounded-lg border p-3 text-center',
              bucket.amount > 0 && bucket.isCritical
                ? 'border-rose-500/30 bg-rose-500/10'
                : 'border-border bg-muted/20'
            )}
          >
            <div className="text-[10px] uppercase leading-tight text-muted-foreground">{bucket.label}</div>
            <div
              className={cn(
                'mt-1 text-sm font-medium',
                bucket.amount > 0 && bucket.isCritical && 'text-rose-500'
              )}
            >
              {bucket.amount ? formatCurrency(bucket.amount) : '-'}
            </div>
          </div>
        ))}
      </div>

      {!ageing.hasBreakdown ? (
        <p className="text-xs text-muted-foreground">
          The ageing report carried no bucket columns for this customer, so the whole{' '}
          {formatCurrency(ageing.balance)} balance is shown above without a split.
        </p>
      ) : ageing.tiesOut ? (
        <p className="text-xs text-muted-foreground">
          Adds up to the {formatCurrency(ageing.total)} balance due, all of it outstanding.
        </p>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          These buckets add up to {formatCurrency(ageing.total)}, but the balance due is{' '}
          {formatCurrency(ageing.balance)} — {formatCurrency(Math.abs(ageing.difference))}{' '}
          {ageing.difference > 0 ? 'is not in any bucket' : 'more than the balance'}. Check the ageing
          report for this customer.
        </p>
      )}
    </div>
  )
}

export function OverdueDetailPanel({
  payment,
  open,
  onClose,
  isAdmin,
  currentUserId,
  onChanged,
}: OverdueDetailPanelProps) {
  const [isReassigning, setIsReassigning] = useState(false)
  const [showExtra, setShowExtra] = useState(false)
  const [isReminderOpen, setIsReminderOpen] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)
  /** Contact details borrowed from the company with the same BP code. */
  const [fallbackContact, setFallbackContact] = useState<{
    contact_person: string | null
    contact_number: string | null
    email: string | null
  } | null>(null)
  const coordinators = getAllCoordinators()

  // Tell the robot which balance is on screen, so it can speak to it.
  useEffect(() => {
    if (!open || !payment) return
    setFocusedRecord({
      type: 'overdue_payment',
      id: payment.id,
      name: payment.customer_name || payment.bp_code,
    })
    return () => clearFocusedRecord(payment.id)
  }, [open, payment])

  useEffect(() => {
    if (!open || !payment) return
    if (payment.contact_number || payment.email) {
      setFallbackContact(null)
      return
    }

    let cancelled = false
    getCompanies()
      .then((companies) => {
        if (cancelled) return
        const match = companies.find((c) => sameBpCode(c.sap_bp_code, payment.bp_code))
        setFallbackContact(
          match
            ? {
                contact_person: match.contact_person,
                contact_number: match.contact_number,
                email: match.email,
              }
            : null
        )
      })
      .catch(() => setFallbackContact(null))

    return () => {
      cancelled = true
    }
  }, [open, payment])

  if (!payment) return null

  const handleReassign = async (newCoordinatorId: string) => {
    try {
      setIsReassigning(true)
      await reassignOverduePayment(payment.id, newCoordinatorId, currentUserId ?? 'admin')
      toast.success('Overdue balance reassigned')
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reassign')
    } finally {
      setIsReassigning(false)
    }
  }

  const extraEntries = Object.entries(payment.extra_fields ?? {})

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6">
            <SheetHeader className="space-y-3">
              <SheetTitle className="flex items-center gap-2 text-2xl">
                <Building2 className="w-6 h-6 text-primary" />
                {payment.customer_name || payment.bp_code}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{payment.bp_code}</Badge>
                <Badge variant="outline" className={cn('uppercase text-xs', statusColor(payment.status))}>
                  {payment.status.replace('_', ' ')}
                </Badge>
                {isNoFollowup(payment) && (
                  <Badge variant="outline" className="uppercase text-xs border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    No follow-up
                  </Badge>
                )}
                {/* Nobody is chasing a customer set aside, so there is nobody to remind. */}
                {currentUserId && payment.status !== 'settled' && !isSetAside(payment) && (
                  <Button
                    size="sm"
                    className="ml-auto bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => setIsReminderOpen(true)}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send reminder
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <IndianRupee className="w-3.5 h-3.5" /> Balance Due
                </div>
                <div className="text-lg font-semibold text-rose-500">
                  {formatCurrency(payment.balance_due)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <CreditCard className="w-3.5 h-3.5" /> Payment Terms
                </div>
                <div>{payment.payment_terms || 'N/A'}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <User className="w-3.5 h-3.5" /> Coordinator
                </div>
                <OwnerName {...ownerNameProps(rowOwner(payment))} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Layers className="w-3.5 h-3.5" /> Department
                </div>
                <div>{payment.department || 'N/A'}</div>
              </div>
            </div>

            <AgeingBreakdown payment={payment} />

            {isAdmin && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Reassign Coordinator</h4>
                <Select
                  value={payment.assigned_coordinator_id ?? undefined}
                  onValueChange={handleReassign}
                  disabled={isReassigning}
                >
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Select a coordinator" />
                  </SelectTrigger>
                  <SelectContent>
                    {coordinators.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {extraEntries.length > 0 && (
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 text-muted-foreground"
                  onClick={() => setShowExtra((v) => !v)}
                >
                  {showExtra ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                  {extraEntries.length} additional column{extraEntries.length === 1 ? '' : 's'} from the source file
                </Button>
                {showExtra && (
                  <div className="grid grid-cols-2 gap-3 text-sm bg-muted/20 rounded-lg p-4">
                    {extraEntries.map(([key, value]) => (
                      <div key={key}>
                        <div className="text-xs text-muted-foreground">{key}</div>
                        <div>{String(value)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Separator className="bg-border/50" />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Follow-up Timeline</h3>
              <div className="min-h-[300px]">
                <FollowUpTimeline
                  entityId={payment.id}
                  entityType="overdue_payment"
                  coordinatorId={currentUserId}
                  isAdmin={isAdmin}
                  companyTotalAmount={payment.balance_due}
                  onFollowupSaved={onChanged}
                  refreshKey={timelineKey}
                  /*
                    Open to the coordinator who carries the account, not just to
                    whoever runs the team: they are the one who finds out the
                    company has gone under or is not worth chasing, and making
                    them wait is how a dead account stays on a list for months.
                    It is audited and named, and the team leader sees every
                    decision in the registers on the Overview.
                  */
                  decisions={
                    <AccountDecisions
                      entityType="overdue_payment"
                      entityId={payment.id}
                      bpCode={payment.bp_code}
                      name={payment.customer_name || payment.bp_code}
                      amount={payment.balance_due || 0}
                      record={payment}
                      currentUserId={currentUserId}
                      canManageTeam={isAdmin}
                      isSettled={payment.status === 'settled'}
                      onChanged={() => onChanged?.()}
                    />
                  }
                />
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>

      <SendReminderDialog
        open={isReminderOpen}
        onClose={() => setIsReminderOpen(false)}
        coordinatorId={currentUserId ?? ''}
        coordinatorName={currentUserId ? getCoordinatorDisplayName(currentUserId) : 'the team'}
        onSent={() => {
          setTimelineKey((k) => k + 1)
          onChanged?.()
        }}
        target={{
          entityType: 'overdue_payment',
          entityId: payment.id,
          customerName: payment.customer_name || payment.bp_code,
          contactPerson: payment.contact_person ?? fallbackContact?.contact_person,
          contactNumber: payment.contact_number ?? fallbackContact?.contact_number,
          email: payment.email ?? fallbackContact?.email,
          amount: payment.balance_due,
          paymentTerms: payment.payment_terms,
          bpCode: payment.bp_code,
          // Ageing buckets, not a due date, drive the tone: the oldest bucket
          // holding money sets how firm the reminder should be.
          daysOverdue: oldestAgeingBand(payment)?.fromDays ?? 0,
          isSettled: payment.status === 'settled',
        }}
      />
    </Sheet>
  )
}
