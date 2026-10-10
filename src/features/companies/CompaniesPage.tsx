import { useProgressiveRows, MoreRowsFooter } from '@/components/shared/progressive-rows'
import { Fragment, useState, useEffect, useMemo } from 'react'
import { AttentionChip, AttentionGroupRow, ViewSwitch, type PaymentsView } from '@/components/shared/attention-ui'
import { companyAttention, countByReason, groupStartingAt, sortByAttention } from '@/lib/attention'
import { companyRowStats } from '@/lib/row-stats'
import { ExcelSourceCard } from '@/components/shared/ExcelSourceCard'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DueDaysFilter } from '@/components/shared/DueDaysFilter'
import { matchesDueRange, type DueFilterPreset } from '@/lib/due-filter'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Building2, AlertTriangle, Clock, IndianRupee, Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, RefreshCcw, Download } from 'lucide-react'
import { differenceInDays, parseISO } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { getCompanies, getCompanyStats, type CompanyStats } from '@/lib/companies-api'
import { useAuth, rowOwner } from '@/features/auth/AuthContext'
import { OwnerFilter, OwnerName } from '@/components/shared/OwnerFilter'
import { SetAsideMatches } from '@/components/shared/SetAsideMatches'
import { OWNER_ALL, OWNER_NOT_IN_CRM, matchesOwner, ownerOptions } from '@/lib/owner'
// The wizard carries the spreadsheet parser; load it the first time someone
// actually uploads rather than with the page.
import { CompanyDetailPanel } from './CompanyDetailPanel'
import { cn } from '@/lib/utils'
import type { Company } from '@/lib/types'
import { isSetAside } from '@/lib/no-followup'

