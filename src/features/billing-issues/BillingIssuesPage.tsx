/**
 * Billing Issues: the log of billing mistakes (it was a shared sheet), kept in
 * the CRM since 5 Nov 2026. Everyone sees the whole log and can log an issue;
 * a coordinator edits the ones they logged. The team leader and the
 * administrator also get Scores: each coordinator's issues as Responsible
 * Person 1 in the period, on the sheet's stepped scale (src/lib/billing-issues.ts).
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, CalendarRange, Download, Gauge, List, Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAssignableOwners, useAuth } from '@/features/auth/AuthContext'
import { DATE_PRESETS, presetRange, type DatePreset } from '@/features/quotations/QuotationFilters'
import { BILLING_SCORE_TIERS, billingScores, inBillingPeriod } from '@/lib/billing-issues'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import type { BillingIssue } from '@/lib/types'
import { cn, formatDate, todayISO } from '@/lib/utils'
import { BillingIssueDialog, responsibleName } from './BillingIssueDialog'

const scoreClass = (score: number) =>
  score >= 100 ? 'text-emerald-600 dark:text-emerald-400' : score > 0 ? 'text-amber-600 dark:text-amber-400' : score === 0 ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400'

export function BillingIssuesPage() {
  const { user, canManageTeam } = useAuth()
  const all = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.billingIssues)
  const today = todayISO()
  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [person, setPerson] = useState<string>('all')
  const [view, setView] = useState<'issues' | 'scores'>('issues')
  const [editing, setEditing] = useState<BillingIssue | 'new' | null>(null)

  const coordinators = useMemo(() => getAssignableOwners().filter((p) => p.role === 'coordinator'), [])
  const range = preset === 'custom' ? { from: customFrom || null, to: customTo || null } : presetRange(preset, today)
  const periodLabel =
    range.from || range.to ? `${range.from ? formatDate(range.from) : 'Start'} – ${range.to ? formatDate(range.to) : 'today'}` : 'All dates'

  const inPeriod = useMemo(() => all.filter((i) => inBillingPeriod(i, range.from, range.to)), [all, range.from, range.to])
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return inPeriod
      .filter((i) => person === 'all' || i.responsible_1 === person)
      .filter(
        (i) =>
          !needle ||
          [i.customer_name, i.issue, i.invoice_no, i.cn_no, i.dn_no, i.solution, responsibleName(i.responsible_1), responsibleName(i.responsible_2), responsibleName(i.responsible_3)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.sr_no - a.sr_no)
  }, [inPeriod, person, search])

  const scores = useMemo(() => billingScores(all, coordinators.map((c) => c.id), range.from, range.to), [all, coordinators, range.from, range.to])
  const unsolved = inPeriod.filter((i) => !i.solution_date && !i.solution).length
  const counted = scores.reduce((sum, s) => sum + s.issues, 0)
  const withIssues = scores.filter((s) => s.issues > 0).length

  const download = async () => {
    const { downloadWorkbook } = await import('@/features/snapshots/download')
    downloadWorkbook(`Billing issues ${today}.xlsx`, [
      {
        name: 'Billing issues',
        rows: [
          ['Sr. No', 'Date', 'Responsible Person 1', 'Responsible Person 2', 'Responsible Person 3', 'Customer Name', 'Issue', 'Issue Date', 'Solution', 'Solution Date', 'Invoice Number', 'CN Number', 'DN Number', 'Account Team Remarks', 'Coordinator Team Remarks'],
          ...[...rows].sort((a, b) => a.sr_no - b.sr_no).map((i) => [
            i.sr_no, i.date, responsibleName(i.responsible_1), responsibleName(i.responsible_2), responsibleName(i.responsible_3),
            i.customer_name, i.issue, i.issue_date ?? '', i.solution ?? '', i.solution_date ?? '', i.invoice_no ?? '',
            i.cn_no ?? '', i.dn_no ?? '', i.account_remarks ?? '', i.coordinator_remarks ?? '',
          ]),
        ],
      },
      ...(canManageTeam
        ? [{ name: 'Scores', rows: [['Coordinator', 'Total issues', 'Score'], ...scores.map((s) => [responsibleName(s.coordinatorId), s.issues, s.score])] }]
        : []),
    ])
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Billing Issues" subtitle="Billing mistakes, how they were solved, and who was responsible">
        <Button variant="outline" onClick={download} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Excel
        </Button>
        <Button onClick={() => setEditing('new')} data-testid="billing-new">
          <Plus className="mr-2 h-4 w-4" /> Log issue
        </Button>
      </PageHeader>

      <GlassCard className="flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" /> Period (by issue log date)
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
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Responsible person 1
          </p>
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="h-9 w-[190px]" aria-label="Responsible person 1">
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
        <p className="ml-auto text-xs text-muted-foreground">{periodLabel}</p>
      </GlassCard>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Issues logged" value={inPeriod.length} icon={AlertTriangle} color="rose" hint={periodLabel} />
        <KpiCard title="Not solved yet" value={unsolved} icon={AlertTriangle} color="amber" hint="No solution or solution date" />
        {canManageTeam && (
          <>
            <KpiCard title="Counted on coordinators" value={counted} icon={Users} color="blue" hint="As Responsible Person 1" />
            <KpiCard title="Coordinators with issues" value={`${withIssues} of ${scores.length}`} icon={Gauge} color="violet" hint="The rest score 100" />
          </>
        )}
      </div>

      {canManageTeam && (
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {([
            { id: 'issues', label: 'Issues', icon: List },
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
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <GlassCard className="space-y-3 p-4 sm:p-6">
            <div>
              <h3 className="text-base font-medium">Coordinator scores</h3>
              <p className="text-xs text-muted-foreground">{periodLabel} · issues where the coordinator is Responsible Person 1</p>
            </div>
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-sm" data-testid="billing-scores">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Coordinator</th>
                    <th className="px-3 py-2.5 text-right font-medium">Total issues</th>
                    <th className="px-3 py-2.5 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {scores.map((s) => (
                    <tr
                      key={s.coordinatorId}
                      className="cursor-pointer hover:bg-muted/30"
                      title="Show this person's issues"
                      onClick={() => {
                        setPerson(s.coordinatorId)
                        setView('issues')
                      }}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium">{responsibleName(s.coordinatorId)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.issues}</td>
                      <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', scoreClass(s.score))}>{s.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3 p-4 sm:p-6">
            <div>
              <h3 className="text-base font-medium">How the score works</h3>
              <p className="text-xs text-muted-foreground">Issues in the period where the coordinator is Responsible Person 1.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left font-medium">Issues</th>
                  <th className="py-1.5 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {BILLING_SCORE_TIERS.map((t) => (
                  <tr key={t.label}>
                    <td className="py-1.5">{t.label}</td>
                    <td className={cn('py-1.5 text-right font-semibold tabular-nums', scoreClass(t.score))}>{t.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">Responsible persons 2 and 3, and departments such as Billing or Production side, are not scored.</p>
          </GlassCard>
        </div>
      ) : (
        <GlassCard className="space-y-4 p-4 sm:p-6">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Customer, issue, invoice, CN/DN, person" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {all.length === 0 ? 'No billing issues yet. Use "Log issue" to add the first.' : 'No billing issues match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-sm" data-testid="billing-table">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Sr. No</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Responsible</th>
                    <th className="px-3 py-3 font-medium">Customer</th>
                    <th className="px-3 py-3 font-medium">Issue</th>
                    <th className="px-3 py-3 font-medium">Invoice / CN / DN</th>
                    <th className="px-3 py-3 font-medium">Solution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map((i) => {
                    const others = [i.responsible_2, i.responsible_3].filter(Boolean).map(responsibleName)
                    const refs = [i.invoice_no && `Inv ${i.invoice_no}`, i.cn_no && `CN ${i.cn_no}`, i.dn_no && `DN ${i.dn_no}`].filter(Boolean)
                    return (
                      <tr key={i.id} className="cursor-pointer align-top hover:bg-muted/30" onClick={() => setEditing(i)} data-testid="billing-row">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{i.sr_no}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {formatDate(i.date)}
                          {i.issue_date && i.issue_date !== i.date && <div className="text-xs text-muted-foreground">Issue {formatDate(i.issue_date)}</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="font-medium">{responsibleName(i.responsible_1) || '—'}</div>
                          {others.length > 0 && <div className="text-xs text-muted-foreground">{others.join(', ')}</div>}
                        </td>
                        <td className="min-w-[160px] px-3 py-3 font-medium">{i.customer_name}</td>
                        <td className="min-w-[220px] max-w-[320px] px-3 py-3">
                          <div className="line-clamp-2" title={i.issue}>
                            {i.issue}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs">{refs.length ? refs.join(' · ') : '—'}</td>
                        <td className="min-w-[180px] max-w-[280px] px-3 py-3">
                          {i.solution || i.solution_date ? (
                            <>
                              <div className="line-clamp-2" title={i.solution ?? ''}>
                                {i.solution ?? 'Solved'}
                              </div>
                              {i.solution_date && <div className="text-xs text-muted-foreground">{formatDate(i.solution_date)}</div>}
                            </>
                          ) : (
                            <span className="text-xs font-medium text-amber-600">Not solved yet</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {editing && (
        <BillingIssueDialog
          issue={editing === 'new' ? null : editing}
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
