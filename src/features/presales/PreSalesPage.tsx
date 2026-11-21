/**
 * Pre Sales Analysis (14 Nov 2026): what each customer ordered in these months
 * last year, item by item, and which items they have not ordered yet this
 * year, so the coordinator can follow them up before their usual time. A
 * follow-up works like the Active/Overdue ones: the items talked about, how,
 * what the customer said, an expected order date and a next follow-up date.
 * Read from the Pre-Sales-Order-CRM workbook by the server, which sends a
 * coordinator only their customers; the team leader and administrator see
 * everyone. The page picks up each new save of the file.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, FileSpreadsheet, Loader2, PhoneCall, RefreshCw, Search, ShoppingCart, Users } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { analysePresales, defaultMonths, FOLLOWUP_HOLD_DAYS, monthName, monthWindows, windowLabel, type CustomerPreSales, type ItemState } from '@/lib/presales'
import { cn, formatDate, todayISO } from '@/lib/utils'
import { PRESALES_MODES, PRESALES_RESPONSES, type PresalesFollowup, type PresalesMode, type PresalesResponse, type PresalesResponseId } from '../../../shared/presales'
import { getPresales, getPresalesStatus, logPresalesFollowup } from './presales-api'

const ALL = '__all'
const UNASSIGNED = '__none'
type Show = ItemState | 'all'
const SHOWS: { id: Show; label: string }[] = [
  { id: 'to_remind', label: 'To remind' },
  { id: 'followed_up', label: 'Followed up' },
  { id: 'ordered_again', label: 'Ordered again' },
  { id: 'all', label: 'All' },
]
const qtyText = (n: number) => n.toLocaleString('en-IN')
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
const responseLabel = (id: PresalesResponseId) => PRESALES_RESPONSES.find((r) => r.id === id)?.label ?? id
const modeLabel = (id: PresalesMode) => PRESALES_MODES.find((m) => m.id === id)?.label ?? id
const STATE_BADGE: Record<ItemState, { label: string; className: string }> = {
  to_remind: { label: 'To remind', className: 'border-amber-500/40 text-amber-700 dark:text-amber-400' },
  followed_up: { label: 'Followed up', className: 'border-sky-500/40 text-sky-700 dark:text-sky-400' },
  ordered_again: { label: 'Ordered again', className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
}

/** "14 Nov 2026 · Will order · Krina" */
const followupLine = (f: PresalesFollowup) => `${formatDate(f.at.slice(0, 10))} · ${responseLabel(f.response)} · ${f.byName}`

