import { useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { billLines, billTotals, creditsFor } from '@/lib/active-credits'
import { demoCompanyStore } from '@/lib/demo-companies'
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

/**
 * The customer's figures the way SAP's Bill Wise Details adds them up (28 Nov 2026, the user):
 * the unadjusted credits (payments, journal entries) come off what is outstanding and overdue.
 */
function sapFigures(customer: CustomerAccount) {
  const credits = creditsFor(customer, demoCompanyStore.getActiveCredits())
  const lines = billLines(customer.invoices, credits)
  const totals = billTotals(lines)
  const creditNote = totals.credits < 0 ? ` · credits ${formatCurrency(totals.credits)}` : ''
  return {
    lines,
    totals,
    outstanding: totals.pending,
    overdue: Math.max(0, Math.round((customer.overdue + totals.credits) * 100) / 100),
    creditNote,
  }
}

/** The three figures a coordinator chases, as the user named them (21 Nov 2026); credits taken off like SAP (28 Nov 2026). */
export function CustomerFollowupFigures({ customer }: { customer: CustomerAccount }) {
  const sap = sapFigures(customer)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="customer-followup-figures">
      <Figure label="Overdue" value={sap.overdue} note={`${count(customer.overdueInvoices)}${sap.creditNote}`} tone="rose" />
      <Figure label="Total Outstanding" value={sap.outstanding} note={`${count(customer.invoices.length)}${sap.creditNote}`} />
      <Figure label="Overdue in 7 days" value={customer.overdueIn7Days} note={count(customer.overdueIn7DaysInvoices)} tone="amber" />
    </div>
  )
}

const money = (n: number | null) => (n === null ? '—' : formatCurrency(n))

/** The customer's four figures and every open invoice under them. */
export function CustomerInvoicesCard({
  customer,
  actorId,
  focusInvoiceId,
  onChanged,
  pickedIds = null,
  onPick,
}: {
  customer: CustomerAccount
  actorId?: string
  /** The invoice the person clicked, opened on arrival. */
  focusInvoiceId?: string | null
  onChanged?: () => void
  /** The invoices ticked for the reminder's table; null is all of them. */
  pickedIds?: string[] | null
  onPick?: (ids: string[] | null) => void
}) {
  const [openId, setOpenId] = useState<string | null>(focusInvoiceId ?? null)
  const allIds = customer.invoices.map((i) => i.id)
  const ticked = new Set(pickedIds ?? allIds)
  const tickedCount = allIds.filter((id) => ticked.has(id)).length
  const toggle = (id: string) => {
    const next = ticked.has(id) ? allIds.filter((x) => ticked.has(x) && x !== id) : allIds.filter((x) => ticked.has(x) || x === id)
    onPick?.(next.length === allIds.length ? null : next)
  }
  const sap = sapFigures(customer)
  return (
    <div className="space-y-4" data-testid="customer-invoices">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Total Amount" value={sap.totals.gross} note="Gross amount, credits included (as SAP)" />
        <Figure label="Total Outstanding" value={sap.outstanding} note={`${count(customer.invoices.length)}${sap.creditNote}`} />
        <Figure label="Overdue" value={sap.overdue} note={`${count(customer.overdueInvoices)}${sap.creditNote}`} tone="rose" />
        <Figure label="Overdue in 7 days" value={customer.overdueIn7Days} note={count(customer.overdueIn7DaysInvoices)} tone="amber" />
      </div>
      {onPick && (
        <p className="text-xs text-muted-foreground" data-testid="customer-invoices-picked">
          Tick the invoices to send in the reminder table: {tickedCount} of {allIds.length} ticked.
        </p>
      )}
      <div className="max-h-72 overflow-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted uppercase text-muted-foreground">
            <tr>
              {onPick && (
                <th className="w-8 py-2 pl-3">
                  <input
                    type="checkbox"
                    aria-label="Tick all invoices"
                    className="h-4 w-4 cursor-pointer accent-primary"
                    checked={tickedCount === allIds.length}
                    ref={(box) => {
                      if (box) box.indeterminate = tickedCount > 0 && tickedCount < allIds.length
                    }}
                    onChange={() => onPick(tickedCount === allIds.length ? [] : null)}
                    data-testid="customer-invoice-tick-all"
                  />
                </th>
              )}
              {/* SAP's Bill Wise Details columns (28 Nov 2026, the user). */}
              <th className="px-2 py-2 font-medium">Transaction type</th>
              <th className="px-2 py-2 font-medium">Ref No.</th>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Due on</th>
              <th className="px-2 py-2 font-medium">Overdue by days</th>
              <th className="px-2 py-2 text-right font-medium">Basic amount</th>
              <th className="px-2 py-2 text-right font-medium">TDS amount</th>
              <th className="px-2 py-2 text-right font-medium">Gross amount</th>
              <th className="px-2 py-2 text-right font-medium">Pending amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {sap.lines.map((line, n) => {
              const invoice = line.invoice
              if (!invoice) {
                // A credit line: shown and counted like SAP, never ticked for the reminder, never a task.
                return (
                  <tr key={`credit-${n}`} className="bg-emerald-500/5 text-muted-foreground" data-testid="customer-credit-row">
                    {onPick && <td className="py-2 pl-3" />}
                    <td className="whitespace-nowrap px-2 py-2">{line.type}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono">{line.refNo || '-'}</td>
                    <td className="whitespace-nowrap px-2 py-2">{line.date ? formatDate(line.date) : '-'}</td>
                    <td className="whitespace-nowrap px-2 py-2">-</td>
                    <td className="whitespace-nowrap px-2 py-2">-</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(line.basic)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(line.tds)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(line.gross)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-400">{money(line.pending)}</td>
                  </tr>
                )
              }
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
                    {onPick && (
                      <td className="py-2 pl-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Send invoice ${invoice.invoice_no || ''}`}
                          className="h-4 w-4 cursor-pointer accent-primary"
                          checked={ticked.has(invoice.id)}
                          onChange={() => toggle(invoice.id)}
                          data-testid="customer-invoice-tick"
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-2 py-2">
                      {isOpen ? <ChevronDown className="mr-1 inline h-3 w-3" /> : <ChevronRight className="mr-1 inline h-3 w-3" />}
                      {line.type}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono" title={invoice.status}>{invoice.invoice_no || '-'}</td>
                    <td className="whitespace-nowrap px-2 py-2">{invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}</td>
                    <td className="whitespace-nowrap px-2 py-2">{invoice.due_date ? formatDate(invoice.due_date) : '-'}</td>
                    <td className={cn('whitespace-nowrap px-2 py-2', days > 0 && 'font-medium text-rose-600 dark:text-rose-400')}>{days > 0 ? days : '-'}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(line.basic)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(line.tds)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{money(line.gross ?? invoiceValue(invoice))}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums">{formatCurrency(line.pending)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={onPick ? 10 : 9} className="space-y-3 bg-muted/20 p-3">
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
          <tfoot className="sticky bottom-0 border-t-2 border-border bg-muted font-semibold">
            <tr data-testid="customer-bill-totals">
              <td colSpan={onPick ? 8 : 7} className="px-2 py-2 text-right text-muted-foreground">Total</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatCurrency(sap.totals.gross)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatCurrency(sap.totals.pending)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
