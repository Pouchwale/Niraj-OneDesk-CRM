/**
 * Service: the dispatch mails coordinators send customers (it was the SERVICE
 * sheet), kept in the CRM since 5 Nov 2026. A coordinator adds and sees their
 * own; the team leader and the administrator see everyone's and the Scores:
 * mails, mail ratio, sum of score and final score per coordinator for the
 * period, against a Total Customers they type in (src/lib/service-records.ts).
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { CalendarRange, Clock, Download, Gauge, List, Mail, Plus, Search, Truck, Users } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { MoreRowsFooter, useProgressiveRows } from '@/components/shared/progressive-rows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAssignableOwners, getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { DATE_PRESETS, presetRange, type DatePreset } from '@/features/quotations/QuotationFilters'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import {
  customersFor,
  DISPATCH_STATUSES,
  inServicePeriod,
  monthsInPeriod,
  previousMonth,
  serviceDateDiff,
  serviceRowScore,
  serviceScores,
  SERVICE_SCORE_CAP,
} from '@/lib/service-records'
import { whenSaved } from '@/lib/shared-data'
import type { DispatchStatus, ServiceRecord } from '@/lib/types'
import { cn, formatDate, todayISO } from '@/lib/utils'
import { ServiceRecordDialog } from './ServiceRecordDialog'

const COLUMN_COUNT = 10

const STATUS_STYLE: Record<DispatchStatus, string> = {
  Early: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  'On Time': 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  Delay: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400',
}

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(2)}%`)
const finalClass = (v: number | null) =>
  v === null ? 'text-muted-foreground' : v >= 90 ? 'text-emerald-600 dark:text-emerald-400' : v >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** One month's Total Customers, typed by the team leader or administrator; saved when the box loses focus. */
