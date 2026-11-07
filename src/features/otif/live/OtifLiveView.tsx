/**
 * OTIF Analytics → Live file (7 Nov 2026): the OTIF-SCORE workbook, read as
 * last saved, analysed one week (Saturday to Friday, the company week) at a time. Pick the week
 * and the date that places an order in it (PO Closed Date by default, or PO
 * Due Date or SO Date); the page shows the OTIF score, the delay buckets, the
 * departments, each Relation Manager, the last 8 weeks and the orders with the
 * team's fields. OTIF % is the same sum as for an uploaded report: orders the
 * sheet marks OTIF Score YES ÷ all orders. Nothing is saved or imported.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Search } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  basisDate,
  byRelationManager,
  filterRows,
  latestWeekWithRows,
  liveSummary,
  NO_DEPARTMENT,
  NO_LIVE_FILTERS,
  NOT_CLOSED,
  NOT_SET,
  otifSheetRows,
  otifWeekLabel,
  rowsInWeek,
  WEEK_BASES,
  weeklyTrend,
  weekStartOf,
  type OtifLiveFilters,
  type OtifLiveRow,
  type WeekBasis,
} from '@/lib/otif-live'
import { DELAY_BUCKETS } from '@/lib/otif-schema'
import { addDays } from '@/lib/score-history'
import { cn, formatDate, todayISO } from '@/lib/utils'
import { CategoryBreakdown } from '../components/CategoryBreakdown'
import { DelayBucketChart } from '../components/DelayBucketChart'
import { OtifKpiCards } from '../components/OtifKpiCards'
import { OtifSourceCard } from './OtifSourceCard'
import { useOtifLive } from './useOtifLive'

const ALL = '__all'
const BASIS_KEY = 'crm.otif.weekBasis'
const EMPTY: OtifLiveRow[] = []

function readBasis(): WeekBasis {
  try {
    const saved = localStorage.getItem(BASIS_KEY)
    return saved === 'due' || saved === 'so' || saved === 'closed' ? saved : 'closed'
  } catch {
    return 'closed'
  }
}

function saveBasis(basis: WeekBasis): void {
  try {
    localStorage.setItem(BASIS_KEY, basis)
  } catch {
    /* a private window: the choice just is not remembered */
  }
}

const day = (iso: string | null) => (iso ? formatDate(iso) : '—')
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)
/** The OTIF score card's colours: above 85% green, above 70% amber, else red. */
const pctTone = (v: number | null) =>
  v === null ? 'text-muted-foreground' : v > 85 ? 'text-emerald-600 dark:text-emerald-400' : v > 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
const qty = (v: number | null) => (v === null ? '—' : v.toLocaleString('en-IN'))

const PAGE_SIZE = 20

