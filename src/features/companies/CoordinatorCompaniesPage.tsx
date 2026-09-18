import { useProgressiveRows, MoreRowsFooter } from '@/components/shared/progressive-rows';
import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { GlassCard } from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, AlertTriangle, Calendar, IndianRupee, Search, AlertCircle } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { formatCurrency, formatRelativeDate, formatDate } from '@/lib/utils';
import { getCompanies, getCompanyStats, type CompanyStats } from '@/lib/companies-api';
import { DueDaysFilter } from '@/components/shared/DueDaysFilter';
import { AttentionChip, AttentionGroupRow, ViewSwitch, type PaymentsView } from '@/components/shared/attention-ui';
import { companyAttention, countByReason, groupStartingAt, sortByAttention } from '@/lib/attention';
import { companyRowStats } from '@/lib/row-stats';
import { matchesDueRange, type DueFilterPreset } from '@/lib/due-filter';
import {
  getFollowupStats,
  getOverdueCommitments,
  getFollowupSummaryByCompany,
  type CompanyFollowupSummary,
} from '@/lib/followups-api';
import { useAuth } from '@/features/auth/AuthContext';
import { CompanyDetailPanel } from './CompanyDetailPanel';
import { FollowupHistoryView } from './FollowupHistoryView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Company } from '@/lib/types';
import { demoCompanyStore } from '@/lib/demo-companies';
import { isSetAside } from '@/lib/no-followup';

