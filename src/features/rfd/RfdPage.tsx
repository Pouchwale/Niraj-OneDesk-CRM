/**
 * Ready for Dispatch: finished goods waiting in the warehouse with money still
 * to come, from the RFD sheet. Highest pending amount first. Each line belongs
 * to the customer's coordinator; follow-ups are logged on the customer's
 * Active or Overdue Payments record, so they count everywhere else too.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, Download, IndianRupee, PackageCheck, Search, Users } from 'lucide-react'

import { ExcelSourceCard } from '@/components/shared/ExcelSourceCard'
import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { OwnerFilter, OwnerName } from '@/components/shared/OwnerFilter'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { rowOwner, useAuth } from '@/features/auth/AuthContext'
import { FollowUpTimeline } from '@/features/companies/FollowUpTimeline'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { OWNER_ALL, matchesOwner, ownerOptions } from '@/lib/owner'
import type { RfdRow } from '@/lib/types'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type Age = 'all' | 'week' | 'month' | 'quarter' | 'older'
const AGES: { id: Age; label: string; test: (d: number) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'week', label: 'Up to 7 days', test: (d) => d <= 7 },
  { id: 'month', label: '8–30 days', test: (d) => d > 7 && d <= 30 },
  { id: 'quarter', label: '31–90 days', test: (d) => d > 30 && d <= 90 },
  { id: 'older', label: 'Over 90 days', test: (d) => d > 90 },
]

const ageTone = (days: number | null) =>
  days === null ? '' : days > 90 ? 'text-rose-600 font-semibold' : days > 30 ? 'text-amber-600 font-medium' : 'text-muted-foreground'

const qty = (r: RfdRow) => (r.rfd_qty === null ? '—' : `${r.rfd_qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${r.uom ?? ''}`.trim())

export function RfdPage() {
  const { user, canManageTeam, isAdmin } = useAuth()
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.rfdRows)
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [age, setAge] = useState<Age>('all')
  const owner = params.get('owner') ?? OWNER_ALL
  const openId = params.get('line')
  const [, refresh] = useState(0)

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === OWNER_ALL) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const beforeOwner = useMemo(() => {
    const q = search.trim().toLowerCase()
    const test = AGES.find((a) => a.id === age)!.test
    return all.filter(
      (r) =>
        test(r.days ?? 0) &&
        (!q ||
          r.customer_name.toLowerCase().includes(q) ||
          (r.bp_code ?? '').toLowerCase().includes(q) ||
          (r.sales_order ?? '').includes(q) ||
          (r.production_order ?? '').includes(q) ||
          (r.item_name ?? '').toLowerCase().includes(q))
    )
  }, [all, search, age])
  const ownerChoices = useMemo(() => ownerOptions(beforeOwner, rowOwner, (r) => r.pending_value), [beforeOwner])
  const rows = useMemo(
    () =>
      beforeOwner
        .filter((r) => matchesOwner(rowOwner(r), owner))
        // Highest pending amount first, then the longest waiting.
        .sort((a, b) => b.pending_value - a.pending_value || (b.days ?? 0) - (a.days ?? 0)),
    [beforeOwner, owner]
  )

  const pending = rows.reduce((s, r) => s + r.pending_value, 0)
  const customers = new Set(rows.map((r) => r.bp_code ?? r.customer_name)).size
  const oldest = rows.reduce((m, r) => Math.max(m, r.days ?? 0), 0)
  const open = all.find((r) => r.id === openId) ?? null

  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    downloadWorkbook(`Ready for Dispatch ${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: 'Ready for Dispatch',
        rows: [
          ['Customer', 'BP code', 'Coordinator', 'Sales order', 'Production order', 'Item code', 'Item', 'RFD qty', 'UoM', 'RFD value', 'Paid', 'Pending', 'Ready since', 'Days', 'Warehouse'],
          ...rows.map((r) => [
            r.customer_name, r.bp_code ?? '', rowOwner(r).name, r.sales_order ?? '', r.production_order ?? '', r.item_code ?? '', r.item_name ?? '',
            r.rfd_qty ?? '', r.uom ?? '', r.rfd_value, r.paid_1 + r.paid_2, r.pending_value, r.ready_since ?? '', r.days ?? '', r.warehouse ?? '',
          ]),
        ],
      },
    ])
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ready for Dispatch" subtitle="Goods ready in the warehouse with payment still pending, highest amount first">
        <Button variant="outline" onClick={download} disabled={rows.length === 0} data-testid="rfd-download">
          <Download className="mr-2 h-4 w-4" /> Excel
        </Button>
      </PageHeader>

      {canManageTeam && <ExcelSourceCard book="rfd" adminId={user?.id} onImported={() => refresh((v) => v + 1)} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Pending value" value={formatCurrency(pending)} icon={IndianRupee} color="rose" />
        <KpiCard title="Customers" value={customers} icon={Users} color="blue" />
        <KpiCard title="Lines ready" value={rows.length} icon={PackageCheck} color="emerald" />
        <KpiCard title="Longest waiting" value={oldest ? `${oldest} days` : '—'} icon={Clock} color="amber" />
      </div>

      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="rfd-search"
              placeholder="Customer, BP code, order or item"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AGES.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant={age === a.id ? 'default' : 'outline'}
                className="h-8 px-3 text-xs"
                onClick={() => setAge(a.id)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>

        {canManageTeam && <OwnerFilter value={owner} onChange={(v) => setParam('owner', v)} options={ownerChoices} rowNoun="line" />}

        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? canManageTeam
                ? 'Nothing imported yet. Connect the RFD workbook above and press Sync.'
                : 'Nothing ready for dispatch on your customers.'
              : 'No lines match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="rfd-table">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  {canManageTeam && <th className="px-3 py-3 font-medium">Coordinator</th>}
                  <th className="px-3 py-3 font-medium">Sales / production order</th>
                  <th className="px-3 py-3 font-medium">Item</th>
                  <th className="px-3 py-3 text-right font-medium">RFD qty</th>
                  <th className="px-3 py-3 text-right font-medium">RFD value</th>
                  <th className="px-3 py-3 text-right font-medium">Paid</th>
                  <th className="px-3 py-3 text-right font-medium">Pending</th>
                  <th className="px-3 py-3 font-medium">Ready since</th>
                  <th className="px-3 py-3 text-right font-medium">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setParam('line', r.id)} data-testid="rfd-row">
                    <td className="min-w-[230px] px-4 py-3">
                      <div className="font-medium">{r.customer_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.bp_code ?? 'Not in CRM'}</div>
                    </td>
                    {canManageTeam && (
                      <td className="px-3 py-3">
                        <OwnerName {...rowOwner(r)} />
                      </td>
                    )}
                    <td className="px-3 py-3 tabular-nums">
                      <div>SO {r.sales_order ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">PO {r.production_order ?? '—'}</div>
                    </td>
                    <td className="max-w-[240px] px-3 py-3">
                      <div className="truncate" title={r.item_name ?? ''}>{r.item_name ?? '—'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.item_code}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{qty(r)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.rfd_value)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{r.paid_1 + r.paid_2 ? formatCurrency(r.paid_1 + r.paid_2) : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatCurrency(r.pending_value)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{r.ready_since ? formatDate(r.ready_since) : '—'}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums', ageTone(r.days))}>{r.days ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <RfdPanel row={open} all={all} onClose={() => setParam('line', null)} currentUserId={user?.id} isAdmin={isAdmin || canManageTeam} />
    </div>
  )
}

function RfdPanel({
  row,
  all,
  onClose,
  currentUserId,
  isAdmin,
}: {
  row: RfdRow | null
  all: RfdRow[]
  onClose: () => void
  currentUserId?: string
  isAdmin: boolean
}) {
  const sameCustomer = row ? all.filter((r) => (row.bp_code ? r.bp_code === row.bp_code : r.customer_name === row.customer_name)) : []
  const customerPending = sameCustomer.reduce((s, r) => s + r.pending_value, 0)
  const facts: [string, string][] = row
    ? [
        ['Sales order', row.sales_order ?? '—'],
        ['Production order', `${row.production_order ?? '—'}${row.po_status ? ` (${row.po_status})` : ''}`],
        ['Item', `${row.item_name ?? '—'}${row.item_code ? ` · ${row.item_code}` : ''}`],
        ['Item group', row.item_group ?? '—'],
        ['Planned / ready qty', `${row.planned_qty?.toLocaleString('en-IN') ?? '—'} / ${qty(row)}`],
        ['SO rate', row.so_rate === null ? '—' : formatCurrency(row.so_rate)],
        ['RFD value', formatCurrency(row.rfd_value)],
        ['Paid', formatCurrency(row.paid_1 + row.paid_2)],
        ['Pending', formatCurrency(row.pending_value)],
        ['Ready since', row.ready_since ? `${formatDate(row.ready_since)} (${row.days ?? '?'} days)` : '—'],
        ['Warehouse', `${row.warehouse ?? '—'}${row.batches ? ` · ${row.batches} batch${row.batches === 1 ? '' : 'es'}` : ''}`],
      ]
    : []

  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {row && (
          <div className="space-y-6 p-6">
            <SheetHeader className="space-y-2">
              <SheetTitle className="text-2xl">{row.customer_name}</SheetTitle>
              <div className="flex flex-wrap gap-2">
                {row.bp_code && <Badge variant="outline" className="font-mono">{row.bp_code}</Badge>}
                <Badge variant="outline">Ready for dispatch</Badge>
                <Badge variant="outline" className="text-rose-600">{formatCurrency(row.pending_value)} pending</Badge>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-medium">{v}</p>
                </div>
              ))}
            </div>

            {sameCustomer.length > 1 && (
              <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                This customer has <b>{sameCustomer.length} lines</b> ready, <b>{formatCurrency(customerPending)}</b> pending in all.
              </p>
            )}

            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Follow-ups</h3>
              {row.anchor_id && row.anchor_type ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Logged on the customer's {row.anchor_type === 'overdue_payment' ? 'Overdue Payments' : 'Active Payments'} record, so they
                    also show in Follow-up history, Robi's tasks and the scores. Mention the sales order in your note.
                  </p>
                  <FollowUpTimeline
                    entityId={row.anchor_id}
                    entityType={row.anchor_type}
                    coordinatorId={currentUserId}
                    isAdmin={isAdmin}
                    companyTotalAmount={customerPending}
                  />
                </>
              ) : (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                  This customer isn't in Active or Overdue Payments under this name, so it has no coordinator and no record to log
                  follow-ups on. If it's the same company under a different name, ask for the name to match in SAP.
                </p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