function DelayDay({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const tone = value <= 0 ? 'text-emerald-600 dark:text-emerald-400' : value <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
  return <span className={cn('font-semibold', tone)}>{value > 0 ? `+${value}` : value}</span>
}

/** The team's fields in their order, with Department last; compact, so it fits a laptop screen without scrolling sideways. */
const ORDER_COLUMNS: { label: string; right?: boolean; cell: (r: OtifLiveRow) => ReactNode }[] = [
  { label: 'PO No.', cell: (r) => r.poNo },
  { label: 'SO No', cell: (r) => r.soNo ?? '—' },
  // Dates and the department may wrap onto two lines on a narrow laptop, so the table never needs a sideways scroll.
  { label: 'SO Date', cell: (r) => day(r.soDate) },
  { label: 'PO Due Date', cell: (r) => day(r.poDueDate) },
  { label: 'PO Closed Date', cell: (r) => (r.poClosedDate ? day(r.poClosedDate) : <span className="font-medium text-amber-600">Open</span>) },
  { label: 'Delay Day', right: true, cell: (r) => <DelayDay value={r.delayDays} /> },
  { label: 'Day Commited', right: true, cell: (r) => r.dayCommitted ?? '—' },
  { label: 'Customer Name', cell: (r) => <span className="block min-w-[130px] max-w-[220px]">{r.customerName ?? '—'}</span> },
  { label: 'Open Order Qty', right: true, cell: (r) => <span className="whitespace-nowrap">{qty(r.openOrderQty)}</span> },
  {
    label: 'OTIF Score',
    cell: (r) =>
      r.otifScore ? (
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.otifScore === 'YES' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400')}>
          {r.otifScore}
        </span>
      ) : (
        '—'
      ),
  },
  { label: 'Relation Manager', cell: (r) => r.relationManager ?? <span className="text-muted-foreground">—</span> },
  { label: 'Department', cell: (r) => r.department ?? '—' },
]

function OrdersTable({ rows }: { rows: OtifLiveRow[] }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  // A new week, filter or search starts again at the first page.
  useEffect(() => setPage(0), [rows])
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-border/50">
        <table className="w-full text-xs xl:text-[13px]" data-testid="otif-live-orders-table">
          <thead className="bg-muted/50 text-[11px] uppercase leading-tight text-muted-foreground">
            <tr>
              {ORDER_COLUMNS.map((c) => (
                <th key={c.label} className={cn('px-2 py-2 font-medium', c.right ? 'text-right' : 'text-left')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {shown.map((r, i) => (
              <tr key={`${r.poNo}-${page}-${i}`} className="align-top hover:bg-muted/30">
                {ORDER_COLUMNS.map((c) => (
                  <td key={c.label} className={cn('px-2 py-2 tabular-nums', c.right && 'text-right')}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={ORDER_COLUMNS.length} className="px-2 py-8 text-center text-muted-foreground">
                  No orders match the search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            Previous
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange, allLabel }: { label: string; value: string | null; options: string[]; onChange: (v: string | null) => void; allLabel: string }) {
  return (
    <div className="min-w-[170px] flex-1 space-y-1.5">
      <Label>{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function OtifLiveView({ sourceSwitch }: { sourceSwitch?: ReactNode }) {
  const live = useOtifLive()
  const { status, data: ready, reading, error } = live
  const today = todayISO()
  const [basis, setBasis] = useState<WeekBasis>(readBasis)
  const [week, setWeek] = useState(() => weekStartOf(today))
  const [filters, setFilters] = useState<OtifLiveFilters>(NO_LIVE_FILTERS)
  const [search, setSearch] = useState('')

  const rows = ready?.rows ?? EMPTY
  const basisLabel = WEEK_BASES.find((b) => b.id === basis)!.label

  const weekAll = useMemo(
    () =>
      rowsInWeek(rows, basis, week).sort(
        (a, b) => (basisDate(b, basis) ?? '').localeCompare(basisDate(a, basis) ?? '') || a.poNo.localeCompare(b.poNo, undefined, { numeric: true })
      ),
    [rows, basis, week]
  )
  const shown = useMemo(() => filterRows(weekAll, filters), [weekAll, filters])
  const summary = useMemo(() => liveSummary(shown), [shown])
  const managers = useMemo(() => byRelationManager(shown), [shown])
  // The trend follows the department and person chosen (not the delay filter, which would make every week 100% or 0%).
  const trend = useMemo(() => weeklyTrend(filterRows(rows, { ...filters, bucket: null }), basis, week, 8), [rows, filters, basis, week])
  const latest = useMemo(() => latestWeekWithRows(rows, basis, today), [rows, basis, today])

  // The week opens on this week; when it has no orders yet (on a Saturday, the first day of the company week,
  // it usually has none), on the latest week that has, until the viewer picks a week themselves.
  const [weekPicked, setWeekPicked] = useState(false)
  const pickWeek = (start: string) => {
    setWeekPicked(true)
    setWeek(start)
  }
  useEffect(() => {
    if (weekPicked || !ready || !latest) return
    const current = weekStartOf(today)
    setWeek(rowsInWeek(rows, basis, current).length > 0 ? current : latest)
  }, [weekPicked, ready, latest, rows, basis, today])

  const departments = useMemo(() => [...new Set(rows.map((r) => r.department ?? NO_DEPARTMENT))].sort(), [rows])
  const people = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.relationManager ?? NOT_SET))].filter((n) => n !== NOT_SET).sort()
    return rows.some((r) => !r.relationManager) ? [...names, NOT_SET] : names
  }, [rows])
  const bucketOptions = useMemo(() => [...DELAY_BUCKETS, ...(rows.some((r) => !r.poClosedDate) ? [NOT_CLOSED] : [])], [rows])

  const bucketData = useMemo(() => {
    const total = summary.totalPOs || 1
    const names = [...DELAY_BUCKETS, ...[NOT_CLOSED, 'Unknown'].filter((b) => summary.byBucket[b])]
    return names.map((b) => ({ bucket: b, count: summary.byBucket[b] || 0, percentage: ((summary.byBucket[b] || 0) / total) * 100 }))
  }, [summary])

  const needle = search.trim().toLowerCase()
  const tableRows = useMemo(
    () =>
      needle
        ? shown.filter((r) => [r.poNo, r.soNo, r.customerName, r.relationManager].some((v) => v && v.toLowerCase().includes(needle)))
        : shown,
    [shown, needle]
  )

  const filtersOn = Boolean(filters.department || filters.relationManager || filters.bucket)

  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    downloadWorkbook(`OTIF week of ${week} by ${basisLabel}.xlsx`, [{ name: 'OTIF', rows: otifSheetRows(tableRows) }])
  }

  const header = (
    <PageHeader
      title="OTIF Delivery Analytics"
      subtitle={
        ready
          ? `Live from the OTIF-SCORE file · ${ready.rows.length.toLocaleString('en-IN')} orders · one week at a time`
          : 'Live from the OTIF-SCORE file, one week at a time'
      }
    >
      {ready && (
        <Button variant="outline" size="sm" onClick={() => void download()} disabled={tableRows.length === 0}>
          <Download className="mr-2 h-4 w-4 text-emerald-500" /> Excel
        </Button>
      )}
    </PageHeader>
  )

  // The file, as Active and Overdue Payments show theirs: its state, Last sync, Auto-sync on save, Sync now.
  const sourceCard =
    status && status.configured ? (
      <OtifSourceCard
        status={status}
        data={ready}
        reading={reading}
        error={error}
        autoSync={live.autoSync}
        onAutoSync={live.setAutoSync}
        onSync={live.syncNow}
      />
    ) : null

  let body: ReactNode
  if (status && !status.configured) {
    body = (
      <GlassCard className="space-y-2 p-6 text-sm" data-testid="otif-live-not-connected">
        <p className="flex items-center gap-2 font-medium">
          <FileSpreadsheet className="h-4 w-4 text-primary" /> The live OTIF file is not connected
        </p>
        <p className="text-muted-foreground">
          Add <code className="font-mono">EXCEL_OTIF_PATH</code> to <code className="font-mono">.env.local</code> with the full path to the OTIF-SCORE workbook, then restart the CRM. Until then, “Uploaded file” above works as before.
        </p>
      </GlassCard>
    )
  } else if (!ready && (error || (status && !status.exists))) {
    body = (
      <GlassCard className="space-y-3 p-6 text-sm" data-testid="otif-live-error">
        <p className="flex items-center gap-2 font-medium text-rose-600">
          <AlertTriangle className="h-4 w-4" /> Could not read the OTIF file
        </p>
        <p className="text-muted-foreground">{error ?? status?.error ?? 'The file is not there.'}</p>
        <Button size="sm" variant="outline" onClick={live.syncNow} disabled={reading}>
          Try again
        </Button>
      </GlassCard>
    )
  } else if (!ready) {
    body = (
      <GlassCard className="flex flex-col items-center justify-center gap-3 p-12 text-center" data-testid="otif-live-loading">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm font-medium">Reading {status?.name ?? 'the OTIF file'}…</p>
        <p className="max-w-md text-xs text-muted-foreground">It holds tens of thousands of orders, so the first read takes a few seconds. After that the page opens at once, and Auto-sync reads each new save by itself.</p>
      </GlassCard>
    )
  } else {
    body = (
      <div className="space-y-6">

        <GlassCard className="flex flex-wrap items-end gap-4 p-4" data-testid="otif-live-controls">
          <div className="space-y-1.5">
            <Label htmlFor="otif-week">Week (Saturday to Friday)</Label>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => pickWeek(addDays(week, -7))} aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                id="otif-week"
                type="date"
                className="h-9 w-[150px]"
                value={week}
                onChange={(e) => e.target.value && pickWeek(weekStartOf(e.target.value))}
                title="Pick any day: its Saturday-to-Friday week is shown"
              />
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => pickWeek(addDays(week, 7))} aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs font-medium text-muted-foreground" data-testid="otif-week-label">
              {otifWeekLabel(week)}
            </p>
          </div>
          <div className="min-w-[170px] space-y-1.5">
            <Label>Week by</Label>
            <Select
              value={basis}
              onValueChange={(v) => {
                setBasis(v as WeekBasis)
                saveBasis(v as WeekBasis)
              }}
            >
              <SelectTrigger aria-label="Week by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_BASES.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">the date that puts an order in the week</p>
          </div>
          <FilterSelect label="Department" value={filters.department} options={departments} allLabel="All departments" onChange={(v) => setFilters((f) => ({ ...f, department: v }))} />
          <FilterSelect label="Relation Manager" value={filters.relationManager} options={people} allLabel="Everyone" onChange={(v) => setFilters((f) => ({ ...f, relationManager: v }))} />
          <FilterSelect label="Delay" value={filters.bucket} options={bucketOptions} allLabel="All orders" onChange={(v) => setFilters((f) => ({ ...f, bucket: v }))} />
          {filtersOn && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(NO_LIVE_FILTERS)}>
              Clear filters
            </Button>
          )}
        </GlassCard>

        {weekAll.length === 0 || shown.length === 0 ? (
          <GlassCard className="space-y-3 p-8 text-center text-sm" data-testid="otif-live-empty">
            <p className="font-medium">
              {weekAll.length === 0
                ? `No orders with a ${basisLabel} in ${otifWeekLabel(week)}.`
                : 'No orders this week match these filters.'}
            </p>
            {weekAll.length === 0 && latest && latest !== week && (
              <Button size="sm" variant="outline" onClick={() => pickWeek(latest)}>
                Go to the latest week with orders ({otifWeekLabel(latest)})
              </Button>
            )}
            {weekAll.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setFilters(NO_LIVE_FILTERS)}>
                Clear filters
              </Button>
            )}
          </GlassCard>
        ) : (
          <>
            <OtifKpiCards summary={summary} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <DelayBucketChart data={bucketData} />
              </div>
              <div className="lg:col-span-2">
                <CategoryBreakdown data={summary.byCategory} />
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {shown.length > 0 && (
            <GlassCard className="space-y-3 p-5" data-testid="otif-live-managers">
              <div>
                <h3 className="text-lg font-medium">By Relation Manager</h3>
                <p className="text-xs text-muted-foreground">{otifWeekLabel(week)} · click a name to see only their orders</p>
              </div>
              <div className="overflow-x-auto rounded-md border border-border/50">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Relation Manager</th>
                      <th className="px-3 py-2 text-right font-medium">Orders</th>
                      <th className="px-3 py-2 text-right font-medium">OTIF yes</th>
                      <th className="px-3 py-2 text-right font-medium">OTIF no</th>
                      <th className="px-3 py-2 text-right font-medium">OTIF %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {managers.map((m) => (
                      <tr key={m.name} className="cursor-pointer hover:bg-muted/30" onClick={() => setFilters((f) => ({ ...f, relationManager: m.name }))}>
                        <td className={cn('px-3 py-2 font-medium', m.name === NOT_SET && 'text-muted-foreground')}>{m.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.yes}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.no}</td>
                        <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', pctTone(m.pct))}>{pct(m.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          <GlassCard className={cn('space-y-3 p-5', shown.length === 0 && 'xl:col-span-2')} data-testid="otif-live-trend">
            <div>
              <h3 className="text-lg font-medium">Last 8 weeks</h3>
              <p className="text-xs text-muted-foreground">By {basisLabel}{filters.department || filters.relationManager ? ', for the department and person chosen' : ''} · click a week to open it</p>
            </div>
            <div className="space-y-1">
              {trend.map((t) => (
                <button
                  key={t.start}
                  type="button"
                  onClick={() => pickWeek(t.start)}
                  className={cn('w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/40', t.start === week && 'bg-primary/10')}
                >
                  <span className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem] items-center gap-3">
                    <span className="truncate">{otifWeekLabel(t.start)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{t.total} orders</span>
                    <span className={cn('text-right font-semibold tabular-nums', pctTone(t.pct))}>{pct(t.pct)}</span>
                  </span>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span className={cn('block h-full rounded-full', t.pct === null ? '' : t.pct > 85 ? 'bg-emerald-500' : t.pct > 70 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${t.pct ?? 0}%` }} />
                  </span>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>

        {shown.length > 0 && (
          <GlassCard className="space-y-4 p-5" data-testid="otif-live-orders">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium">Orders</h3>
                <p className="text-xs text-muted-foreground">
                  {otifWeekLabel(week)} by {basisLabel} · {tableRows.length.toLocaleString('en-IN')} of {weekAll.length.toLocaleString('en-IN')} orders
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="PO No., SO No, customer, manager" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
            <OrdersTable rows={tableRows} />
          </GlassCard>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      {sourceSwitch}
      {sourceCard}
      {body}
    </div>
  )
}
