/**
 * Self Leads: leads coordinators find themselves (since 5 Nov 2026). One
 * record per lead; every count and value is worked out from them
 * (src/lib/self-leads.ts). A coordinator adds and sees their own; the team
 * leader and administrator see everyone's, person-wise and team-wise by week.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { CalendarRange, CheckCircle2, Download, IndianRupee, List, Phone, Plus, Search, Target, TrendingUp, Users, XCircle } from 'lucide-react'
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
import { inLeadPeriod, leadsByPerson, leadSummary, referencesFrom, SELF_LEAD_STATUS_LABEL, TEAMS, weekEnd, weeklyByTeam, type LeadSummary } from '@/lib/self-leads'
import type { SelfLead, SelfLeadStatus, TeamModule } from '@/lib/types'
import { cn, formatCurrency, formatDate, todayISO } from '@/lib/utils'
import { SelfLeadDialog } from './SelfLeadDialog'

const STATUS_STYLE: Record<SelfLeadStatus, string> = {
  open: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  closed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  lost: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400',
}

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
const money = (v: number) => (v ? formatCurrency(v) : '—')

/** The columns both report tables share. */
const SUMMARY_COLUMNS: { key: keyof LeadSummary; label: string; render: (s: LeadSummary) => string }[] = [
  { key: 'leads', label: 'Leads', render: (s) => String(s.leads) },
  { key: 'connected', label: 'Connected', render: (s) => String(s.connected) },
  { key: 'referrals', label: 'Via reference', render: (s) => String(s.referrals) },
  { key: 'open', label: 'Open', render: (s) => String(s.open) },
  { key: 'closed', label: 'Closed', render: (s) => String(s.closed) },
  { key: 'lost', label: 'Lost', render: (s) => String(s.lost) },
  { key: 'conversion', label: 'Conversion', render: (s) => pct(s.conversion) },
  { key: 'pipelineValue', label: 'Pipeline', render: (s) => money(s.pipelineValue) },
  { key: 'valueWon', label: 'Value won', render: (s) => money(s.valueWon) },
]

