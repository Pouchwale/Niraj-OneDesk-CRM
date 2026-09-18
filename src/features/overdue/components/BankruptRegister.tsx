import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { reinstateOverduePayment } from '@/lib/overdue-api'
import { normalizeBpCode } from '@/lib/bp-code'
import { isBankrupt } from '@/lib/no-followup'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Company, OverduePayment } from '@/lib/types'

interface Props {
  payments: OverduePayment[]
  /** Active Payments records, so each customer's held-out invoices can be shown. */
  companies?: Company[]
  /** Who is looking; needed to record who reversed a declaration. */
  currentUserId?: string
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
 * The ageing balance and the customer's open invoices are shown side by side,
 * never added together: the two books describe the same debt, and summing them
 * would count it twice.
 */
export function BankruptRegister({ payments, companies = [], currentUserId, onChanged }: Props) {
  const navigate = useNavigate()
  const [undoing, setUndoing] = useState<string | null>(null)

  const declared = useMemo(
    () =>
      payments
        .filter((payment) => payment.status === 'bankrupt')
        // Most recently declared first: the ones still being talked about.
        .sort((a, b) => (b.bankrupt_declared_at ?? '').localeCompare(a.bankrupt_declared_at ?? '')),
    [payments]
  )

  /** Each bankrupt customer's open invoices in Active Payments, by BP code. */
  const invoicesByCode = useMemo(() => {
    const byCode = new Map<string, { count: number; amount: number }>()
    for (const company of companies) {
      if (company.status === 'paid' || !isBankrupt(company)) continue
      const code = normalizeBpCode(company.sap_bp_code)
      if (!code) continue
      const entry = byCode.get(code) ?? { count: 0, amount: 0 }
      entry.count++
      entry.amount += company.total_amount || 0
      byCode.set(code, entry)
    }
    return byCode
  }, [companies])

  const ageingTotal = declared.reduce((sum, payment) => sum + (payment.balance_due || 0), 0)
  const invoiceCount = [...invoicesByCode.values()].reduce((sum, entry) => sum + entry.count, 0)
  const invoiceTotal = [...invoicesByCode.values()].reduce((sum, entry) => sum + entry.amount, 0)

  const reinstate = async (payment: OverduePayment) => {
    if (!currentUserId) return
    setUndoing(payment.id)
    try {
      await reinstateOverduePayment(payment.id, currentUserId)
      toast.success(`${payment.customer_name || payment.bp_code} is back in Active Payments, Overdue and the totals.`)
      onChanged?.()
    } catch {
      toast.error('That could not be undone. Try again in a moment.')
    } finally {
      setUndoing(null)
    }
  }

  if (declared.length === 0) {
    return (
      <GlassCard className="p-12 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <h3 className="mt-4 text-lg font-semibold">No company has been declared bankrupt</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          When a coordinator finds that a customer has gone under, they declare it on the account in
          Overdue Payments. It then leaves every list and total, and appears here, with who made the
          call and why.
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
          {declared.length} {declared.length === 1 ? 'company' : 'companies'} ·{' '}
          <span className="font-medium text-foreground">{formatCurrency(ageingTotal)}</span> on the
          ageing report
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
              <TableHead>Coordinator</TableHead>
              <TableHead>Declared by</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Undo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {declared.map((payment) => {
              const invoices = invoicesByCode.get(normalizeBpCode(payment.bp_code) ?? '')
              return (
                <TableRow key={payment.id} className="border-border">
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => navigate(`/overdue?payment=${payment.id}`)}
                    >
                      {payment.customer_name || payment.bp_code}
                      <ExternalLink className="ml-1.5 inline h-3 w-3 text-muted-foreground" />
                    </button>
                    <div className="font-mono text-xs text-muted-foreground">{payment.bp_code}</div>
                  </TableCell>
                  <TableCell className="font-medium text-rose-500">
                    {formatCurrency(payment.balance_due)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {invoices ? (
                      <>
                        <span className="font-medium text-foreground">{formatCurrency(invoices.amount)}</span>
                        <div className="text-xs">
                          {invoices.count} open {invoices.count === 1 ? 'invoice' : 'invoices'}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {payment.assigned_coordinator_id
                      ? getCoordinatorDisplayName(payment.assigned_coordinator_id)
                      : 'Unassigned'}
                  </TableCell>
                  <TableCell>
                    {payment.bankrupt_declared_by
                      ? getCoordinatorDisplayName(payment.bankrupt_declared_by)
                      : '-'}
                    {payment.bankrupt_declared_at && (
                      <div className="text-xs text-muted-foreground">
                        {formatDate(payment.bankrupt_declared_at.slice(0, 10))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {payment.bankrupt_note || <span className="text-muted-foreground/50">None given</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!currentUserId || undoing === payment.id}
                      onClick={() => reinstate(payment)}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      {undoing === payment.id ? 'Undoing…' : 'Reinstate'}
                    </Button>
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
