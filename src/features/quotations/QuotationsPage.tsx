/**
 * Quotations: every quotation sent, kept in the CRM since 13 Oct 2026 (it used
 * to be the Quotation List workbook). A coordinator adds and works their own;
 * the team leader and the administrator see everyone's.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Download, FileText, Plus, Search, Trophy, XCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAssignableOwners, getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { PERFORMANCE, QUOTATION_STATUS_LABEL, followupCount } from '@/lib/quotations'
import type { Quotation, QuotationStatus } from '@/lib/types'
import { addDaysISO, cn, formatCurrency, formatDate, todayISO } from '@/lib/utils'
import { QuotationDialog } from './QuotationDialog'

export const STATUS_STYLE: Record<QuotationStatus, string> = {
  open: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  closed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  lost: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400',
}

type Period = 'month' | 'quarter' | 'year' | 'all'
const PERIODS: { id: Period; label: string; from: (today: string) => string | null }[] = [
  { id: 'month', label: 'This month', from: (t) => `${t.slice(0, 7)}-01` },
  { id: 'quarter', label: 'Last 3 months', from: (t) => addDaysISO(t, -91) },
  { id: 'year', label: 'This year', from: (t) => `${t.slice(0, 4)}-01-01` },
  { id: 'all', label: 'All', from: () => null },
]

const dayOf = (q: Quotation) => q.quotation_date ?? q.inquiry_date ?? q.created_at.slice(0, 10)

export function QuotationsPage() {
  const { user, canManageTeam } = useAuth()
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.quotations)
  const today = todayISO()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<QuotationStatus | 'all'>('all')
  const [period, setPeriod] = useState<Period>('all')
  const [owner, setOwner] = useState<string>('all')
  const [editing, setEditing] = useState<Quotation | 'new' | null>(null)

  const owners = useMemo(() => getAssignableOwners(), [])
  const nameOf = (q: Quotation) => (q.coordinator_id ? getCoordinatorDisplayName(q.coordinator_id) : q.coordinator_name ?? 'Unassigned')

  const inScope = useMemo(() => {
    const from = PERIODS.find((p) => p.id === period)!.from(today)
    const needle = search.trim().toLowerCase()
    return all.filter(
      (q) =>
        (!from || dayOf(q) >= from) &&
        (owner === 'all' || (owner === 'none' ? !q.coordinator_id : q.coordinator_id === owner)) &&
        (!needle ||
          q.customer_name.toLowerCase().includes(needle) ||
          (q.quotation_no ?? '').toLowerCase().includes(needle) ||
          (q.concern_person ?? '').toLowerCase().includes(needle) ||
          (q.sales_employee ?? '').toLowerCase().includes(needle))
    )
  }, [all, period, owner, search, today])
  const rows = useMemo(
    () =>
      inScope
        .filter((q) => status === 'all' || q.status === status)
        .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || (b.quotation_no ?? '').localeCompare(a.quotation_no ?? '')),
    [inScope, status]
  )

  const count = (s: QuotationStatus) => inScope.filter((q) => q.status === s).length
  const decided = count('closed') + count('lost')
  const winRate = decided ? Math.round((count('closed') / decided) * 100) : null

  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    downloadWorkbook(`Quotations ${today}.xlsx`, [
      {
        name: 'Quotations',
        rows: [
          ['Enquiry date', 'Coordinator', 'Customer', 'Concern person', 'Contact', 'Source', 'Quotation date', 'Sales employee', 'Quotation no', 'Follow-ups', 'Closing date', 'Status', 'Customer type', 'Performance', 'Amount', 'Lost remark'],
          ...rows.map((q) => [
            q.inquiry_date ?? '', nameOf(q), q.customer_name, q.concern_person ?? '', q.contact_number ?? '', q.source ?? '',
            q.quotation_date ?? '', q.sales_employee ?? '', q.quotation_no ?? '', followupCount(q), q.closing_date ?? '',
            QUOTATION_STATUS_LABEL[q.status], q.customer_type === 'new' ? 'New' : q.customer_type === 'existing' ? 'Existing' : '',
            PERFORMANCE[q.status], q.amount ?? '', q.lost_remark ?? '',
          ]),
        ],
      },
    ])
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Quotations" subtitle={canManageTeam ? 'Every quotation sent by the team' : 'The quotations you have sent'}>
        <Button variant="outline" onClick={download} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Excel
        </Button>
        <Button onClick={() => setEditing('new')} data-testid="quotation-new">
          <Plus className="mr-2 h-4 w-4" /> New quotation
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Quotations" value={inScope.length} icon={FileText} color="blue" hint={PERIODS.find((p) => p.id === period)!.label} />
        <KpiCard title="Open" value={count('open')} icon={Clock} color="amber" hint="Waiting on the customer" />
        <KpiCard title="Closed (won)" value={count('closed')} icon={Trophy} color="emerald" hint={winRate === null ? 'None decided yet' : `${winRate}% of decided quotations`} />
        <KpiCard title="Lost" value={count('lost')} icon={XCircle} color="rose" hint={decided ? `${100 - (winRate ?? 0)}% of decided quotations` : undefined} />
      </div>

      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="quotation-search" placeholder="Customer, quotation no, person" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'open', 'closed', 'lost'] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="h-8 px-3 text-xs" onClick={() => setStatus(s)}>
                {s === 'all' ? 'All' : QUOTATION_STATUS_LABEL[s]}
              </Button>
            ))}
            <select
              id="quotation-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {canManageTeam && (
              <select
                id="quotation-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="all">All coordinators</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
                <option value="none">Unassigned</option>
              </select>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {all.length === 0 ? 'No quotations yet. Use "New quotation" to add the first.' : 'No quotations match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="quotation-table">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Quotation</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  {canManageTeam && <th className="px-3 py-3 font-medium">Coordinator</th>}
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium">Sales employee</th>
                  <th className="px-3 py-3 text-right font-medium">Follow-ups</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((q) => (
                  <tr key={q.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setEditing(q)} data-testid="quotation-row">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-mono text-xs font-medium">{q.quotation_no ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{q.quotation_date ? formatDate(q.quotation_date) : '—'}</div>
                    </td>
                    <td className="min-w-[200px] px-3 py-3">
                      <div className="font-medium">{q.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[q.concern_person, q.customer_type === 'new' ? 'New customer' : q.customer_type === 'existing' ? 'Existing' : null].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    {canManageTeam && <td className={cn('whitespace-nowrap px-3 py-3', !q.coordinator_id && 'text-amber-600')}>{nameOf(q)}</td>}
                    <td className="whitespace-nowrap px-3 py-3">{q.source ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3">{q.sales_employee ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{followupCount(q)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{q.amount ? formatCurrency(q.amount) : '—'}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={STATUS_STYLE[q.status]}>
                        {QUOTATION_STATUS_LABEL[q.status]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      {q.closing_date ? formatDate(q.closing_date) : '—'}
                      {q.status === 'lost' && q.lost_remark && (
                        <div className="max-w-[220px] truncate" title={q.lost_remark}>
                          {q.lost_remark}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {editing && (
        <QuotationDialog
          quotation={editing === 'new' ? null : editing}
          all={all}
          canManageTeam={canManageTeam}
          currentUserId={user?.id ?? ''}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            toast.success(msg)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