export function CoordinatorCompaniesPage() {
  const { user } = useAuth();
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);
  const [overdueCommitments, setOverdueCommitments] = useState<any[]>([]);
  const [followupSummary, setFollowupSummary] = useState<Map<string, CompanyFollowupSummary>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  /** Bumped when a follow-up is saved, so the history tab re-reads. */
  const [historyKey, setHistoryKey] = useState(0);

  // Notifications link straight to an account with ?company=<id>. Only an
  // account on this coordinator's own list is opened; anything else is ignored
  // rather than leaking a record they are not assigned.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedCompanyId = searchParams.get('company');
  useEffect(() => {
    if (!linkedCompanyId || companies.length === 0) return;
    if (companies.some((c) => c.id === linkedCompanyId)) setSelectedCompanyId(linkedCompanyId);
  }, [linkedCompanyId, companies]);

  const closePanel = () => {
    setSelectedCompanyId(null);
    if (linkedCompanyId) {
      const next = new URLSearchParams(searchParams);
      next.delete('company');
      setSearchParams(next, { replace: true });
    }
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  /*
   * In the URL, as on the leader's version of this page: her "Past 90 days"
   * card counts critical invoices, and clicking it has to open those invoices
   * and no others. A card that cannot be checked in one click is a card she
   * has no reason to believe.
   */
  const statusFilter = searchParams.get('status') || 'all';
  const setStatusFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next && next !== 'all') params.set('status', next);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  };
  /** "Payment due" window: preset or a range the coordinator defined. */
  const [dueFilter, setDueFilter] = useState<DueFilterPreset | null>(null);
  // The window lives in the URL, so a dashboard card or Robi can open the
  // "Critical & closing in" list directly and a reload keeps it.
  const view: PaymentsView = searchParams.get('view') === 'attention' ? 'attention' : 'all';
  const setView = (next: PaymentsView) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'attention') params.set('view', 'attention');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      // Scope the query to this coordinator rather than fetching every company.
      const [myCompanies, myStats, myOverdueCommitments, mySummary] = await Promise.all([
        getCompanies(user.id),
        // The same figures the leader's Active Payments cards use, scoped to
        // this coordinator, so the two screens never disagree about a number.
        getCompanyStats(user.id),
        getOverdueCommitments(user.id),
        getFollowupSummaryByCompany(user.id),
      ]);
      setCompanies(myCompanies);
      setCompanyStats(myStats);
      setOverdueCommitments(myOverdueCommitments);
      setFollowupSummary(mySummary);
    } catch (error) {
      console.error('Failed to load coordinator data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Read straight from the shared stats so "Overdue" counts critical accounts
  // and "Outstanding" leaves out paid ones, exactly as the leader's cards do.
  const stats = useMemo(
    () => ({
      total: companyStats?.total ?? companies.length,
      overdue: (companyStats?.overdue ?? 0) + (companyStats?.critical ?? 0),
      followupsToday: companyStats?.followupsDueToday ?? 0,
      totalOutstanding: companyStats?.totalOutstanding ?? 0,
      // Held out of the figure above, and shown beneath it.
      noFollowup: companyStats?.noFollowup ?? 0,
      noFollowupAmount: companyStats?.noFollowupAmount ?? 0,
    }),
    [companyStats, companies.length]
  );

  const filteredCompanies = useMemo(() => {
    return companies.filter(company => {
      // Searchable by invoice number too: with one row per invoice it is the
      // quickest way to find the row a customer is asking about on the phone.
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        company.name.toLowerCase().includes(q) ||
        Boolean(company.invoice_no && company.invoice_no.toLowerCase().includes(q)) ||
        Boolean(company.contact_person && company.contact_person.toLowerCase().includes(q));
      /*
       * Paid and set-aside invoices are out of the working list by default -
       * this module is what is still to be collected - and reachable by asking
       * for them in the status filter.
       */
      // Set aside (no follow-up or bankrupt) never appears here at all.
      const matchesStatus =
        !isSetAside(company) &&
        (statusFilter === 'paid'
          ? company.status === 'paid'
          : company.status !== 'paid' && (statusFilter === 'all' || company.status === statusFilter));
      // Payment-due window: days from today to the due date.
      const matchesDue = !dueFilter || matchesDueRange(company.due_date, dueFilter);
      // The second window: critical, turning critical, or due this week.
      const matchesView = view === 'all' || companyAttention(company) !== null;
      return matchesSearch && matchesStatus && matchesDue && matchesView;
    });
  }, [companies, searchQuery, statusFilter, dueFilter, view]);

  // In the second window the order is urgency: what needs deciding first sits at the top.
  const displayRows = useMemo(
    () => (view === 'attention' ? sortByAttention(filteredCompanies, companyAttention) : filteredCompanies),
    [view, filteredCompanies]
  );

  // Drawn a batch at a time; every figure still counts displayRows in full.
  const progressive = useProgressiveRows(displayRows, {
    resetKey: [view, searchQuery, statusFilter, JSON.stringify(dueFilter)].join('|'),
  });
  const attentionCounts = useMemo(() => countByReason(companies, companyAttention), [companies]);
  const attentionTotal = attentionCounts.critical + attentionCounts.overdue + attentionCounts.due_soon;
  const displayCounts = useMemo(() => countByReason(displayRows, companyAttention), [displayRows]);

  // Whenever anything narrows the list, the cards describe the list, with the
  // same rules the unfiltered figures use. Follow-ups due is not a row figure.
  // The size of the working list, which is what "all" now shows.
  const workingCount = useMemo(
    () => companies.filter((c) => c.status !== 'paid' && !isSetAside(c)).length,
    [companies]
  );

  const isNarrowed = view === 'attention' || !!searchQuery || statusFilter !== 'all' || !!dueFilter;
  const shown = useMemo(() => {
    if (!isNarrowed) return stats;
    const rows = companyRowStats(displayRows);
    return {
      ...stats,
      total: rows.total,
      overdue: rows.overdue + rows.critical,
      totalOutstanding: rows.totalOutstanding,
      noFollowup: rows.noFollowup,
      noFollowupAmount: rows.noFollowupAmount,
    };
  }, [isNarrowed, displayRows, stats]);

  const hasOverdueCommitments = overdueCommitments.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Active Payments"
        subtitle="Track payments and follow-ups for the accounts assigned to you"
      />

      <Tabs defaultValue="accounts" className="space-y-6">
        <TabsList>
          <TabsTrigger value="accounts">My Accounts</TabsTrigger>
          <TabsTrigger value="history">My Follow-ups</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="outline-none">
          {/* Pinned to this coordinator: her own trail, across every account. */}
          {user && <FollowupHistoryView coordinatorId={user.id} refreshKey={historyKey} hideSetAside />}
        </TabsContent>

        <TabsContent value="accounts" className="space-y-6 outline-none">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="My Accounts"
          value={shown.total.toString()}
          icon={Building2}
          delta="Total assigned"
          deltaType="neutral"
        />
        <KpiCard
          title="Overdue + Critical"
          value={shown.overdue.toString()}
          icon={AlertTriangle}
          delta="Needs attention"
          deltaType="down"
        />
        <KpiCard
          title="Follow-ups Due"
          value={stats.followupsToday.toString()}
          icon={Calendar}
          delta="Reminders that have come due"
          deltaType="neutral"
        />
        <KpiCard
          title="Outstanding Amount"
          value={formatCurrency(shown.totalOutstanding)}
          // Set-aside money is out of this figure and listed only in its register.
          icon={IndianRupee}
          delta="Across your active payments"
          deltaType="neutral"
        />
      </div>

      {hasOverdueCommitments && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg p-4 flex items-center space-x-3"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            ⚠️ You have {overdueCommitments.length} overdue commitments that need attention
          </p>
        </motion.div>
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

      <GlassCard className="p-4 flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="current">Current</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <DueDaysFilter value={dueFilter} onChange={setDueFilter} userId={user?.id} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border/50">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Company Name</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Payment Terms</th>
                <th className="px-4 py-3 font-medium">Total Amount</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium">Days Overdue</th>
                <th className="px-4 py-3 font-medium">Last Follow-Up</th>
                <th className="px-4 py-3 font-medium">Next Committed</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {progressive.visible.map((company, index) => {
                const isOverdueCommitment = overdueCommitments.some(c => c.company_id === company.id);
                const summary = followupSummary.get(company.id);
                const attention = view === 'attention' ? companyAttention(company) : null;
                const group = view === 'attention' ? groupStartingAt(displayRows, index, companyAttention) : null;

                // Positive only once the due date has actually passed.
                const daysOverdue = company.due_date
                  ? Math.max(0, differenceInDays(new Date(), parseISO(company.due_date)))
                  : 0;

                let isFollowupToday = false;
                if (company.due_date) {
                  const diff = differenceInDays(parseISO(company.due_date), new Date());
                  isFollowupToday = diff === 0;
                }

                return (
                  <Fragment key={company.id}>
                  {group && <AttentionGroupRow reason={group} count={displayCounts[group]} colSpan={10} />}
                  <tr
                    onClick={() => setSelectedCompanyId(company.id)}
                    className={cn(
                      "cursor-pointer hover:bg-muted/30 transition-colors",
                      isOverdueCommitment ? "border-l-4 border-l-rose-500 bg-rose-500/5" : "",
                      isFollowupToday && !isOverdueCommitment ? "border-l-4 border-l-amber-500 bg-amber-500/5" : ""
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {company.name}
                      {attention && <AttentionChip attention={attention} className="mt-1 block w-fit" />}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{company.invoice_no || '-'}</td>
                    <td className="px-4 py-3">{company.contact_person || '-'}</td>
                    <td className="px-4 py-3">{company.payment_terms || '-'}</td>
                    <td className="px-4 py-3">{formatCurrency(company.total_amount || 0)}</td>
                    <td className="px-4 py-3">
                      {company.due_date ? new Date(company.due_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {daysOverdue > 0 ? (
                        <span className="text-rose-500 font-medium">{daysOverdue} days</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {summary?.lastFollowupDate ? formatRelativeDate(summary.lastFollowupDate) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      {summary?.nextCommittedDate ? (
                        <span>
                          {formatDate(summary.nextCommittedDate)}
                          {summary.nextCommittedAmount
                            ? ` · ${formatCurrency(summary.nextCommittedAmount)}`
                            : ''}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={company.status === 'overdue' ? 'destructive' : 'default'}>
                        {company.status}
                      </Badge>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
              <MoreRowsFooter state={progressive} colSpan={10} />
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No companies found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
        </TabsContent>
      </Tabs>

      {selectedCompanyId && (
        <CompanyDetailPanel
          company={companies.find(c => c.id === selectedCompanyId) || null}
          open={!!selectedCompanyId}
          onClose={closePanel}
          currentUserId={user?.id}
          isAdmin={false}
          onFollowupSaved={() => { loadData(); setHistoryKey((k) => k + 1); }}
          onChanged={() => { loadData(); setHistoryKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
