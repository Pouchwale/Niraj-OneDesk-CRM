import { Fragment, useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronRight, ChevronUp, MessageSquarePlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AttentionChip, AttentionGroupRow, type PaymentsView } from '@/components/shared/attention-ui'
import { MoreRowsFooter, useProgressiveRows } from '@/components/shared/progressive-rows'
import { OwnerName } from '@/components/shared/OwnerFilter'
import { rowOwner } from '@/features/auth/AuthContext'
import { countByReason, groupStartingAt, sortByAttention, type Attention } from '@/lib/attention'
import {
  customerAttention,
  customerKeyOf,
  daysPastDue,
  groupCustomers,
  invoiceValue,
  type CustomerAccount,
} from '@/lib/customer-accounts'
import type { CompanyFollowupSummary } from '@/lib/followups-api'
import type { Company } from '@/lib/types'
import { cn, formatCurrency, formatDate, formatRelativeDate, todayISO } from '@/lib/utils'

type SortField = 'name' | 'totalAmount' | 'outstanding' | 'overdue' | 'overdueIn7Days' | 'maxDaysOverdue' | 'owner'

interface Props {
  /** The invoices left after the page's filters. */
  invoices: Company[]
  /** Every invoice this person can see, so a customer's last contact counts their paid invoices too. */
  allInvoices: Company[]
  view: PaymentsView
  resetKey: string
  search: string
  showOwner: boolean
  followupSummary: Map<string, CompanyFollowupSummary>
  /** Invoices with a promise that has been broken. */
  brokenPromiseIds?: Set<string>
  /** Opens the customer: `focus` on the invoice clicked, otherwise ready to log a follow-up. */
  onOpen: (invoice: Company, focus: boolean) => void
}

interface Contact {
  last: string | null
  committedDate: string | null
  committedAmount: number | null
}