export function SelfLeadsPage() {
  const { user, canManageTeam } = useAuth()
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.selfLeads)
  const today = todayISO()
  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [team, setTeam] = useState<TeamModule | 'all'>('all')
  const [person, setPerson] = useState('all')
  const [status, setStatus] = useState<SelfLeadStatus | 'all'>('all')
  const [connectedOnly, setConnectedOnly] = useState<'all' | 'yes' | 'no'>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'leads' | 'people' | 'weekly'>('leads')
  const [editing, setEditing] = useState<SelfLead | 'new' | null>(null)

  const people = useMemo(() => getAssignableOwners().filter((p) => p.role === 'coordinator'), [])
  const teamOf = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, (p.module ?? null) as TeamModule | null]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [people])
  const range = preset === 'custom' ? { from: customFrom || null, to: customTo || null } : presetRange(preset, today)
  const periodLabel =
    range.from || range.to ? `${range.from ? formatDate(range.from) : 'Start'} – ${range.to ? formatDate(range.to) : 'today'}` : 'All dates'

  // Period, team and person: what the cards and both reports count.
  const inScope = useMemo(
    () =>
      all.filter(
        (l) =>
          inLeadPeriod(l, range.from, range.to) &&
          (team === 'all' || teamOf(l.coordinator_id) === team) &&
          (person === 'all' || l.coordinator_id === person)
      ),
    [all, range.from, range.to, team, person, teamOf]
  )
  // Status, connected and search narrow the list only.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return inScope
      .filter((l) => status === 'all' || l.status === status)
      .filter((l) => connectedOnly === 'all' || (connectedOnly === 'yes') === l.connected)
      .filter(
        (l) =>
          !needle ||
          [l.company_name, l.contact_person, l.contact_number, l.referred_by_name, getCoordinatorDisplayName(l.coordinator_id ?? ''), ...l.remarks.map((r) => r.note)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
  }, [inScope, status, connectedOnly, search])
  const progressive = useProgressiveRows(rows, { resetKey: `${range.from}|${range.to}|${team}|${person}|${status}|${connectedOnly}|${search}` })

  const summary = useMemo(() => leadSummary(inScope), [inScope])
  /** How many references each lead (client) has given, across all leads in view. */
  const referencesGiven = useMemo(() => {
    const counts = new Map<string, number>()
    if (!all.some((l) => l.referred_by_name)) return counts
    for (const l of all) {
      const n = referencesFrom(l, all).length
      if (n) counts.set(l.id, n)
    }
    return counts
  }, [all])
  const shownPeople = useMemo(
    () => people.filter((p) => (team === 'all' || p.module === team) && (person === 'all' || p.id === person)).map((p) => p.id),
    [people, team, person]
  )
  const byPerson = useMemo(() => leadsByPerson(inScope, shownPeople), [inScope, shownPeople])
  const weekly = useMemo(() => weeklyByTeam(inScope, teamOf), [inScope, teamOf])
  const nameOf = (id: string | null) => (id ? getCoordinatorDisplayName(id) : 'Unassigned')

  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    const head = SUMMARY_COLUMNS.map((c) => c.label)
    const nums = (s: LeadSummary) => [s.leads, s.connected, s.referrals, s.open, s.closed, s.lost, s.conversion ?? '', s.pipelineValue, s.valueWon]
    downloadWorkbook(`Self leads ${today}.xlsx`, [
      {
        name: 'Leads',
        rows: [
          ['Date', 'Coordinator', 'Team', 'Company', 'Contact person', 'Contact number', 'Referred by', 'Connected', 'Connected on', 'Status', 'Value', 'Lost reason', 'Remarks'],
          ...[...rows].reverse().map((l) => [
            l.date, nameOf(l.coordinator_id), teamOf(l.coordinator_id) ?? '', l.company_name, l.contact_person ?? '', l.contact_number ?? '',
            l.referred_by_name ?? '', l.connected ? 'Yes' : 'No', l.connected_date ?? '', SELF_LEAD_STATUS_LABEL[l.status], l.value ?? '', l.lost_reason ?? '',
            l.remarks.map((r) => `${r.at.slice(0, 10)} ${getCoordinatorDisplayName(r.by)}: ${r.note}`).join('\n'),
          ]),
        ],
      },
      ...(canManageTeam
        ? [
            { name: 'Person-wise', rows: [['Coordinator', 'Team', ...head], ...byPerson.map((p) => [nameOf(p.personId), teamOf(p.personId) ?? '', ...nums(p.summary)])] },
            {
              name: 'Weekly by team',
              rows: [
                ['Week', 'Team', ...head],
                ...weekly.flatMap((w) => [
                  ...TEAMS.map((t) => [`${w.week} – ${weekEnd(w.week)}`, t, ...nums(w.teams[t])]),
                  [`${w.week} – ${weekEnd(w.week)}`, 'Total', ...nums(w.total)],
                ]),
              ],
            },
          ]
        : []),
    ])
  }

  const tabs = [
    { id: 'leads', label: 'Leads', icon: List, show: true },
    { id: 'people', label: 'Person-wise', icon: Users, show: canManageTeam },
    { id: 'weekly', label: canManageTeam ? 'Weekly by team' : 'My weeks', icon: CalendarRange, show: true },
  ] as const

  return (
    <div className="space-y-6">
      <PageHeader title="Self Leads" subtitle={canManageTeam ? 'Leads the team found themselves' : 'Leads you found yourself'}>
        <Button variant="outline" onClick={download} disabled={inScope.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Excel
        </Button>
        <Button onClick={() => setEditing('new')} data-testid="lead-new">
          <Plus className="mr-2 h-4 w-4" /> Add lead
        </Button>
      </PageHeader>

      <GlassCard className="flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" /> Period (by lead date)
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
          <>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Team</p>
              <Select value={team} onValueChange={(v) => { setTeam(v as TeamModule | 'all'); setPerson('all') }}>
                <SelectTrigger className="h-9 w-[150px]" aria-label="Team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both teams</SelectItem>
                  {TEAMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Coordinator</p>
              <Select value={person} onValueChange={setPerson}>
                <SelectTrigger className="h-9 w-[190px]" aria-label="Coordinator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {people
                    .filter((p) => team === 'all' || p.module === team)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <p className="ml-auto text-xs text-muted-foreground">{periodLabel}</p>
      </GlassCard>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <KpiCard title="Leads" value={summary.leads} icon={Target} color="blue" hint={summary.referrals ? `${summary.referrals} via reference` : periodLabel} />
        <KpiCard title="Connected" value={summary.connected} icon={Phone} color="indigo" hint={summary.leads ? `${Math.round((summary.connected / summary.leads) * 100)}% of leads` : undefined} />
        <KpiCard title="Closed (won)" value={summary.closed} icon={CheckCircle2} color="emerald" hint={summary.conversion === null ? 'None connected yet' : `${summary.conversion}% of connected`} />
        <KpiCard title="Lost" value={summary.lost} icon={XCircle} color="rose" hint={`${summary.open} still open`} />
        <KpiCard title="Pipeline" value={formatCurrency(summary.pipelineValue, true)} icon={TrendingUp} color="amber" hint="Expected value of open leads" />
        <KpiCard title="Value won" value={formatCurrency(summary.valueWon, true)} icon={IndianRupee} color="violet" hint="Order value of closed leads" />
      </div>

      <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
        {tabs
          .filter((t) => t.show)
          .map((v) => (
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

      {view === 'people' && canManageTeam && (
        <GlassCard className="space-y-3 p-4 sm:p-6">
          <div>
            <h3 className="text-base font-medium">Person-wise</h3>
            <p className="text-xs text-muted-foreground">{periodLabel} · conversion = closed ÷ connected · click a name to see their leads</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="lead-people">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Coordinator</th>
                  <th className="px-3 py-2.5 text-left font-medium">Team</th>
                  {SUMMARY_COLUMNS.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {byPerson.map(({ personId, summary: s }) => (
                  <tr
                    key={personId || 'none'}
                    className={cn('cursor-pointer hover:bg-muted/30', s.leads === 0 && 'text-muted-foreground')}
                    onClick={() => {
                      if (personId) setPerson(personId)
                      setView('leads')
                    }}
                  >
                    <td className={cn('whitespace-nowrap px-4 py-2.5 font-medium', !personId && 'text-amber-600')}>{nameOf(personId || null)}</td>
                    <td className="px-3 py-2.5 text-xs">{teamOf(personId || null) ?? '—'}</td>
                    {SUMMARY_COLUMNS.map((c) => (
                      <td key={c.key} className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', c.key === 'valueWon' && 'font-semibold')}>
                        {c.render(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={2}>
                    Total
                  </td>
                  {SUMMARY_COLUMNS.map((c) => (
                    <td key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      {c.render(summary)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </GlassCard>
      )}

      {view === 'weekly' && (
        <GlassCard className="space-y-3 p-4 sm:p-6">
          <div>
            <h3 className="text-base font-medium">{canManageTeam ? 'Weekly by team' : 'My weeks'}</h3>
            <p className="text-xs text-muted-foreground">{periodLabel} · weeks run Monday to Sunday, newest first</p>
          </div>
          {weekly.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No leads in this period.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-sm" data-testid="lead-weekly">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Week</th>
                    {canManageTeam && <th className="px-3 py-2.5 text-left font-medium">Team</th>}
                    {SUMMARY_COLUMNS.map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {weekly.flatMap((w) => {
                    const label = `${formatDate(w.week)} – ${formatDate(weekEnd(w.week))}`
                    const lines: { key: string; team: string; s: LeadSummary; total: boolean }[] = canManageTeam
                      ? [...TEAMS.map((t) => ({ key: `${w.week}-${t}`, team: t, s: w.teams[t], total: false })), { key: `${w.week}-all`, team: 'Total', s: w.total, total: true }]
                      : [{ key: `${w.week}-all`, team: '', s: w.total, total: false }]
                    return lines.map((line, i) => (
                      <tr key={line.key} className={cn(line.total && 'bg-muted/30 font-semibold', i === 0 && 'border-t-2 border-border/70')}>
                        <td className="whitespace-nowrap px-4 py-2 text-xs">{i === 0 ? label : ''}</td>
                        {canManageTeam && <td className="px-3 py-2">{line.team}</td>}
                        {SUMMARY_COLUMNS.map((c) => (
                          <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {c.render(line.s)}
                          </td>
                        ))}
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {view === 'leads' && (
        <GlassCard className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Company, contact, referred by, remark" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'open', 'closed', 'lost'] as const).map((s) => (
                <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="h-8 px-3 text-xs" onClick={() => setStatus(s)}>
                  {s === 'all' ? 'All' : SELF_LEAD_STATUS_LABEL[s]}
                </Button>
              ))}
              <Select value={connectedOnly} onValueChange={(v) => setConnectedOnly(v as 'all' | 'yes' | 'no')}>
                <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Connected">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Connected or not</SelectItem>
                  <SelectItem value="yes">Connected</SelectItem>
                  <SelectItem value="no">Not connected yet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {all.length === 0 ? 'No leads yet. Use "Add lead" to add the first.' : 'No leads match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-sm" data-testid="lead-table">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    {canManageTeam && <th className="px-3 py-3 font-medium">Coordinator</th>}
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Referred by</th>
                    <th className="px-3 py-3 font-medium">Connected</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">Value</th>
                    <th className="px-3 py-3 font-medium">Latest remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {progressive.visible.map((l) => {
                    const last = l.remarks[l.remarks.length - 1]
                    return (
                      <tr key={l.id} className="cursor-pointer align-top hover:bg-muted/30" onClick={() => setEditing(l)} data-testid="lead-row">
                        <td className="whitespace-nowrap px-4 py-2.5">{formatDate(l.date)}</td>
                        {canManageTeam && (
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {nameOf(l.coordinator_id)}
                            <div className="text-xs text-muted-foreground">{teamOf(l.coordinator_id) ?? ''}</div>
                          </td>
                        )}
                        <td className="min-w-[180px] px-3 py-2.5">
                          <div className="font-medium">{l.company_name}</div>
                          <div className="text-xs text-muted-foreground">{[l.contact_person, l.contact_number].filter(Boolean).join(' · ')}</div>
                          {(referencesGiven.get(l.id) ?? 0) > 0 && (
                            <div className="text-xs text-violet-700 dark:text-violet-400">
                              Gave {referencesGiven.get(l.id)} reference{referencesGiven.get(l.id) === 1 ? '' : 's'}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[180px] px-3 py-2.5 text-xs">
                          {l.referred_by_name ? <span className="text-violet-700 dark:text-violet-400">{l.referred_by_name}</span> : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                          {l.connected ? (
                            <span className="text-emerald-700 dark:text-emerald-400">Yes{l.connected_date ? ` · ${formatDate(l.connected_date)}` : ''}</span>
                          ) : (
                            <span className="text-amber-600">Not yet</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={STATUS_STYLE[l.status]}>
                            {SELF_LEAD_STATUS_LABEL[l.status]}
                          </Badge>
                          {l.status === 'lost' && l.lost_reason && (
                            <div className="mt-1 max-w-[200px] truncate text-xs text-muted-foreground" title={l.lost_reason}>
                              {l.lost_reason}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{l.value ? formatCurrency(l.value) : '—'}</td>
                        <td className="max-w-[280px] px-3 py-2.5 text-xs">
                          {last ? (
                            <>
                              <div className="line-clamp-2" title={last.note}>
                                {last.note}
                              </div>
                              <div className="text-muted-foreground">
                                {formatDate(last.at.slice(0, 10))}
                                {l.remarks.length > 1 ? ` · ${l.remarks.length} remarks` : ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  <MoreRowsFooter state={progressive} colSpan={canManageTeam ? 8 : 7} />
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {editing && (
        <SelfLeadDialog
          key={editing === 'new' ? 'new' : editing.id}
          lead={editing === 'new' ? null : editing}
          onOpenLead={(l) => setEditing(l)}
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