export function PreSalesPage() {
  const { canManageTeam } = useAuth()
  const today = todayISO()
  const [data, setData] = useState<PresalesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [months, setMonths] = useState<number[]>(() => defaultMonths(today))
  const [owner, setOwner] = useState<string>(ALL)
  const [show, setShow] = useState<Show>('to_remind')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [following, setFollowing] = useState<CustomerPreSales | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      setData(await getPresales())
      setProblem(null)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not load the pre-sales data.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  // A new save of the workbook is picked up by itself (checked every 30 seconds while the page is open).
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const s = await getPresalesStatus()
        if (s.modifiedAt && data && s.modifiedAt !== data.file.modifiedAt) void load(true)
      } catch {
        /* the next check will try again */
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [data, load])

  const windows = useMemo(() => monthWindows(months, today), [months, today])
  const analysed = useMemo(() => (data ? analysePresales(data.customers, data.lines, windows, data.followups, today) : []), [data, windows, today])
  const owners = useMemo(() => {
    const ids = new Set(analysed.map((c) => c.coordinatorId).filter((id): id is string => Boolean(id)))
    return [...ids].sort((a, b) => getCoordinatorDisplayName(a).localeCompare(getCoordinatorDisplayName(b)))
  }, [analysed])
  const hasUnassigned = analysed.some((c) => !c.coordinatorId)

  const scoped = analysed.filter((c) => owner === ALL || (owner === UNASSIGNED ? !c.coordinatorId : c.coordinatorId === owner))
  const customerCounts: Record<Show, number> = {
    to_remind: scoped.filter((c) => c.status === 'to_remind').length,
    followed_up: scoped.filter((c) => c.status === 'followed_up').length,
    ordered_again: scoped.filter((c) => c.status === 'ordered_again').length,
    all: scoped.length,
  }
  const itemCounts = scoped.reduce(
    (t, c) => ({ to_remind: t.to_remind + c.counts.to_remind, followed_up: t.followed_up + c.counts.followed_up, ordered_again: t.ordered_again + c.counts.ordered_again }),
    { to_remind: 0, followed_up: 0, ordered_again: 0 }
  )
  const needle = search.trim().toLowerCase()
  const rows = scoped
    .filter((c) => show === 'all' || c.status === show)
    .filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.code.toLowerCase().includes(needle) ||
        c.items.some((i) => i.itemName.toLowerCase().includes(needle) || i.itemCode.toLowerCase().includes(needle))
    )

  const toggleMonth = (m: number) => setMonths((list) => (list.includes(m) ? (list.length > 1 ? list.filter((x) => x !== m) : list) : [...list, m]))
  const ownerName = (c: CustomerPreSales) => (c.coordinatorId ? getCoordinatorDisplayName(c.coordinatorId) : 'Not assigned')

  const file = data?.file
  const header = (
    <PageHeader
      title="Pre Sales Analysis"
      subtitle="Item by item: what customers ordered in these months last year and have not ordered yet this year, to follow up before their usual time"
      icon={<ShoppingCart className="h-5 w-5" />}
    >
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="presales-sync">
        <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Sync now
      </Button>
    </PageHeader>
  )

  const fileCard = file ? (
    <GlassCard className="flex flex-wrap items-center gap-3 p-4 text-sm" data-testid="presales-file">
      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
      {file.configured ? (
        <>
          <span className="font-medium">{file.name}</span>
          {file.error ? (
            <span className="text-rose-600">{file.error}</span>
          ) : (
            <span className="text-muted-foreground">
              File saved {file.modifiedAt ? when(file.modifiedAt) : '—'} · read {data?.readAt ? when(data.readAt) : '—'} · {data?.lines.length.toLocaleString('en-IN')} order lines
              {canManageTeam ? '' : ' for your customers'} · new saves are picked up by themselves
            </span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground">
          The Pre-Sales file is not connected: add <code className="font-mono">EXCEL_PRESALES_PATH</code> to <code className="font-mono">.env.local</code> and restart the CRM.
        </span>
      )}
    </GlassCard>
  ) : null

  let body
  if (loading && !data) {
    body = (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  } else if (problem) {
    body = <GlassCard className="p-6 text-sm text-rose-600">{problem}</GlassCard>
  } else {
    body = (
      <>
        <GlassCard className="space-y-3 p-4" data-testid="presales-controls">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Months</Label>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Months">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={months.includes(m)}
                    onClick={() => toggleMonth(m)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      months.includes(m) ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {monthName(m)}
                  </button>
                ))}
              </div>
            </div>
            {canManageTeam && (
              <div className="min-w-[190px] space-y-1.5">
                <Label>Coordinator</Label>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger aria-label="Coordinator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Everyone</SelectItem>
                    {owners.map((id) => (
                      <SelectItem key={id} value={id}>
                        {getCoordinatorDisplayName(id)}
                      </SelectItem>
                    ))}
                    {hasUnassigned && <SelectItem value={UNASSIGNED}>Not assigned (no coordinator found)</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Customer, code or item" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground" data-testid="presales-window">
            Last year {windowLabel(windows, 'lastYear')} against this year {windowLabel(windows, 'thisYear')}, item by item. Orders = sales orders; quantity = the lines added up (the file has no
            amount).
          </p>
        </GlassCard>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard title="Items to remind" value={itemCounts.to_remind} icon={BellRing} color="amber" hint={`${customerCounts.to_remind} customers`} />
          <KpiCard title="Items followed up" value={itemCounts.followed_up} icon={PhoneCall} color="blue" hint="Until their next follow-up date" />
          <KpiCard title="Items ordered again" value={itemCounts.ordered_again} icon={CheckCircle2} color="emerald" hint="Already ordered this year" />
          <KpiCard title="Customers last year" value={customerCounts.all} icon={Users} color="violet" hint={windowLabel(windows, 'lastYear')} />
        </div>

        <GlassCard className="space-y-3 p-4 sm:p-5">
          <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5" role="tablist" aria-label="Show">
            {SHOWS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={show === s.id}
                onClick={() => setShow(s.id)}
                className={cn('rounded-md px-3 py-1.5 text-sm', show === s.id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {s.label} ({customerCounts[s.id]})
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nobody here for these months.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-sm" data-testid="presales-table">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                    {canManageTeam && <th className="px-3 py-2.5 text-left font-medium">Coordinator</th>}
                    <th className="px-3 py-2.5 text-left font-medium">Items</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders last year</th>
                    <th className="px-3 py-2.5 text-left font-medium">Last order</th>
                    <th className="px-3 py-2.5 text-left font-medium">Last follow-up</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map((c) => {
                    const isOpen = open === c.code
                    const last = c.followups[0] ?? null
                    return (
                      <Fragment key={c.code}>
                        <tr className={cn('cursor-pointer hover:bg-muted/30', isOpen && 'bg-muted/30')} onClick={() => setOpen(isOpen ? null : c.code)} data-testid="presales-row">
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-start gap-1.5">
                              {isOpen ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />}
                              <span>
                                <span className="font-medium">{c.name}</span>
                                <span className="block font-mono text-[11px] text-muted-foreground">{c.code}</span>
                              </span>
                            </span>
                          </td>
                          {canManageTeam && (
                            <td className={cn('whitespace-nowrap px-3 py-2.5', !c.coordinatorId && 'text-amber-600')}>
                              {ownerName(c)}
                              {c.assignedFrom === 'file' && (
                                <span
                                  className="block text-[11px] text-muted-foreground"
                                  title="Active Payments names no current coordinator for this customer and it has no CRM account, so the coordinator is the one named on its latest order in the Pre-Sales file."
                                >
                                  as per Pre-Sales file (no current coordinator in Active Payments)
                                </span>
                              )}
                              {!c.coordinatorId && c.fileCoordinator && <span className="block text-[11px] text-muted-foreground">file names: {c.fileCoordinator} (not a CRM coordinator)</span>}
                            </td>
                          )}
                          <td className="px-3 py-2.5">
                            <span className="flex flex-wrap gap-1">
                              {(['to_remind', 'followed_up', 'ordered_again'] as const).map((s) =>
                                c.counts[s] ? (
                                  <Badge key={s} variant="outline" className={cn('font-normal', STATE_BADGE[s].className)}>
                                    {c.counts[s]} {STATE_BADGE[s].label.toLowerCase()}
                                  </Badge>
                                ) : null
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.lastYear.orders}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">{c.lastOrder ? formatDate(c.lastOrder) : '—'}</td>
                          <td className="px-3 py-2.5 text-xs">
                            {last ? (
                              <span title={last.said}>
                                {followupLine(last)}
                                <span className="block max-w-[220px] truncate text-muted-foreground">{last.said}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {c.status !== 'ordered_again' && (
                              <Button
                                size="sm"
                                variant={c.status === 'to_remind' ? 'outline' : 'ghost'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setFollowing(c)
                                }}
                                data-testid="presales-follow-up"
                              >
                                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Log follow-up
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/20" data-testid="presales-items">
                            <td colSpan={canManageTeam ? 7 : 6} className="space-y-3 px-4 pb-4 pt-1">
                              <p className="py-1.5 text-xs font-medium text-muted-foreground">
                                {c.items.length} {c.items.length === 1 ? 'item' : 'items'} ordered in {windowLabel(windows, 'lastYear')} · quantity {qtyText(c.lastYear.qty)}
                              </p>
                              <table className="w-full text-sm">
                                <thead className="text-xs text-muted-foreground">
                                  <tr>
                                    <th className="py-1.5 pr-3 text-left font-medium">Item</th>
                                    <th className="px-3 py-1.5 text-right font-medium">Last year</th>
                                    <th className="px-3 py-1.5 text-left font-medium">Last ordered</th>
                                    <th className="px-3 py-1.5 text-right font-medium">This year</th>
                                    <th className="px-3 py-1.5 text-left font-medium">Status</th>
                                    <th className="py-1.5 pl-3 text-left font-medium">Latest follow-up</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                  {c.items.map((i) => (
                                    <tr key={i.key} data-testid="presales-item">
                                      <td className="py-1.5 pr-3">
                                        {i.itemName || '—'}
                                        <span className="block font-mono text-[11px] text-muted-foreground">{i.itemCode}</span>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                                        {qtyText(i.qty)}
                                        <span className="block text-[11px] text-muted-foreground">
                                          {i.orders} {i.orders === 1 ? 'order' : 'orders'}
                                        </span>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-1.5">{formatDate(i.lastDate)}</td>
                                      <td
                                        className={cn(
                                          'whitespace-nowrap px-3 py-1.5 text-right tabular-nums',
                                          i.thisYearOrders ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                                        )}
                                      >
                                        {i.thisYearOrders ? qtyText(i.thisYearQty) : '—'}
                                      </td>
                                      <td className="px-3 py-1.5">
                                        <Badge variant="outline" className={cn('font-normal', STATE_BADGE[i.state].className)}>
                                          {STATE_BADGE[i.state].label}
                                        </Badge>
                                      </td>
                                      <td className="py-1.5 pl-3 text-xs">
                                        {i.followup ? (
                                          <span title={i.followup.said}>
                                            {followupLine(i.followup)}
                                            {i.followup.expectedOrderDate && ` · order expected ${formatDate(i.followup.expectedOrderDate)}`}
                                            {i.followup.nextDate && <span className="block text-muted-foreground">next {formatDate(i.followup.nextDate)}</span>}
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {c.followups.length > 0 && (
                                <div className="space-y-1.5" data-testid="presales-history">
                                  <p className="text-xs font-medium text-muted-foreground">Follow-ups ({c.followups.length})</p>
                                  {c.followups.map((f) => (
                                    <div key={f.id} className="rounded-md border border-border/50 bg-background/60 px-3 py-2 text-xs">
                                      <p className="font-medium">
                                        {when(f.at)} · {modeLabel(f.mode)} · {responseLabel(f.response)} · {f.byName}
                                        {f.expectedOrderDate && ` · order expected ${formatDate(f.expectedOrderDate)}`}
                                        {f.nextDate && ` · next ${formatDate(f.nextDate)}`}
                                      </p>
                                      <p className="mt-0.5 text-muted-foreground">“{f.said}”</p>
                                      <p className="mt-0.5 text-[11px] text-muted-foreground">Items: {f.items.map((k) => c.items.find((i) => i.key === k)?.itemName || k).join(', ')}</p>
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
          )}
        </GlassCard>
      </>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      {fileCard}
      {body}
      <FollowupDialog
        customer={following}
        onClose={() => setFollowing(null)}
        onSaved={async () => {
          setFollowing(null)
          await load(true)
        }}
      />
    </div>
  )
}

/** A follow-up about some of the customer's items, as in Active/Overdue Payments. */
function FollowupDialog({ customer, onClose, onSaved }: { customer: CustomerPreSales | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const open = customer?.items.filter((i) => i.state !== 'ordered_again') ?? []
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<PresalesMode>('call')
  const [response, setResponse] = useState<PresalesResponseId | ''>('')
  const [said, setSaid] = useState('')
  const [expected, setExpected] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!customer) return
    const toRemind = customer.items.filter((i) => i.state === 'to_remind').map((i) => i.key)
    setTicked(new Set(toRemind.length ? toRemind : customer.items.filter((i) => i.state === 'followed_up').map((i) => i.key)))
    setMode('call')
    setResponse('')
    setSaid('')
    setExpected('')
    setNextDate('')
  }, [customer])
  const problem = !ticked.size
    ? 'Tick the items you talked about.'
    : !response
      ? 'Choose what the customer said.'
      : response === 'order_expected' && !expected
        ? 'Give the expected order date.'
        : said.trim().length < 3
          ? 'Write what the customer said.'
          : null
  const save = async () => {
    if (!customer || problem || !response) return
    setSaving(true)
    try {
      await logPresalesFollowup({
        customerCode: customer.code,
        items: [...ticked],
        mode,
        response,
        said: said.trim(),
        expectedOrderDate: response === 'order_expected' ? expected : null,
        nextDate: nextDate || null,
      })
      toast.success('Follow-up logged.', { description: `${customer.name}: ${ticked.size} ${ticked.size === 1 ? 'item' : 'items'}` })
      await onSaved()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }
  const flip = (key: string) =>
    setTicked((t) => {
      const next = new Set(t)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return (
    <Dialog open={Boolean(customer)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log follow-up</DialogTitle>
          <DialogDescription>{customer ? `${customer.name} (${customer.code}): today's date and your name are recorded.` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                Items talked about ({ticked.size} of {open.length})
              </Label>
              <span className="space-x-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setTicked(new Set(open.map((i) => i.key)))}>
                  All
                </button>
                <button type="button" className="text-primary hover:underline" onClick={() => setTicked(new Set())}>
                  None
                </button>
              </span>
            </div>
            <div className="max-h-56 divide-y divide-border/40 overflow-y-auto rounded-md border border-border/50" data-testid="presales-followup-items">
              {open.map((i) => (
                <label key={i.key} className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-muted/30">
                  <input type="checkbox" className="mt-1" checked={ticked.has(i.key)} onChange={() => flip(i.key)} />
                  <span className="flex-1">
                    {i.itemName || i.itemCode}
                    <span className="block text-[11px] text-muted-foreground">
                      last year {qtyText(i.qty)} · {STATE_BADGE[i.state].label.toLowerCase()}
                      {i.followup ? ` (${followupLine(i.followup)})` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Follow-up mode</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESALES_MODES.map((m) => (
                <Button key={m.id} type="button" size="sm" variant={mode === m.id ? 'default' : 'outline'} onClick={() => setMode(m.id)}>
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Customer response</Label>
              <Select value={response} onValueChange={(v) => setResponse(v as PresalesResponseId)}>
                <SelectTrigger aria-label="Customer response" data-testid="presales-response">
                  <SelectValue placeholder="Select response…" />
                </SelectTrigger>
                <SelectContent>
                  {PRESALES_RESPONSES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {response === 'order_expected' && (
              <div className="space-y-1.5">
                <Label htmlFor="presales-expected">Expected order date</Label>
                <Input id="presales-expected" type="date" value={expected} min={todayISO()} onChange={(e) => setExpected(e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="presales-said">
              What the customer said <span className="text-destructive">*</span>
            </Label>
            <Textarea id="presales-said" rows={3} maxLength={1000} value={said} onChange={(e) => setSaid(e.target.value)} placeholder="Details of the conversation…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="presales-next">Next follow-up date</Label>
            <Input id="presales-next" type="date" className="w-[180px]" value={nextDate} min={todayISO()} onChange={(e) => setNextDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              The items show as to remind again from this day ({FOLLOWUP_HOLD_DAYS} days from today if left empty), until they are ordered.
            </p>
          </div>
        </div>
        <DialogFooter className="items-center gap-2">
          {problem && <span className="mr-auto text-xs text-rose-600">{problem}</span>}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || Boolean(problem)} data-testid="presales-followup-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Log follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
