import { useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { daysPastDue, invoiceValue, type CustomerAccount } from '@/lib/customer-accounts'
import { RecalculateDueDate } from './RecalculateDueDate'

function Figure({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: 'rose' | 'amber' }) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border p-3',
        tone === 'rose' && 'border-rose-500/30 bg-rose-500/10',
        tone === 'amber' && 'border-amber-500/30 bg-amber-500/10',
        !tone && 'border-border bg-muted/30'
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-lg font-semibold tabular-nums',
          tone === 'rose' && 'text-rose-600 dark:text-rose-400',
          tone === 'amber' && 'text-amber-700 dark:text-amber-400'
        )}
        title={formatCurrency(value)}
      >
        {formatCurrency(value)}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  )
}

const count = (n: number) => `${n} invoice${n === 1 ? '' : 's'}`

/** The three figures a coordinator chases, as the user named them (21 Nov 2026). */
export function CustomerFollowupFigures({ customer }: { customer: CustomerAccount }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="customer-followup-figures">
      <Figure label="Overdue" value={customer.overdue} note={count(customer.overdueInvoices)} tone="rose" />
      <Figure label="Total Outstanding" value={customer.outstanding} note={count(customer.invoices.length)} />
      <Figure label="Overdue in 7 days" value={customer.overdueIn7Days} note={count(customer.overdueIn7DaysInvoices)} tone="amber" />
    </div>
  )
}

/** The customer's four figures and every open invoice under them. */
export function CustomerInvoicesCard({
  customer,
  actorId,
  focusInvoiceId,
  onChanged,
}: {
  customer: CustomerAccount
  actorId?: string
  /** The invoice the person clicked, opened on arrival. */
  focusInvoiceId?: string | null
  onChanged?: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(focusInvoiceId ?? null)
  return (
    <div className="space-y-4" data-testid="customer-invoices">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Total Amount" value={customer.totalAmount} note="Open invoices, full value" />
        <Figure label="Total Outstanding" value={customer.outstanding} note={count(customer.invoices.length)} />
        <Figure label="Overdue" value={customer.overdue} note={count(customer.overdueInvoices)} tone="rose" />
        <Figure label="Overdue in 7 days" value={customer.overdueIn7Days} note={count(customer.overdueIn7DaysInvoices)} tone="amber" />
      </div>
      <div className="max-h-72 overflow-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Invoice date</th>
              <th className="px-3 py-2 font-medium">Due date</th>
              <th className="px-3 py-2 font-medium">Days overdue</th>
              <th className="px-3 py-2 text-right font-medium">Invoice total</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {customer.invoices.map((invoice) => {
              const days = daysPastDue(invoice.due_date)
              const isOpen = openId === invoice.id
              const extra = Object.entries((invoice.extra_fields ?? {}) as Record<string, unknown>)
              return (
                <Fragment key={invoice.id}>
                  <tr
                    className={cn('cursor-pointer hover:bg-muted/30', isOpen && 'bg-muted/30')}
                    onClick={() => setOpenId(isOpen ? null : invoice.id)}
                    data-testid="customer-invoice-row"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {isOpen ? <ChevronDown className="mr-1 inline h-3 w-3" /> : <ChevronRight className="mr-1 inline h-3 w-3" />}
                      {invoice.invoice_no || '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{invoice.due_date ? formatDate(invoice.due_date) : '-'}</td>
                    <td className={cn('whitespace-nowrap px-3 py-2', days > 0 && 'font-medium text-rose-600 dark:text-rose-400')}>{days > 0 ? `${days} days` : '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatCurrency(invoiceValue(invoice))}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(invoice.total_amount || 0)}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="capitalize">{invoice.status}</Badge></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="space-y-3 bg-muted/20 p-3">
                        <RecalculateDueDate company={invoice} actorId={actorId} onChanged={() => onChanged?.()} />
                        {extra.length > 0 && (
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            {extra.map(([key, value]) => (
                              <div key={key}>
                                <p className="text-[11px] capitalize text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                                <p className="font-medium">{String(value) || 'N/A'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