export function CustomerInvoiceTable({ invoices, allInvoices, view, resetKey, search, showOwner, followupSummary, brokenPromiseIds, onOpen }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ field: SortField; asc: boolean } | null>(null)

  const contactByCustomer = useMemo(() => {
    const out = new Map<string, Contact>()
    for (const invoice of allInvoices) {
      const s = followupSummary.get(invoice.id)
      if (!s) continue
      const key = customerKeyOf(invoice)
      const held = out.get(key) ?? { last: null, committedDate: null, committedAmount: null }
      if (s.lastFollowupDate && (!held.last || s.lastFollowupDate > held.last)) held.last = s.lastFollowupDate
      if (s.nextCommittedDate && (!held.committedDate || s.nextCommittedDate < held.committedDate)) {
        held.committedDate = s.nextCommittedDate
        held.committedAmount = s.nextCommittedAmount
      }
      out.set(key, held)
    }
    return out
  }, [allInvoices, followupSummary])

  const attentionOf = useMemo(() => {
    const cache = new Map<string, Attention | null>()
    return (c: CustomerAccount) => {
      if (!cache.has(c.key)) cache.set(c.key, customerAttention(c))
      return cache.get(c.key) ?? null
    }
  }, [invoices])

  const customers = useMemo(() => {
    const grouped = groupCustomers(invoices)
    if (view === 'attention') return sortByAttention(grouped, attentionOf)
    if (!sort) return grouped
    const dir = sort.asc ? 1 : -1
    const value = (c: CustomerAccount): string | number => {
      if (sort.field === 'name') return c.name.toLowerCase()
      if (sort.field === 'owner') return rowOwner(c.lead).name.toLowerCase()
      return c[sort.field]
    }
    return [...grouped].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      return x === y ? 0 : x < y ? -dir : dir
    })
  }, [invoices, view, sort, attentionOf])

  const counts = useMemo(() => countByReason(customers, attentionOf), [customers, attentionOf])
  const progressive = useProgressiveRows(customers, { resetKey: `${resetKey}|${sort?.field}|${sort?.asc}` })
  const needle = search.trim().toLowerCase()
  const colSpan = showOwner ? 9 : 8
  const today = todayISO()

  const toggle = (key: string) =>
    setExpanded((held) => {
      const next = new Set(held)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const head = (field: SortField, label: string, right = false) => (
    <th
      className="cursor-pointer whitespace-nowrap px-2.5 py-3 font-medium hover:bg-muted/50"
      onClick={() => setSort((s) => (s?.field === field ? { field, asc: !s.asc } : { field, asc: field === 'name' || field === 'owner' }))}
    >
      <span className={cn('flex items-center gap-1', right && 'justify-end')}>
        {label}
        {sort?.field === field ? (sort.asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
      </span>
    </th>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" data-testid="customer-table">
        <thead className="border-b border-border/50 bg-muted/30 text-xs uppercase text-muted-foreground">
          <tr>
            {head('name', 'Customer')}
            {head('totalAmount', 'Total Amount', true)}
            {head('outstanding', 'Outstanding', true)}
            {head('overdue', 'Overdue', true)}
            {head('overdueIn7Days', 'In 7 days', true)}
            {head('maxDaysOverdue', 'Days Overdue')}
            {showOwner && head('owner', 'Coordinator')}
            <th className="whitespace-nowrap px-2.5 py-3 font-medium">Last Follow-Up</th>
            <th className="sticky right-0 bg-muted px-2.5 py-3"><span className="sr-only">Follow-up</span></th>
          </tr>
        </thead>
        <tbody>
          {progressive.visible.map((customer, index) => {
            const matchedInvoice = needle.length > 0 && customer.invoices.some((i) => i.invoice_no?.toLowerCase().includes(needle))
            const isOpen = expanded.has(customer.key) !== matchedInvoice
            const attention = view === 'attention' ? attentionOf(customer) : null
            const group = view === 'attention' ? groupStartingAt(customers, index, attentionOf) : null
            const contact = contactByCustomer.get(customer.key)
            const broken = customer.invoices.some((i) => brokenPromiseIds?.has(i.id))
            const dueToday = customer.invoices.some((i) => i.due_date?.slice(0, 10) === today)
            const owner = rowOwner(customer.lead)
            const people = [customer.lead.contact_person, customer.lead.payment_terms].filter(Boolean).join(' · ')
            return (
              <Fragment key={customer.key}>
                {group && <AttentionGroupRow reason={group} count={counts[group]} colSpan={colSpan} />}
                <tr
                  className={cn(
                    'cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/20',
                    broken && 'border-l-4 border-l-rose-500 bg-rose-500/5',
                    dueToday && !broken && 'border-l-4 border-l-amber-500 bg-amber-500/5'
                  )}
                  onClick={() => toggle(customer.key)}
                  aria-expanded={isOpen}
                  data-testid="customer-row"
                  data-code={customer.code ?? ''}
                >
                  <td className="min-w-56 px-2.5 py-2.5">
                    <div className="flex items-start gap-2">
                      {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {customer.code && <span className="font-mono">{customer.code} · </span>}
                          <span data-cell="invoices">{customer.invoices.length}</span> invoice{customer.invoices.length === 1 ? '' : 's'}
                        </div>
                        {people && <div className="text-xs text-muted-foreground">{people}</div>}
                        {attention && <AttentionChip attention={attention} className="mt-1 block w-fit" />}
                      </div>
                    </div>
                  </td>
                  <td data-cell="total" className="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums">{formatCurrency(customer.totalAmount)}</td>
                  <td data-cell="outstanding" className="whitespace-nowrap px-2.5 py-2.5 text-right font-medium tabular-nums">{formatCurrency(customer.outstanding)}</td>
                  <td data-cell="overdue" className={cn('whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums', customer.overdue > 0 && 'font-semibold text-rose-600 dark:text-rose-400')}>{formatCurrency(customer.overdue)}</td>
                  <td data-cell="soon" className={cn('whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums', customer.overdueIn7Days > 0 && 'font-medium text-amber-700 dark:text-amber-400')}>{formatCurrency(customer.overdueIn7Days)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2.5">
                    <div data-cell="days">
                      {customer.maxDaysOverdue > 0 ? <span className="font-medium text-rose-600 dark:text-rose-400">{customer.maxDaysOverdue} days</span> : '-'}
                    </div>
                    <Badge variant={customer.status === 'overdue' || customer.status === 'critical' ? 'destructive' : 'outline'} className="mt-1 capitalize">{customer.status}</Badge>
                  </td>
                  {showOwner && <td className="whitespace-nowrap px-2.5 py-2.5"><OwnerName name={owner.name} inCrm={owner.inCrm} /></td>}
                  <td className="whitespace-nowrap px-2.5 py-2.5">
                    <div>{contact?.last ? formatRelativeDate(contact.last) : 'Never'}</div>
                    {contact?.committedDate && (
                      <div className="text-xs text-muted-foreground">
                        Promised {formatDate(contact.committedDate)}
                        {contact.committedAmount ? ` · ${formatCurrency(contact.committedAmount)}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="sticky right-0 bg-background/95 px-2.5 py-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 whitespace-nowrap"
                      data-testid="customer-followup"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(customer.lead, false)
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Follow-up
                    </Button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-border/50 bg-muted/15" data-testid="customer-invoices-row">
                    <td colSpan={colSpan} className="px-4 py-3 pl-10">
                      <div className="overflow-x-auto rounded-md border border-border/60 bg-background/60">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 uppercase text-muted-foreground">
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
                              const days = daysPastDue(invoice.due_date, today)
                              return (
                                <tr key={invoice.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onOpen(invoice, true)} data-testid="invoice-row">
                                  <td className="whitespace-nowrap px-3 py-2 font-mono">{invoice.invoice_no || '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{invoice.invoice_date ? formatDate(invoice.invoice_date) : '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{invoice.due_date ? formatDate(invoice.due_date) : '-'}</td>
                                  <td className={cn('whitespace-nowrap px-3 py-2', days > 0 && 'font-medium text-rose-600 dark:text-rose-400')}>{days > 0 ? `${days} days` : '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatCurrency(invoiceValue(invoice))}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(invoice.total_amount || 0)}</td>
                                  <td className="px-3 py-2"><Badge variant="outline" className="capitalize">{invoice.status}</Badge></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          <MoreRowsFooter state={progressive} colSpan={colSpan} />
          {customers.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">No customers found matching your criteria.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
