import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { reinstateBankruptCustomer } from '@/lib/no-followup-api'
import { listBankruptCustomers, type BankruptCustomer } from '@/lib/no-followup'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Company, OverduePayment } from '@/lib/types'

interface Props {
  payments: OverduePayment[]
  /** Active Payments records, so each customer's held-out invoices can be shown. */
  companies?: Company[]
  /** Who is looking; needed to record who reversed a declaration. */
  currentUserId?: string
  /**
   * Team leader or admin, who may reinstate any declaration. A coordinator
   * sees their own accounts and reinstates only what they declared.
   */
  canManageTeam?: boolean
  onChanged?: () => void
}

/**
 * Every company the team has declared bankrupt — and the only place they appear.
 *
 * Since 11 Sept 2026 a bankrupt customer is held out the way no follow-up is:
 * gone from Active Payments, from Overdue, and from every total and count on
 * every screen. So this register is where the list and the money live, with
 * who decided each and why.
 *
 * Read from both books: a customer declared from an invoice before the ageing
 * report lists them has no ageing row, and would otherwise be held out of the
 * totals without being listed anywhere.
 *
 * The ageing balance and the customer's open invoices are shown side by side,
 * never added together: the two books describe the same debt, and summing them
 * would count it twice.
 */
export function BankruptRegister({ payments, companies = [], currentUserId, canManageTeam = true, onChanged }: Props) {
  const navigate = useNavigate()
  const [undoing, setUndoing] = useState<string | null>(null)

  const declared = useMemo(() => listBankruptCustomers(companies, payments), [companies, payments])

  const onAgeingReport = declared.some((entry) => entry.ageingBalance !== null)
  const ageingTotal = declared.reduce((sum, entry) => sum + (entry.ageingBalance ?? 0), 0)
  const invoiceCount = declared.reduce((sum, entry) => sum + entry.invoices, 0)
  const invoiceTotal = declared.reduce((sum, entry) => sum + entry.invoiceAmount, 0)

  const reinstate = async (entry: BankruptCustomer) => {
    if (!currentUserId) return
    setUndoing(entry.key)
    try {
      await reinstateBankruptCustomer(
        { entityType: entry.entityType, entityId: entry.entityId, bpCode: entry.bpCode },
        currentUserId
      )
      toast.success(`${entry.name} is back in Active Payments, Overdue and the totals.`)
      onChanged?.()
    } catch (err) {
      toast.error('Not reinstated.', { description: err instanceof Error ? err.message : 'Try again in a moment.' })
    } finally {
      setUndoing(null)
    }
  }

  const open = (entry: BankruptCustomer) =>
    navigate(entry.entityType === 'overdue_payment' ? `/overdue?payment=${entry.entityId}` : `/companies?company=${entry.entityId}`)

  if (declared.length === 0) {
    return (
      <GlassCard className="p-12 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <h3 className="mt-4 text-lg font-semibold">No company has been declared bankrupt</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          When a coordinator finds that a customer has gone under, they declare it in the follow-up
          section of the account, in Active Payments or Overdue. It then leaves every list and total, and
          appears here, with who made the call and why.
        </p>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-4" data-testid="bankrupt-register">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <h3 className="text-lg font-semibold">Declared bankrupt</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {declared.length} {declared.length === 1 ? 'company' : 'companies'}
          {/* Only when some of them are on it: "₹0 on the ageing report" reads as a balance. */}
          {onAgeingReport && (
            <>
              {' '}· <span className="font-medium text-foreground">{formatCurrency(ageingTotal)}</span> on the
              ageing report
            </>
          )}
          {invoiceCount > 0 && (
            <>
              {' '}· <span className="font-medium text-foreground">{formatCurrency(invoiceTotal)}</span> in{' '}
              {invoiceCount} open {invoiceCount === 1 ? 'invoice' : 'invoices'}
            </>
          )}{' '}
          · held out of every total
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/50">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Ageing balance</TableHead>
              <TableHead>Active Payments</TableHead>
              <TableHead>Declared by</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Undo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {declared.map((entry) => {
              const mayUndo = Boolean(currentUserId) && (canManageTeam || entry.by === currentUserId)
              return (
                <TableRow key={entry.key} className="border-border">
                  <TableCell>
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => open(entry)}>
                      {entry.name}
                      <ExternalLink className="ml-1.5 inline h-3 w-3 text-muted-foreground" />
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {entry.bpCode && <span className="font-mono">{entry.bpCode}</span>}
                      {entry.bpCode && ' · '}
                      {entry.coordinatorId ? getCoordinatorDisplayName(entry.coordinatorId) : 'Unassigned'}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-rose-500">
                    {entry.ageingBalance === null ? (
                      <span className="font-normal text-muted-foreground">Not on the report</span>
                    ) : (
                      formatCurrency(entry.ageingBalance)
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.invoices > 0 ? (
                      <>
                        <span className="font-medium text-foreground">{formatCurrency(entry.invoiceAmount)}</span>
                        <div className="text-xs">
                          {entry.invoices} open {entry.invoices === 1 ? 'invoice' : 'invoices'}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.by ? getCoordinatorDisplayName(entry.by) : '-'}
                    {entry.at && <div className="text-xs text-muted-foreground">{formatDate(entry.at.slice(0, 10))}</div>}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {entry.note || <span className="text-muted-foreground/50">None given</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {mayUndo ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={undoing === entry.key}
                        onClick={() => reinstate(entry)}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {undoing === entry.key ? 'Undoing…' : 'Reinstate'}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Team leader</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  )
}