function CustomersInput({
  coordinatorId,
  month,
  value,
  hint,
  userId,
}: {
  coordinatorId: string
  month: string
  value: number | null
  /** Last month's number, shown greyed as a reminder. */
  hint: number | null
  userId: string
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])
  const save = async () => {
    const trimmed = text.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      toast.error('Enter a number of customers.')
      setText(value === null ? '' : String(value))
      return
    }
    if (next === value) return
    try {
      demoCompanyStore.setServiceCustomers(coordinatorId, month, next, userId, new Date().toISOString())
      await whenSaved()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }
  return (
    <Input
      aria-label={`Total customers for ${getCoordinatorDisplayName(coordinatorId)} in ${monthLabel(month)}`}
      inputMode="numeric"
      className="ml-auto h-8 w-20 text-right tabular-nums"
      placeholder={hint === null ? '—' : String(hint)}
      title={hint === null ? undefined : `Last month: ${hint}`}
      value={text}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function ServicePage() {
  const { user, canManageTeam } = useAuth()
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.serviceRecords)
  const targets = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.serviceTargets)
  const today = todayISO()
  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [person, setPerson] = useState('all')
  const [status, setStatus] = useState<DispatchStatus | 'all'>('all')
  const [view, setView] = useState<'records' | 'scores'>('records')
  const [editing, setEditing] = useState<ServiceRecord | 'new' | null>(null)

  const coordinators = useMemo(() => getAssignableOwners().filter((p) => p.role === 'coordinator'), [])
  const range = preset === 'custom' ? { from: customFrom || null, to: customTo || null } : presetRange(preset, today)
  const periodLabel =
    range.from || range.to ? `${range.from ? formatDate(range.from) : 'Start'} – ${range.to ? formatDate(range.to) : 'today'}` : 'All dates'
  const nameOf = (r: ServiceRecord) => (r.coordinator_id ? getCoordinatorDisplayName(r.coordinator_id) : r.coordinator_name ?? 'Unassigned')

  const inPeriod = useMemo(
    () => all.filter((r) => inServicePeriod(r, range.from, range.to) && (person === 'all' || r.coordinator_id === person)),
    [all, range.from, range.to, person]
  )
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return inPeriod
      .filter((r) => status === 'all' || r.dispatch_status === status)
      .filter(
        (r) =>
          !needle ||
          [r.customer_name, r.sales_order_no, r.po_no, r.fg_code, r.remark, nameOf(r)].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPeriod, search, status])
  const progressive = useProgressiveRows(rows, { resetKey: `${range.from}|${range.to}|${person}|${status}|${search}` })

  const scores = useMemo(
    () => serviceScores(all, targets, coordinators.map((c) => c.id), range.from, range.to),
    [all, targets, coordinators, range.from, range.to]
  )
  // One month in view: its Total Customers can be typed. Longer: the months are added up.
  const months = useMemo(() => monthsInPeriod(range.from, range.to, all), [range.from, range.to, all])
  const editableMonth = months.length === 1 ? months[0] : null
  const count = (s: DispatchStatus) => inPeriod.filter((r) => r.dispatch_status === s).length
  const noInfo = inPeriod.filter((r) => !r.information_date).length

  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    downloadWorkbook(`Service ${today}.xlsx`, [
      {
        name: 'Service',
        rows: [
          ['Date', 'Coordinator Name', 'PO No.', 'FG Code', 'Sales Order No', 'Customer Name', 'Dispatch Status', 'Information Date', 'Original SO Dispatch Date', 'Date Diff', 'Final Dispatch Date', 'Remark', 'Score'],
          ...[...rows].reverse().map((r) => [
            r.date, nameOf(r), r.po_no ?? '', r.fg_code ?? '', r.sales_order_no ?? '', r.customer_name, r.dispatch_status ?? '',
            r.information_date ?? '', r.original_dispatch_date ?? '', serviceDateDiff(r) ?? '', r.final_dispatch_date ?? '', r.remark ?? '', serviceRowScore(r),
          ]),
        ],
      },
      ...(canManageTeam
        ? [{
            name: 'Scores',
            rows: [
              ['Coordinator Name', 'Total Customers', 'No. of Mails', 'Customer Mail Ratio', 'Sum of Score', 'Final Score'],
              ...scores.map((s) => [
                getCoordinatorDisplayName(s.coordinatorId), s.totalCustomers ?? '', s.mails,
                s.mailRatio === null ? '' : Math.round(s.mailRatio * 10000) / 100, s.sumOfScore,
                s.finalScore === null ? '' : Math.round(s.finalScore * 100) / 100,
              ]),
            ],
          }]
        : []),
    ])
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Service" subtitle={canManageTeam ? 'Dispatch mails sent to customers by the team' : 'Dispatch mails you have sent to customers'}>
        <Button variant="outline" onClick={download} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Excel
        </Button>
        <Button onClick={() => setEditing('new')} data-testid="service-new">
          <Plus className="mr-2 h-4 w-4" /> Add record
        </Button>
      </PageHeader>

      <GlassCard className="flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" /> Period (by date)
          </p>
          <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
            <SelectTrigger className="h-9 w-[170px]" aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {preset === 'custom' && (
          <>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">From</p>
              <Input type="date" aria-label="From" className="h-9 w-[150px]" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">To</p>
              <Input type="date" aria-label="To" className="h-9 w-[150px]" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </>
        )}
        {canManageTeam && (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Coordinator
            </p>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-9 w-[190px]" aria-label="Coordinator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {coordinators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="ml-auto text-xs text-muted-foreground">{periodLabel}</p>
      </GlassCard>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard title="Mails" value={inPeriod.length.toLocaleString('en-IN')} icon={Mail} color="blue" hint={periodLabel} />
        <KpiCard title="Early" value={count('Early')} icon={Truck} color="emerald" />
        <KpiCard title="On time" value={count('On Time')} icon={Clock} color="indigo" />
        <KpiCard title="Delay" value={count('Delay')} icon={Clock} color="rose" />
        <KpiCard title="No information date" value={noInfo} icon={Gauge} color="amber" hint="These score 0" />
      </div>

      {canManageTeam && (
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {([
            { id: 'records', label: 'Records', icon: List },
            { id: 'scores', label: 'Scores', icon: Gauge },
          ] as const).map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v.id ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <v.icon className="h-4 w-4" />
              {v.label}
            </button>
          ))}
        </div>
      )}

      {canManageTeam && view === 'scores' ? (
        <GlassCard className="space-y-3 p-4 sm:p-6">
          <div>
            <h3 className="text-base font-medium">Service scores</h3>
            <p className="text-xs text-muted-foreground">
              {periodLabel} ·{' '}
              {editableMonth
                ? `type each coordinator's Total Customers for ${monthLabel(editableMonth)} (last month's number shows greyed)`
                : `Total Customers is the months' numbers added up (${months.length} months); choose a single month to type them`}
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="service-scores">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Coordinator</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total customers</th>
                  <th className="px-3 py-2.5 text-right font-medium">No. of mails</th>
                  <th className="px-3 py-2.5 text-right font-medium">Customer mail ratio</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sum of score</th>
                  <th className="px-3 py-2.5 text-right font-medium">Final score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {scores.map((s) => (
                  <tr
                    key={s.coordinatorId}
                    className={cn('cursor-pointer hover:bg-muted/30', s.mails === 0 && s.totalCustomers === null && 'text-muted-foreground')}
                    title="Show this person's records"
                    onClick={() => {
                      setPerson(s.coordinatorId)
                      setView('records')
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{getCoordinatorDisplayName(s.coordinatorId)}</td>
                    <td className="px-3 py-2 text-right">
                      {editableMonth ? (
                        <CustomersInput
                          coordinatorId={s.coordinatorId}
                          month={editableMonth}
                          value={customersFor(targets, s.coordinatorId, editableMonth)}
                          hint={customersFor(targets, s.coordinatorId, previousMonth(editableMonth))}
                          userId={user?.id ?? ''}
                        />
                      ) : (
                        <span
                          className="tabular-nums"
                          title={s.missingMonths.length ? `No number for ${s.missingMonths.map(monthLabel).join(', ')}` : undefined}
                        >
                          {s.totalCustomers ?? '—'}
                          {s.missingMonths.length > 0 && s.totalCustomers !== null && (
                            <span className="ml-1 text-xs text-amber-600">({s.missingMonths.length} missing)</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.mails.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(s.mailRatio)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.sumOfScore.toLocaleString('en-IN')}</td>
                    <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', finalClass(s.finalScore))}>
                      {s.finalScore === null ? '—' : s.finalScore.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Each record scores 10 when it has an Information Date, otherwise 0. Customer mail ratio = mails ÷ total customers. Final score =
            (sum of score ÷ total customers) × 10, at most {SERVICE_SCORE_CAP}. Total customers is typed per month; a coordinator with no
            number for the period shows —.
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Customer, SO / PO no, FG code, remark" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', ...DISPATCH_STATUSES] as const).map((s) => (
                <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="h-8 px-3 text-xs" onClick={() => setStatus(s)}>
                  {s === 'all' ? 'All' : s}
                </Button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {all.length === 0 ? 'No service records yet. Use "Add record" to add the first.' : 'No service records match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-sm" data-testid="service-table">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    {canManageTeam && <th className="px-3 py-3 font-medium">Coordinator</th>}
                    <th className="px-3 py-3 font-medium">Customer</th>
                    <th className="px-3 py-3 font-medium">SO / PO / FG</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Information</th>
                    <th className="px-3 py-3 font-medium">Original SO dispatch</th>
                    <th className="px-3 py-3 text-right font-medium">Date diff</th>
                    <th className="px-3 py-3 font-medium">Final dispatch</th>
                    <th className="px-3 py-3 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {progressive.visible.map((r) => {
                    const diff = serviceDateDiff(r)
                    const refs = [r.sales_order_no && `SO ${r.sales_order_no}`, r.po_no && `PO ${r.po_no}`, r.fg_code && `FG ${r.fg_code}`].filter(Boolean)
                    return (
                      <tr key={r.id} className="cursor-pointer align-top hover:bg-muted/30" onClick={() => setEditing(r)} data-testid="service-row">
                        <td className="whitespace-nowrap px-4 py-2.5">{formatDate(r.date)}</td>
                        {canManageTeam && <td className={cn('whitespace-nowrap px-3 py-2.5', !r.coordinator_id && 'text-amber-600')}>{nameOf(r)}</td>}
                        <td className="min-w-[180px] px-3 py-2.5">
                          <div className="font-medium">{r.customer_name}</div>
                          {r.remark && (
                            <div className="max-w-[260px] truncate text-xs text-muted-foreground" title={r.remark}>
                              {r.remark}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{refs.length ? refs.join(' · ') : '—'}</td>
                        <td className="px-3 py-2.5">
                          {r.dispatch_status ? (
                            <Badge variant="outline" className={STATUS_STYLE[r.dispatch_status]}>
                              {r.dispatch_status}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{r.information_date ? formatDate(r.information_date) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{r.original_dispatch_date ? formatDate(r.original_dispatch_date) : '—'}</td>
                        <td className={cn('px-3 py-2.5 text-right tabular-nums', diff !== null && diff < 0 && 'text-rose-600')}>{diff ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{r.final_dispatch_date ? formatDate(r.final_dispatch_date) : '—'}</td>
                        <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', serviceRowScore(r) === 0 && 'font-normal text-muted-foreground')}>
                          {serviceRowScore(r)}
                        </td>
                      </tr>
                    )
                  })}
                  <MoreRowsFooter state={progressive} colSpan={canManageTeam ? COLUMN_COUNT : COLUMN_COUNT - 1} />
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {editing && (
        <ServiceRecordDialog
          record={editing === 'new' ? null : editing}
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
