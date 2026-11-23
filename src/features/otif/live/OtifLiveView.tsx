/**
 * OTIF Analytics → Live file (7 Nov 2026): the OTIF-SCORE workbook, read as
 * last saved. Since 14 Nov 2026 it is analysed for any From–To dates (the
 * user asked for them in place of the Saturday-to-Friday week picker; each
 * person's last dates are remembered, this month so far on a first visit),
 * and "Save report" keeps the orders of those dates on the server to reopen
 * later (Saved reports; only the administrator deletes one). Pick the dates
 * and the date that places an order in them (PO Closed Date by default, or PO
 * Due Date or SO Date); the page shows the OTIF score, the delay buckets, the
 * departments, each Relation Manager, the last 8 weeks and the orders with the
 * team's fields. OTIF % is the same sum as for an uploaded report: orders the
 * sheet marks OTIF Score YES ÷ all orders. Nothing is imported into the records.
 */

import { useEffect, useMemo, useState, type ReactNode, useRef } from 'react'
import { AlertTriangle, FileDown, FileSpreadsheet, FolderOpen, Loader2, Save, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/AuthContext'
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
  otifRangeLabel,
  otifWeekLabel,
  rowsInRange,
  WEEK_BASES,
  weeklyTrend,
  weekStartOf,
  type OtifLiveFilters,
  type OtifLiveRow,
  type OtifSavedReport,
  type OtifSavedReportSummary,
  pickRangeDay,
  type WeekBasis,
} from '@/lib/otif-live'
import { isIsoDay } from '../../../../shared/otif-reports'
import { DELAY_BUCKETS } from '@/lib/otif-schema'
import { addDays } from '@/lib/score-history'
import { cn, formatDate, todayISO, truncatePercent } from '@/lib/utils'
import { CategoryBreakdown } from '../components/CategoryBreakdown'
import { DelayBucketChart } from '../components/DelayBucketChart'
import { OtifKpiCards } from '../components/OtifKpiCards'
import { OtifSourceCard } from './OtifSourceCard'
import { deleteOtifReport, getOtifReport, listOtifReports, saveOtifReport } from './otif-reports-api'
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
// Two decimals, cut not rounded (14 Nov 2026).
const pct = (v: number | null) => (v === null ? '—' : truncatePercent(v))
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

const RANGE_KEY = 'crm.otif.range'

/** The From–To dates this person used last; on a first visit, this month so far (the user's choice, 14 Nov 2026). */
function readRange(today: string): { from: string; to: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_KEY) ?? 'null') as { from?: unknown; to?: unknown } | null
    if (saved && isIsoDay(saved.from) && isIsoDay(saved.to) && saved.from <= saved.to) return { from: saved.from, to: saved.to }
  } catch {
    /* nothing remembered, or a private window */
  }
  return { from: `${today.slice(0, 8)}01`, to: today }
}

function saveRange(range: { from: string; to: string }): void {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify(range))
  } catch {
    /* a private window: the dates just are not remembered */
  }
}

/** How many Saturday-to-Friday weeks the dates touch (for a saved report's trend), at most 8. */
const weeksTouched = (from: string, to: string) =>
  Math.min(8, Math.round((Date.parse(`${weekStartOf(to)}T00:00:00Z`) - Date.parse(`${weekStartOf(from)}T00:00:00Z`)) / (7 * 86_400_000)) + 1)

/**
 * One date box. It holds what is being typed itself: the browser reports a day
 * or month of "0" as an empty date, and handing the old date straight back
 * reset the box, so 01-11-2026 could not be typed.
 */
function DateBox({ id, label, value, disabled, onDay, onFinish }: {
  id: string
  label: string
  value: string
  disabled: boolean
  onDay: (day: string, typing: boolean) => void
  onFinish: () => void
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const typing = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  return (
    <Input
      id={id}
      type="date"
      aria-label={label}
      className="h-9 w-[150px]"
      value={draft}
      disabled={disabled}
      onFocus={() => (focused.current = true)}
      onPointerDown={() => (typing.current = false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') onFinish()
        else typing.current = true
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.target.value) onDay(e.target.value, typing.current)
      }}
      onBlur={() => {
        focused.current = false
        typing.current = false
        setDraft(value)
        onFinish()
      }}
    />
  )
}

const savedWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function OtifLiveView({ sourceSwitch }: { sourceSwitch?: ReactNode }) {
  const live = useOtifLive()
  const { user, isAdmin } = useAuth()
  const { status, data: ready, reading, error } = live
  const today = todayISO()
  const [basis, setBasis] = useState<WeekBasis>(readBasis)
  // Any From–To dates (14 Nov 2026: in place of the Saturday-to-Friday week picker), remembered per person.
  const [range, setRangeState] = useState(() => readRange(today))
  const setRange = (next: { from: string; to: string }) => {
    setRangeState(next)
    saveRange(next)
  }
  // While a date is typed, each keystroke is a passing value (month "1" of "11"): the other date only follows once it is finished.
  const chooseDay = (edge: 'from' | 'to', day: string, typing: boolean) =>
    setRange(typing ? { ...range, [edge]: day } : pickRangeDay(range, edge, day, today))
  const finishDay = (edge: 'from' | 'to') => {
    if (range.from > range.to) setRange(pickRangeDay(range, edge, range[edge], today))
  }
  const [filters, setFilters] = useState<OtifLiveFilters>(NO_LIVE_FILTERS)
  const [search, setSearch] = useState('')
  // A saved report, when one is open: its orders, dates and basis stand in for the live file's.
  const [opened, setOpened] = useState<OtifSavedReport | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)

  const rows = opened ? opened.rows : ready?.rows ?? EMPTY
  const from = opened ? opened.from : range.from
  const to = opened ? opened.to : range.to
  const useBasis = opened ? opened.basis : basis
  const basisLabel = WEEK_BASES.find((b) => b.id === useBasis)!.label
  const datesLabel = otifRangeLabel(from, to)
  const validRange = isIsoDay(from) && isIsoDay(to) && from <= to

  const rangeAll = useMemo(
    () =>
      (validRange ? rowsInRange(rows, useBasis, from, to) : []).sort(
        (a, b) => (basisDate(b, useBasis) ?? '').localeCompare(basisDate(a, useBasis) ?? '') || a.poNo.localeCompare(b.poNo, undefined, { numeric: true })
      ),
    [rows, useBasis, from, to, validRange]
  )
  const shown = useMemo(() => filterRows(rangeAll, filters), [rangeAll, filters])
  const summary = useMemo(() => liveSummary(shown), [shown])
  const managers = useMemo(() => byRelationManager(shown), [shown])
  // The weeks up to the To date. The trend follows the department and person chosen (not the delay filter, which
  // would make every week 100% or 0%). A saved report only holds its own dates, so it shows only the weeks they touch.
  const trend = useMemo(
    () => (validRange ? weeklyTrend(filterRows(rows, { ...filters, bucket: null }), useBasis, weekStartOf(to), opened ? weeksTouched(from, to) : 8) : []),
    [rows, filters, useBasis, from, to, validRange, opened]
  )
  const latest = useMemo(() => (opened ? null : latestWeekWithRows(rows, useBasis, today)), [rows, useBasis, today, opened])

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
  const fileInfo = opened
    ? { name: opened.file.name, sheet: opened.file.sheet, savedAt: opened.file.savedAt, orders: opened.rows.length }
    : ready
      ? { name: ready.fileName, sheet: ready.sheetName, savedAt: ready.modifiedAt, orders: ready.rows.length }
      : null

  // The dates as a PDF report, with the filters on screen (the user's choice, 7 Nov 2026: a clear PDF, no Excel).
  const [makingPdf, setMakingPdf] = useState(false)
  const downloadPdf = async () => {
    if (!fileInfo) return
    setMakingPdf(true)
    try {
      const { downloadOtifPdf } = await import('./otif-report-pdf')
      await downloadOtifPdf({
        from,
        to,
        basisLabel,
        filters,
        file: fileInfo,
        rows: shown,
        summary,
        buckets: bucketData,
        managers,
        trend,
        generatedBy: user?.full_name ?? 'OneDesk CRM',
        savedReport: opened ? { name: opened.name, savedByName: opened.savedByName, savedAt: opened.savedAt } : null,
      })
    } catch (err) {
      toast.error('Could not make the PDF report.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setMakingPdf(false)
    }
  }

  const openReport = async (id: string) => {
    try {
      const report = await getOtifReport(id)
      setOpened(report)
      setFilters(report.filters ?? NO_LIVE_FILTERS)
      setSearch('')
      setListOpen(false)
    } catch (err) {
      toast.error('Could not open that report.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }
  const backToLive = () => {
    setOpened(null)
    setFilters(NO_LIVE_FILTERS)
    setSearch('')
  }

  const header = (
    <PageHeader
      title="OTIF Delivery Analytics"
      subtitle={
        opened
          ? `Saved report · ${opened.name}`
          : ready
            ? `Live from the OTIF-SCORE file · ${ready.rows.length.toLocaleString('en-IN')} orders · any dates you choose`
            : 'Live from the OTIF-SCORE file, for any dates you choose'
      }
    >
      <Button variant="outline" size="sm" onClick={() => setListOpen(true)} data-testid="otif-saved-list">
        <FolderOpen className="mr-2 h-4 w-4 text-sky-600" />
        Saved reports
      </Button>
      {ready && !opened && (
        <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} disabled={rangeAll.length === 0} data-testid="otif-save" title="Keep these dates' orders as a report that reopens the same later">
          <Save className="mr-2 h-4 w-4 text-emerald-600" />
          Save report
        </Button>
      )}
      {fileInfo && (
        <Button variant="outline" size="sm" onClick={() => void downloadPdf()} disabled={shown.length === 0 || makingPdf} data-testid="otif-pdf">
          {makingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4 text-violet-500" />}
          {makingPdf ? 'Preparing…' : 'PDF report'}
        </Button>
      )}
    </PageHeader>
  )

  // The file, as Active and Overdue Payments show theirs: its state, Last sync, Auto-sync on save, Sync now.
  const sourceCard =
    !opened && status && status.configured ? (
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

  const openedBanner = opened ? (
    <GlassCard className="flex flex-wrap items-center gap-3 border-sky-500/40 bg-sky-500/5 p-4 text-sm" data-testid="otif-opened">
      <FolderOpen className="h-4 w-4 text-sky-600" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Saved report: {opened.name}</p>
        <p className="text-xs text-muted-foreground">
          {otifRangeLabel(opened.from, opened.to)} by {basisLabel} · {opened.rows.length.toLocaleString('en-IN')} orders · saved by {opened.savedByName} on {savedWhen(opened.savedAt)} ·
          from {opened.file.name}. The orders are as they were when it was saved.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={backToLive}>
        Back to the live file
      </Button>
    </GlassCard>
  ) : null

  let body: ReactNode
  if (!opened && status && !status.configured) {
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
  } else if (!opened && !ready && (error || (status && !status.exists))) {
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
  } else if (!opened && !ready) {
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
        {openedBanner}

        <GlassCard className="flex flex-wrap items-end gap-4 p-4" data-testid="otif-live-controls">
          <div className="space-y-1.5">
            <Label htmlFor="otif-from">Dates</Label>
            <div className="flex items-center gap-2">
              <DateBox id="otif-from" label="From" value={from} disabled={Boolean(opened)} onDay={(day, typing) => chooseDay('from', day, typing)} onFinish={() => finishDay('from')} />
              <span className="text-xs text-muted-foreground">to</span>
              <DateBox id="otif-to" label="To" value={to} disabled={Boolean(opened)} onDay={(day, typing) => chooseDay('to', day, typing)} onFinish={() => finishDay('to')} />
            </div>
            <p className="text-xs font-medium text-muted-foreground" data-testid="otif-week-label">
              {validRange ? datesLabel : 'The From date is after the To date'}
            </p>
          </div>
          <div className="min-w-[170px] space-y-1.5">
            <Label>Orders by</Label>
            <Select
              value={useBasis}
              disabled={Boolean(opened)}
              onValueChange={(v) => {
                setBasis(v as WeekBasis)
                saveBasis(v as WeekBasis)
              }}
            >
              <SelectTrigger aria-label="Orders by">
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
            <p className="text-xs text-muted-foreground">the date that places an order in the dates</p>
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

        {rangeAll.length === 0 || shown.length === 0 ? (
          <GlassCard className="space-y-3 p-8 text-center text-sm" data-testid="otif-live-empty">
            <p className="font-medium">
              {!validRange
                ? 'Choose a From date on or before the To date.'
                : rangeAll.length === 0
                  ? `No orders with a ${basisLabel} in ${datesLabel}.`
                  : 'No orders in these dates match these filters.'}
            </p>
            {validRange && rangeAll.length === 0 && latest && (
              <Button size="sm" variant="outline" onClick={() => setRange({ from: latest, to: addDays(latest, 6) })}>
                Go to the latest week with orders ({otifWeekLabel(latest)})
              </Button>
            )}
            {rangeAll.length > 0 && (
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
                <p className="text-xs text-muted-foreground">{datesLabel} · click a name to see only their orders</p>
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

          {trend.length > 0 && (
            <GlassCard className={cn('space-y-3 p-5', shown.length === 0 && 'xl:col-span-2')} data-testid="otif-live-trend">
              <div>
                <h3 className="text-lg font-medium">{opened ? 'Week by week' : `Last ${trend.length} weeks`}</h3>
                <p className="text-xs text-muted-foreground">
                  Saturday to Friday, by {basisLabel}
                  {filters.department || filters.relationManager ? ', for the department and person chosen' : ''}
                  {opened ? ' · the saved dates only' : ' · click a week to choose its dates'}
                </p>
              </div>
              <div className="space-y-1">
                {trend.map((t) => (
                  <button
                    key={t.start}
                    type="button"
                    disabled={Boolean(opened)}
                    onClick={() => setRange({ from: t.start, to: addDays(t.start, 6) })}
                    className={cn(
                      'w-full rounded-md px-2 py-1.5 text-left text-sm enabled:hover:bg-muted/40 disabled:cursor-default',
                      t.start === from && addDays(t.start, 6) === to && 'bg-primary/10'
                    )}
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
          )}
        </div>

        {shown.length > 0 && (
          <GlassCard className="space-y-4 p-5" data-testid="otif-live-orders">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium">Orders</h3>
                <p className="text-xs text-muted-foreground">
                  {datesLabel} by {basisLabel} · {tableRows.length.toLocaleString('en-IN')} of {rangeAll.length.toLocaleString('en-IN')} orders
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
      <SavedReportsDialog open={listOpen} onOpenChange={setListOpen} isAdmin={isAdmin} openedId={opened?.id ?? null} onOpenReport={(id) => void openReport(id)} onDeleted={(id) => opened?.id === id && backToLive()} />
      {ready && (
        <SaveReportDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          defaultName={`OTIF ${datesLabel} by ${basisLabel}`}
          summary={`${datesLabel} by ${basisLabel} · ${rangeAll.length.toLocaleString('en-IN')} orders${filtersOn ? ' · the filters on screen are kept with it' : ''}`}
          onSave={async (name) => {
            await saveOtifReport({
              name,
              from,
              to,
              basis: useBasis,
              filters,
              file: { name: ready.fileName, sheet: ready.sheetName, savedAt: ready.modifiedAt },
              rows: rangeAll,
            })
            toast.success('OTIF report saved.', { description: `${name}. Open it any time from Saved reports.` })
          }}
        />
      )}
    </div>
  )
}

/** Names the report and keeps it. */
function SaveReportDialog({
  open,
  onOpenChange,
  defaultName,
  summary,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName: string
  summary: string
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])
  const save = async () => {
    setSaving(true)
    try {
      await onSave(name.trim() || defaultName)
      onOpenChange(false)
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save OTIF report</DialogTitle>
          <DialogDescription>{summary}. It reopens with these orders as they are now, even after the file changes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="otif-report-name">Name</Label>
          <Input id="otif-report-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !saving && void save()} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving} data-testid="otif-save-confirm">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Every saved report: open one; the administrator can delete one. */
function SavedReportsDialog({
  open,
  onOpenChange,
  isAdmin,
  openedId,
  onOpenReport,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  openedId: string | null
  onOpenReport: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const [reports, setReports] = useState<OtifSavedReportSummary[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const load = async () => {
    setProblem(null)
    try {
      setReports(await listOtifReports())
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not load the saved reports.')
    }
  }
  useEffect(() => {
    if (open) void load()
  }, [open])
  const remove = async (r: OtifSavedReportSummary) => {
    if (!window.confirm(`Delete the saved report "${r.name}"? This cannot be undone.`)) return
    try {
      await deleteOtifReport(r.id)
      toast.success('Saved report deleted.', { description: r.name })
      onDeleted(r.id)
      await load()
    } catch (err) {
      toast.error('Not deleted.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Saved OTIF reports</DialogTitle>
          <DialogDescription>Each one holds the orders of its dates as they were when it was saved.</DialogDescription>
        </DialogHeader>
        {problem ? (
          <p className="text-sm text-rose-600">{problem}</p>
        ) : !reports ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No saved reports yet. Choose the dates and press Save report.</p>
        ) : (
          <div className="max-h-[60vh] divide-y divide-border/50 overflow-y-auto rounded-md border border-border/50" data-testid="otif-saved-rows">
            {reports.map((r) => (
              <div key={r.id} className={cn('flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm', r.id === openedId && 'bg-primary/5')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {otifRangeLabel(r.from, r.to)} by {WEEK_BASES.find((b) => b.id === r.basis)?.label ?? r.basis} · {r.orders.toLocaleString('en-IN')} orders · saved by {r.savedByName} on {savedWhen(r.savedAt)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onOpenReport(r.id)}>
                  Open
                </Button>
                {isAdmin && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => void remove(r)} aria-label={`Delete ${r.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
