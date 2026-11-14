/**
 * Pre Sales Analysis (14 Nov 2026): who ordered in these months last year and
 * has not ordered yet this year, so the coordinator can remind them before
 * their usual time. Read from the Pre-Sales-Order-CRM workbook by the server,
 * which sends a coordinator only the customers the CRM assigns to them; the
 * team leader and administrator see everyone, customers with no CRM account
 * under "Not assigned". The page picks up each new save of the file.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, Loader2, RefreshCw, Search, ShoppingCart, Users } from 'lucide-react'
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
import { analysePresales, defaultMonths, monthName, monthWindows, reminderOf, REMINDER_FRESH_DAYS, windowLabel, type CustomerPreSales } from '@/lib/presales'
import { cn, formatDate, todayISO } from '@/lib/utils'
import type { PresalesResponse } from '../../../shared/presales'
import { getPresales, getPresalesStatus, markReminded } from './presales-api'

const ALL = '__all'
const UNASSIGNED = '__none'
type Show = 'to_remind' | 'reminded' | 'ordered_again' | 'all'
const SHOWS: { id: Show; label: string }[] = [
  { id: 'to_remind', label: 'To remind' },
  { id: 'reminded', label: 'Reminded' },
  { id: 'ordered_again', label: 'Ordered again' },
  { id: 'all', label: 'All' },
]
const qtyText = (n: number) => n.toLocaleString('en-IN')
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })

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
  const [reminding, setReminding] = useState<CustomerPreSales | null>(null)

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
  const analysed = useMemo(() => (data ? analysePresales(data.customers, data.lines, windows) : []), [data, windows])
  const withReminder = useMemo(
    () => analysed.map((c) => ({ c, r: reminderOf(data?.reminders ?? [], c.code, today) })),
    [analysed, data, today]
  )
  const owners = useMemo(() => {
    const ids = new Set(analysed.map((c) => c.coordinatorId ?? UNASSIGNED))
    return [...ids].filter((id) => id !== UNASSIGNED).sort((a, b) => getCoordinatorDisplayName(a).localeCompare(getCoordinatorDisplayName(b)))
  }, [analysed])
  const hasUnassigned = analysed.some((c) => !c.coordinatorId)

  const scoped = withReminder.filter(({ c }) => owner === ALL || (owner === UNASSIGNED ? !c.coordinatorId : c.coordinatorId === owner))
  const counts = {
    to_remind: scoped.filter(({ c, r }) => c.status === 'to_remind' && !r.reminded).length,
    reminded: scoped.filter(({ c, r }) => c.status === 'to_remind' && r.reminded).length,
    ordered_again: scoped.filter(({ c }) => c.status === 'ordered_again').length,
    all: scoped.length,
  }
  const needle = search.trim().toLowerCase()
  const rows = scoped
    .filter(({ c, r }) =>
      show === 'all' ? true : show === 'ordered_again' ? c.status === 'ordered_again' : c.status === 'to_remind' && (show === 'reminded' ? r.reminded : !r.reminded)
    )
    .filter(({ c }) => !needle || c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle))

  const toggleMonth = (m: number) => setMonths((list) => (list.includes(m) ? (list.length > 1 ? list.filter((x) => x !== m) : list) : [...list, m]))
  const ownerName = (c: CustomerPreSales) => (c.coordinatorId ? getCoordinatorDisplayName(c.coordinatorId) : 'Not assigned')

  const file = data?.file
  const header = (
    <PageHeader title="Pre Sales Analysis" subtitle="Customers who ordered in these months last year and have not ordered yet this year: remind them before their usual time" icon={<ShoppingCart className="h-5 w-5" />}>
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
              <Input placeholder="Customer or code" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground" data-testid="presales-window">
            Last year {windowLabel(windows, 'lastYear')} against this year {windowLabel(windows, 'thisYear')}. Orders = sales orders; quantity = the lines added up (the file has no amount).
          </p>
        </GlassCard>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard title="To remind" value={counts.to_remind} icon={BellRing} color="amber" hint="Ordered last year, not yet this year" />
          <KpiCard title="Reminded" value={counts.reminded} icon={CheckCircle2} color="blue" hint={`In the last ${REMINDER_FRESH_DAYS} days`} />
          <KpiCard title="Ordered again" value={counts.ordered_again} icon={ShoppingCart} color="emerald" hint="Already ordered this year" />
          <KpiCard title="Customers last year" value={counts.all} icon={Users} color="violet" hint={windowLabel(windows, 'lastYear')} />
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
                {s.label} ({counts[s.id]})
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
                    <th className="px-3 py-2.5 text-right font-medium">Orders last year</th>
                    <th className="px-3 py-2.5 text-right font-medium">Quantity last year</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders this year</th>
                    <th className="px-3 py-2.5 text-left font-medium">Last order</th>
                    <th className="px-3 py-2.5 text-left font-medium">Reminder</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map(({ c, r }) => {
                    const isOpen = open === c.code
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
                                <span className="block text-[11px] text-muted-foreground" title="This customer has no account in Active or Overdue Payments, so the coordinator is the one named on its latest order in the Pre-Sales file.">
                                  as per Pre-Sales file (customer has no Active/Overdue account)
                                </span>
                              )}
                              {!c.coordinatorId && c.fileCoordinator && <span className="block text-[11px] text-muted-foreground">file names: {c.fileCoordinator} (not a CRM coordinator)</span>}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.lastYear.orders}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{qtyText(c.lastYear.qty)}</td>
                          <td className={cn('px-3 py-2.5 text-right tabular-nums', c.thisYear.orders ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-rose-600')}>{c.thisYear.orders}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">{c.lastOrder ? formatDate(c.lastOrder) : '—'}</td>
                          <td className="px-3 py-2.5">
                            {r.latest ? (
                              <span className={cn('text-xs', r.reminded ? 'text-foreground' : 'text-muted-foreground')} title={r.latest.note ?? undefined}>
                                {r.reminded && <Badge variant="outline" className="mr-1 font-normal">Reminded</Badge>}
                                {formatDate(r.latest.at.slice(0, 10))} by {r.latest.byName}
                                {r.latest.note && <span className="block max-w-[220px] truncate text-muted-foreground">{r.latest.note}</span>}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {c.status === 'to_remind' && (
                              <Button
                                size="sm"
                                variant={r.reminded ? 'ghost' : 'outline'}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setReminding(c)
                                }}
                                data-testid="presales-remind"
                              >
                                <BellRing className="mr-1.5 h-3.5 w-3.5" /> Mark reminded
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/20" data-testid="presales-items">
                            <td colSpan={canManageTeam ? 8 : 7} className="px-4 pb-3 pt-1">
                              <p className="py-1.5 text-xs font-medium text-muted-foreground">
                                Ordered in {windowLabel(windows, 'lastYear')}: {c.lastYear.items.length} {c.lastYear.items.length === 1 ? 'item' : 'items'}
                                {c.thisYear.orders ? ` · this year so far: ${c.thisYear.orders} orders, quantity ${qtyText(c.thisYear.qty)}` : ' · no order yet this year'}
                              </p>
                              <table className="w-full text-sm">
                                <thead className="text-xs text-muted-foreground">
                                  <tr>
                                    <th className="py-1.5 pr-3 text-left font-medium">Item</th>
                                    <th className="px-3 py-1.5 text-left font-medium">Item code</th>
                                    <th className="px-3 py-1.5 text-right font-medium">Orders</th>
                                    <th className="px-3 py-1.5 text-right font-medium">Quantity</th>
                                    <th className="py-1.5 pl-3 text-left font-medium">Last ordered</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                  {c.lastYear.items.map((i) => (
                                    <tr key={i.itemCode || i.itemName}>
                                      <td className="py-1.5 pr-3">{i.itemName || '—'}</td>
                                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{i.itemCode || '—'}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{i.orders}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{qtyText(i.qty)}</td>
                                      <td className="whitespace-nowrap py-1.5 pl-3">{formatDate(i.lastDate)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
      <RemindDialog
        customer={reminding}
        onClose={() => setReminding(null)}
        onSaved={async () => {
          setReminding(null)
          await load(true)
        }}
      />
    </div>
  )
}

function RemindDialog({ customer, onClose, onSaved }: { customer: CustomerPreSales | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (customer) setNote('')
  }, [customer])
  const save = async () => {
    if (!customer) return
    setSaving(true)
    try {
      await markReminded(customer.code, note)
      toast.success('Marked as reminded.', { description: customer.name })
      await onSaved()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={Boolean(customer)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark reminded</DialogTitle>
          <DialogDescription>{customer ? `${customer.name} (${customer.code}): today's date and your name are recorded.` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="presales-note">What did they say? (optional)</Label>
          <Textarea id="presales-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Will send the PO next week" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving} data-testid="presales-remind-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark reminded
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