export function CompaniesPage() {
  const { user, canManageTeam } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [stats, setStats] = useState<CompanyStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)

  // Notifications and the assistant link straight to an account with
  // ?company=<id>; the link is honoured here the way the overdue page honours
  // ?payment=.
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedCompanyId = searchParams.get('company')
  useEffect(() => {
    if (!linkedCompanyId || companies.length === 0) return
    const linked = companies.find((c) => c.id === linkedCompanyId)
    if (linked) setSelectedCompany(linked)
  }, [linkedCompanyId, companies])

  const closePanel = () => {
    setSelectedCompany(null)
    if (linkedCompanyId) {
      const next = new URLSearchParams(searchParams)
      next.delete('company')
      setSearchParams(next, { replace: true })
    }
  }

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  /*
   * The status lives in the URL so a dashboard card can land on exactly the
   * rows it counted. A card that says ₹1.9Cr past 90 days and then opens a
   * list of something else is how people stop believing the figure — the
   * point of every card is that it can be checked in one click.
   */
  const statusFilter = searchParams.get('status') || 'all'
  const setStatusFilter = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next && next !== 'all') params.set('status', next)
    else params.delete('status')
    setSearchParams(params, { replace: true })
  }
  // In the URL too, so the Overview's per-coordinator rows can open exactly
  // the invoices they counted - including a name the file uses that has no login.
  const coordinatorFilter = searchParams.get('owner') || OWNER_ALL
  const setCoordinatorFilter = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next && next !== OWNER_ALL) params.set('owner', next)
    else params.delete('owner')
    setSearchParams(params, { replace: true })
  }
  const ownerOfRow = (company: Company) => rowOwner(company)
  /** "Payment due" window: preset or a range the person defined. */
  const [dueFilter, setDueFilter] = useState<DueFilterPreset | null>(null)
  // The window lives in the URL, so a dashboard card or Robi can open the
  // "Critical & closing in" list directly and a reload keeps it.
  const view: PaymentsView = searchParams.get('view') === 'attention' ? 'attention' : 'all'
  const setView = (next: PaymentsView) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'attention') params.set('view', 'attention')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }
  
  // Sort
  const [sortField, setSortField] = useState<keyof Company | 'days_overdue'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [comps, st] = await Promise.all([
        getCompanies(),
        getCompanyStats()
      ])
      setCompanies(comps || [])
      setStats(st)
    } catch (error) {
      toast.error('Failed to load companies data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSort = (field: keyof Company | 'days_overdue') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
    return sortOrder === 'asc' ? <ChevronUp className="ml-2 h-3 w-3" /> : <ChevronDown className="ml-2 h-3 w-3" />
  }

  /** Every filter but the coordinator's: what the coordinator options count. */
  const beforeOwnerFilter = useMemo(() => {
    return companies
      .filter((company) => {
        // Search filter
        if (searchQuery) {
          const lowerQuery = searchQuery.toLowerCase()
          // The invoice number is searched too: it is the one thing that
          // tells a customer's rows apart, so looking one up by number is the
          // obvious way to find the row somebody is asking about.
          if (!company.name.toLowerCase().includes(lowerQuery) &&
              !(company.sap_bp_code && company.sap_bp_code.toLowerCase().includes(lowerQuery)) &&
              !(company.invoice_no && company.invoice_no.toLowerCase().includes(lowerQuery)) &&
              !(company.contact_person && company.contact_person.toLowerCase().includes(lowerQuery))) {
            return false
          }
        }
        
        /*
         * Active Payments is the work still to do, so the two kinds of closed
         * account never appear here: an invoice that is paid - the Excel file
         * no longer carries it, and the file is the truth - and one set aside
         * or declared bankrupt, whose register on the Overview is where it is
         * listed.
         */
        if (isSetAside(company)) {
          return false
        } else if (company.status === 'paid') {
          return false
        } else if (statusFilter !== 'all' && company.status !== statusFilter) {
          return false
        }
        
        // Payment-due window: days from today to the due date.
        if (dueFilter && !matchesDueRange(company.due_date, dueFilter)) {
          return false
        }

        // The second window: critical, turning critical, or due this week.
        if (view === 'attention' && !companyAttention(company)) {
          return false
        }

        return true
      })
  }, [companies, searchQuery, statusFilter, dueFilter, view])

  const ownerChoices = useMemo(
    () => ownerOptions(beforeOwnerFilter, rowOwner, (company) => company.total_amount || 0),
    [beforeOwnerFilter]
  )

  const filteredAndSortedCompanies = useMemo(() => {
    return beforeOwnerFilter
      .filter((company) => matchesOwner(rowOwner(company), coordinatorFilter))
      .sort((a, b) => {
        let aValue: any = a[sortField as keyof Company]
        let bValue: any = b[sortField as keyof Company]

        // By the name on screen, which for a name not in the CRM is the file's.
        if (sortField === 'assigned_coordinator_id') {
          aValue = rowOwner(a).name.toLowerCase()
          bValue = rowOwner(b).name.toLowerCase()
        }

        if (sortField === 'days_overdue') {
          const today = new Date()
          aValue = a.due_date ? differenceInDays(today, parseISO(a.due_date)) : 0
          bValue = b.due_date ? differenceInDays(today, parseISO(b.due_date)) : 0
        }

        if (aValue === bValue) return 0
        
        const isAsc = sortOrder === 'asc'
        if (aValue == null) return isAsc ? 1 : -1
        if (bValue == null) return isAsc ? -1 : 1
        
        return aValue < bValue ? (isAsc ? -1 : 1) : (isAsc ? 1 : -1)
      })
  }, [beforeOwnerFilter, coordinatorFilter, sortField, sortOrder])

  // In the second window the order is urgency, not the column the person
  // last sorted by: what needs deciding first sits at the top.
  const displayRows = useMemo(
    () => (view === 'attention' ? sortByAttention(filteredAndSortedCompanies, companyAttention) : filteredAndSortedCompanies),
    [view, filteredAndSortedCompanies]
  )

  /*
   * Only the first rows are drawn, more as the list scrolls. Every figure on
   * this page still counts displayRows in full; this changes what is drawn,
   * never what is counted. All 1,063 at once was 17,000 DOM nodes — the slow
   * first paint and the lag on the first keystroke in search.
   */
  const progressive = useProgressiveRows(displayRows, {
    resetKey: [view, searchQuery, statusFilter, coordinatorFilter, JSON.stringify(dueFilter), sortField, sortOrder].join('|'),
  })
  const attentionCounts = useMemo(() => countByReason(companies, companyAttention), [companies])
  const attentionTotal = attentionCounts.critical + attentionCounts.overdue + attentionCounts.due_soon
  /** Group sizes for the rows actually on screen, after the other filters. */
  const displayCounts = useMemo(() => countByReason(displayRows, companyAttention), [displayRows])

  // Whenever anything narrows the list, the cards describe the list - with
  // the same rules the unfiltered figures use - rather than the whole book.
  // What "all" means once the closed accounts are out of it. The "showing X
  // of Y" line has to count against this, or it says 30 of 1,011 when 1,011 is
  // not a number anybody can get to.
  const workingCount = useMemo(
    () => companies.filter((c) => c.status !== 'paid' && !isSetAside(c)).length,
    [companies]
  )

  const isNarrowed =
    view === 'attention' || !!searchQuery || statusFilter !== 'all' || coordinatorFilter !== 'all' || !!dueFilter
  const shown = useMemo(
    () => (isNarrowed ? companyRowStats(displayRows) : stats),
    [isNarrowed, displayRows, stats]
  )

  /** Everything listed - every filter applied - as a workbook, with a total. */
  const [downloading, setDownloading] = useState(false)
  const downloadList = async () => {
    setDownloading(true)
    try {
      const { downloadWorkbook, fileStamp } = await import('@/features/snapshots/download')
      const today = new Date()
      const paise = (value: number) => Math.round((value || 0) * 100) / 100
      const header = [
        'Company Name', 'BP Code', 'Invoice No', 'Contact Person', 'Contact Number', 'Email', 'Payment Terms',
        'Invoice Date', 'Due Date', 'Days Overdue', 'Amount (₹)', 'Coordinator', 'Coordinator in CRM', 'Status',
      ]
      let totalPaise = 0
      const body = displayRows.map((company) => {
        const owner = ownerOfRow(company)
        const days = company.due_date ? differenceInDays(today, parseISO(company.due_date)) : null
        totalPaise += Math.round((company.total_amount || 0) * 100)
        return [
          company.name, company.sap_bp_code ?? '', company.invoice_no ?? '', company.contact_person ?? '',
          company.contact_number ?? '', company.email ?? '', company.payment_terms ?? '',
          company.invoice_date ?? '', company.due_date ?? '', days !== null && days > 0 ? days : 0,
          paise(company.total_amount), owner.name, owner.inCrm ? 'Yes' : 'No', company.status,
        ]
      })
      const totals = ['TOTAL', `${displayRows.length} invoices`, '', '', '', '', '', '', '', '', totalPaise / 100, '', '', '']
      const scope =
        coordinatorFilter === OWNER_ALL
          ? 'all coordinators'
          : coordinatorFilter === OWNER_NOT_IN_CRM
            ? 'unknown names'
            : (ownerChoices.find((o) => o.key === coordinatorFilter)?.name ?? 'coordinator')
      downloadWorkbook(`Active payments - ${scope} - ${fileStamp(today.toISOString())}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'), [
        { name: 'Active payments', rows: [header, ...body, totals] },
      ])
    } catch {
      toast.error('Could not build the download.')
    } finally {
      setDownloading(false)
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'overdue':
      case 'critical':
        return 'destructive'
      case 'upcoming':
        return 'secondary'
      case 'paid':
        return 'default'
      default:
        return 'outline'
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Active Payments"
        subtitle="Track live receivables and manage assignments"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Accounts"
          value={shown?.total || 0}
          icon={Building2}
          color="blue"
        />
        <KpiCard
          title="Overdue + Critical"
          value={(shown?.overdue || 0) + (shown?.critical || 0)}
          icon={AlertTriangle}
          color="rose"
        />
        <KpiCard
          title="Upcoming Due"
          value={shown?.upcoming || 0}
          icon={Clock}
          color="amber"
        />
        <KpiCard
          title="Total Outstanding"
          // Formatted here so the figure reads the same as on the Overview
          // and the dashboard, rather than in the browser's locale grouping.
          value={formatCurrency(shown?.totalOutstanding || 0)}
          // Set-aside money is out of this figure and listed only in its register.
          icon={IndianRupee}
          color="emerald"
        />
      </div>

      {/* One view now: the accounts themselves. */}
      <div className="w-full space-y-4">
          {canManageTeam && (
            <ExcelSourceCard book="companies" adminId={user?.id} onImported={fetchData} />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <ViewSwitch value={view} onChange={setView} allCount={workingCount} attentionCount={attentionTotal} />
            {view === 'attention' && (
              <p className="text-xs text-muted-foreground">
                {attentionCounts.critical} critical · {attentionCounts.overdue} overdue · {attentionCounts.due_soon} due this week
              </p>
            )}
            {isNarrowed && (
              <p className="text-xs text-muted-foreground sm:ml-auto" data-testid="showing-line">
                Showing {displayRows.length} of {workingCount} accounts · the cards above describe what is shown
              </p>
            )}
          </div>
          <GlassCard className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts, BP code, contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full"
              />
            </div>
            <div className="flex w-full md:w-auto flex-col sm:flex-row gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>

              <DueDaysFilter value={dueFilter} onChange={setDueFilter} userId={user?.id} />

              <Button
                variant="outline"
                onClick={downloadList}
                disabled={downloading || displayRows.length === 0}
                title="Download every invoice listed, with the filters applied"
                data-testid="download-list"
              >
                <Download className="mr-2 h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>

          <OwnerFilter
            value={coordinatorFilter}
            onChange={setCoordinatorFilter}
            options={ownerChoices}
            rowNoun="invoice"
          />

          {/* A search for a customer that is set aside says so, rather than finding nothing. */}
          <SetAsideMatches
            query={searchQuery}
            companies={companies}
            canResume={canManageTeam}
            currentUserId={user?.id}
            onChanged={fetchData}
          />
          </GlassCard>

          {isLoading ? (
            <div className="flex justify-center p-12">
              <RefreshCcw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : displayRows.length === 0 ? (
            <GlassCard className="p-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Building2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">No Active Payments Found</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your filters or upload new data.</p>
            </GlassCard>
          ) : (
            <GlassCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('name')}>
                        <div className="flex items-center">Company Name <SortIcon field="name" /></div>
                      </th>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Terms</th>
                      <th className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('total_amount')}>
                        <div className="flex items-center">Amount (₹) <SortIcon field="total_amount" /></div>
                      </th>
                      <th className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('due_date')}>
                        <div className="flex items-center">Due Date <SortIcon field="due_date" /></div>
                      </th>
                      <th className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('days_overdue')}>
                        <div className="flex items-center">Days Overdue <SortIcon field="days_overdue" /></div>
                      </th>
                      <th className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('assigned_coordinator_id')}>
                        <div className="flex items-center">Coordinator <SortIcon field="assigned_coordinator_id" /></div>
                      </th>
                      <th className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('status')}>
                        <div className="flex items-center">Status <SortIcon field="status" /></div>
                      </th>
                    </tr>
                  </thead>
                  {/*
                    A plain body on purpose. Staggering the rows in at 0.1s
                    each cost ten seconds before the list could be used, and a
                    stagger nobody can perceive across a thousand rows is not
                    an animation, it is a wait.
                  */}
                  <tbody>
                    {progressive.visible.map((company, index) => {
                      const daysOverdue = company.due_date ? differenceInDays(new Date(), parseISO(company.due_date)) : 0;
                      const attention = view === 'attention' ? companyAttention(company) : null;
                      const group = view === 'attention' ? groupStartingAt(displayRows, index, companyAttention) : null;
                      return (
                        <Fragment key={company.id}>
                        {group && (
                          <AttentionGroupRow reason={group} count={displayCounts[group]} colSpan={9} />
                        )}
                        <tr
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => setSelectedCompany(company)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{company.name}</div>
                            {company.sap_bp_code && <div className="text-xs text-muted-foreground">{company.sap_bp_code}</div>}
                            {attention && <AttentionChip attention={attention} className="mt-1" />}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                            {company.invoice_no || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-foreground">{company.contact_person || '-'}</div>
                            <div className="text-xs text-muted-foreground">{company.contact_number || '-'}</div>
                          </td>
                          <td className="px-4 py-3">{company.payment_terms || '-'}</td>
                          <td className="px-4 py-3 font-medium">{formatCurrency(company.total_amount || 0)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {company.due_date ? new Date(company.due_date).toLocaleDateString('en-IN') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {daysOverdue > 0 ? (
                              <span className="text-rose-500 font-medium">{daysOverdue} days</span>
                            ) : (
                              <span className="text-emerald-500">On time</span>
                            )}
                          </td>
                          <td className="px-4 py-3"><OwnerName name={ownerOfRow(company).name} inCrm={ownerOfRow(company).inCrm} /></td>
                          <td className="px-4 py-3">
                            <Badge variant={getStatusBadgeVariant(company.status as string) as any} className="capitalize">
                              {company.status}
                            </Badge>
                          </td>
                        </tr>
                        </Fragment>
                      )
                    })}
                    <MoreRowsFooter state={progressive} colSpan={9} />
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
      </div>

      <CompanyDetailPanel
        company={selectedCompany}
        open={!!selectedCompany}
        onClose={closePanel}
        currentUserId={user?.id}
        isAdmin={canManageTeam}
        onChanged={fetchData}
      />
    </div>
  )
}
