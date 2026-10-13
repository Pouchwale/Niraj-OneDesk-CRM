/**
 * Dashboard: how much money is set aside, by reason - No follow-up, Dispute,
 * Export client, Bankrupt. The team leader and the administrator see the whole
 * team; a coordinator sees only their own customers (the server sends them
 * nothing else). Counted once per customer: the ageing balance where the
 * customer has an Overdue row, otherwise their open invoices.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellOff, Globe, Scale } from 'lucide-react'

import { KpiCard } from '@/components/shared/KpiCard'
import { normalizeBpCode } from '@/lib/bp-code'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { isNoFollowup, listBankruptCustomers, setAsideKindOf, type SetAsideKind } from '@/lib/no-followup'
import type { Company, OverduePayment } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

export interface SetAsideTotals {
  plain: { customers: number; amount: number }
  dispute: { customers: number; amount: number }
  export: { customers: number; amount: number }
  bankrupt: { customers: number; amount: number }
}

/** Money set aside by reason, once per customer. */
export function setAsideTotals(companies: Company[], overduePayments: OverduePayment[]): SetAsideTotals {
  const empty = () => ({ ageing: new Map<string, number>(), invoices: new Map<string, number>() })
  const books: Record<'plain' | SetAsideKind, ReturnType<typeof empty>> = { plain: empty(), dispute: empty(), export: empty() }
  for (const p of overduePayments) {
    if (!isNoFollowup(p)) continue
    const key = normalizeBpCode(p.bp_code) ?? `ageing:${p.id}`
    const book = books[setAsideKindOf(p)].ageing
    book.set(key, (book.get(key) ?? 0) + (p.balance_due ?? 0))
  }
  for (const c of companies) {
    if (!isNoFollowup(c) || c.status === 'paid') continue
    const key = normalizeBpCode(c.sap_bp_code) ?? `company:${c.id}`
    const book = books[setAsideKindOf(c)].invoices
    book.set(key, (book.get(key) ?? 0) + (c.total_amount ?? 0))
  }
  const sum = ({ ageing, invoices }: ReturnType<typeof empty>) => {
    const customers = new Set([...ageing.keys(), ...invoices.keys()])
    let amount = 0
    for (const key of customers) amount += ageing.get(key) ?? invoices.get(key) ?? 0
    return { customers: customers.size, amount }
  }
  const bankrupt = listBankruptCustomers(companies, overduePayments)
  return {
    plain: sum(books.plain),
    dispute: sum(books.dispute),
    export: sum(books.export),
    bankrupt: {
      customers: bankrupt.length,
      amount: bankrupt.reduce((n, b) => n + (b.ageingBalance ?? b.invoiceAmount), 0),
    },
  }
}

export function SetAsideKpis({ teamView }: { teamView: boolean }) {
  // Re-read whenever the shared records change (some changes edit records in place).
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeToDemoStore(() => setVersion((v) => v + 1)), [])
  const t = useMemo(() => {
    void version
    return setAsideTotals(demoCompanyStore.getAllCompanies(), demoCompanyStore.getAllOverduePayments())
  }, [version])
  const hint = (n: number) => `${n} customer${n === 1 ? '' : 's'}${teamView ? ', whole team' : ''}`
  const link = (tab: string) => (teamView ? `/admin/overview?tab=${tab}` : undefined)

  return (
    <div className="space-y-4" data-testid="set-aside-kpis">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Set aside</h2>
        <span className="text-xs text-muted-foreground">{teamView ? 'All coordinators' : 'Your customers'} · not counted in what is owed</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        <KpiCard title="No follow-up" value={formatCurrency(t.plain.amount)} hint={hint(t.plain.customers)} icon={BellOff} color="amber" href={link('no-followup')} />
        <KpiCard title="Dispute" value={formatCurrency(t.dispute.amount)} hint={hint(t.dispute.customers)} icon={Scale} color="rose" href={link('dispute')} />
        <KpiCard title="Export client" value={formatCurrency(t.export.amount)} hint={hint(t.export.customers)} icon={Globe} color="blue" href={link('export')} />
        <KpiCard title="Bankrupt" value={formatCurrency(t.bankrupt.amount)} hint={hint(t.bankrupt.customers)} icon={AlertTriangle} color="violet" href={link('bankrupt')} />
      </div>
    </div>
  )
}
