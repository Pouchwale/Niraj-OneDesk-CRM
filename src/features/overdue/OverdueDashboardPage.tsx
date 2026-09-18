import { useProgressiveRows, MoreRowsFooter } from '@/components/shared/progressive-rows';
import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { motion, type Variants } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, RefreshCcw, Search, AlertTriangle, IndianRupee, Clock, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SaveTodayButton } from '@/features/snapshots/SaveTodayButton';
import { GlassCard } from '@/components/shared/GlassCard';
import { KpiCard } from '@/components/shared/KpiCard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DueDaysFilter } from '@/components/shared/DueDaysFilter';
import { AttentionChip, AttentionGroupRow, ViewSwitch, type PaymentsView } from '@/components/shared/attention-ui';
import { ExcelSourceCard } from '@/components/shared/ExcelSourceCard';
import { countByReason, groupStartingAt, overdueAttention, sortByAttention } from '@/lib/attention';
import { isSetAside } from '@/lib/no-followup';
import { overdueRowStats } from '@/lib/row-stats';
import { AGEING_FILTER_PRESETS, matchesAgeingRange, type DueFilterPreset } from '@/lib/due-filter';
import { toast } from 'sonner';

import { getOverduePayments, getOverdueStats, type OverdueStats } from '@/lib/overdue-api';
import { getFollowupSummaryByCompany, type CompanyFollowupSummary } from '@/lib/followups-api';
import { type OverduePayment } from '@/lib/types';
import { formatCurrency, formatDate, formatRelativeDate, cn } from '@/lib/utils';
import { useAuth, getCoordinatorDisplayName } from '@/features/auth/AuthContext';

import { OverdueDetailPanel } from './components/OverdueDetailPanel';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function statusBadgeClass(status: OverduePayment['status']) {
  switch (status) {
    case 'critical':
      return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    case 'overdue':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'settled':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    case 'bankrupt':
      return 'bg-rose-500/15 text-rose-600 border-rose-500/40 dark:text-rose-400';
    default:
      return '';
  }
}

export function OverdueDashboardPage() {
  const { user, canManageTeam } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [payments, setPayments] = useState<OverduePayment[]>([]);
  const [stats, setStats] = useState<OverdueStats | null>(null);
  const [followupSummary, setFollowupSummary] = useState<Map<string, CompanyFollowupSummary>>(new Map());
  const [isLoading, setIsLoading] = useState(true);


  const [searchQuery, setSearchQuery] = useState('');
  /*
   * In the URL for the same reason as on the Active Payments page: a card that
   * counts something must be able to open exactly what it counted.
   */
  const statusFilter = searchParams.get('status') || 'all';
  const setStatusFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next && next !== 'all') params.set('status', next);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  };
  /** Ageing window: a bucket preset or a range the person defined. */
  const [ageingFilter, setAgeingFilter] = useState<DueFilterPreset | null>(null);
  // The window lives in the URL, so a dashboard card or Robi can open the
  // "Critical & closing in" list directly and a reload keeps it.
  const view: PaymentsView = searchParams.get('view') === 'attention' ? 'attention' : 'all';
  const setView = (next: PaymentsView) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'attention') params.set('view', 'attention');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  const selectedId = searchParams.get('payment');

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      // Coordinators only ever see the balances assigned to them.
      const scope = canManageTeam ? undefined : user.id;
      const [rows, kpis, summary] = await Promise.all([
        getOverduePayments(scope),
        getOverdueStats(scope),
        getFollowupSummaryByCompany(scope),
      ]);
      setPayments(rows);
      setStats(kpis);
      setFollowupSummary(summary);
    } catch (error) {
      toast.error('Failed to load overdue payments.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, canManageTeam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return payments.filter((p) => {
      // Set aside means out of every working view. They are reachable only by
      // asking for them by name, so the money is findable but never in the way.
      // Set aside (no follow-up or bankrupt) never appears on this screen: its
      // own register on the Overview is the one place it is listed.
      if (isSetAside(p)) {
        return false;
      } else if (statusFilter === 'critical') {
        if (p.status === 'settled' || ((p.due_91_120 || 0) <= 0 && (p.due_121_plus || 0) <= 0)) return false;
      } else if (statusFilter !== 'all' && p.status !== statusFilter) return false;

      // Ageing window: any bucket the range touches must carry money.
      if (ageingFilter && !matchesAgeingRange(p, ageingFilter)) return false;
      // The second window: money past 90 days, or about to cross it.
      if (view === 'attention' && !overdueAttention(p)) return false;
      if (!query) return true;
      return (
        (p.customer_name || '').toLowerCase().includes(query) ||
        p.bp_code.toLowerCase().includes(query) ||
        (p.coordinator_name || '').toLowerCase().includes(query)
      );
    });
  }, [payments, searchQuery, statusFilter, ageingFilter, view]);

  // In the second window the order is urgency: the oldest money first.
  const displayRows = useMemo(
    () => (view === 'attention' ? sortByAttention(filtered, overdueAttention) : filtered),
    [view, filtered]
  );

  // Drawn a batch at a time; every figure still counts displayRows in full.
  const progressive = useProgressiveRows(displayRows, {
    resetKey: [view, searchQuery, statusFilter, JSON.stringify(ageingFilter)].join('|'),
  });

  // Everything this screen can list: set-aside balances are not among them.
  const visibleCount = useMemo(() => payments.filter((p) => !isSetAside(p)).length, [payments]);
  const attentionCounts = useMemo(() => countByReason(payments, overdueAttention), [payments]);
  const attentionTotal = attentionCounts.critical + attentionCounts.overdue;
  const displayCounts = useMemo(() => countByReason(displayRows, overdueAttention), [displayRows]);

  // Whenever anything narrows the list, the cards describe the list, with the
  // same rules the unfiltered figures use (critical = money past 90 days).
  const isNarrowed = view === 'attention' || !!searchQuery.trim() || statusFilter !== 'all' || !!ageingFilter;
  const shown = useMemo(
    () => (isNarrowed ? overdueRowStats(displayRows) : stats),
    [isNarrowed, displayRows, stats]
  );

  const selectedPayment = useMemo(
    () => payments.find((p) => p.id === selectedId) ?? null,
    [payments, selectedId]
  );

  const openPayment = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('payment', id);
    else next.delete('payment');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={canManageTeam ? 'Overdue Payments' : 'My Overdue Payments'}
        subtitle="Chase ageing receivables and log every conversation"
      />

      {canManageTeam && (
        <>
          <ExcelSourceCard book="overdue" adminId={user?.id} onImported={loadData} />
          {/* Freezes today's book for the weekly coordinator score (Weekly KPI). */}
          <div className="flex justify-end">
            <SaveTodayButton />
          </div>
        </>
      )}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div variants={itemVariants}>
          <KpiCard title="Accounts" value={shown?.total ?? 0} icon={FileSpreadsheet} color="blue" />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard title="Critical (90+ days)" value={shown?.critical ?? 0} icon={AlertTriangle} color="rose" />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard title="In Progress" value={shown?.inProgress ?? 0} icon={Clock} color="amber" />
        </motion.div>
        <motion.div variants={itemVariants}>
          <KpiCard
            title="Outstanding"
            // Formatted the way every other screen formats money.
            value={formatCurrency(shown?.totalBalance ?? 0)}
            // Set-aside money (no follow-up or bankrupt) is not in this figure and
            // not named here: its register on the Overview is where it is listed.
            icon={IndianRupee}
            color="emerald"
          />
        </motion.div>
      </motion.div>

      <div className="flex flex-wrap items-center gap-3">
        <ViewSwitch value={view} onChange={setView} allCount={visibleCount} attentionCount={attentionTotal} />
        {view === 'attention' && (
          <p className="text-xs text-muted-foreground">
            {attentionCounts.critical} with money past 90 days · {attentionCounts.overdue} with money in the
            61–90 day bucket
          </p>
        )}
        {isNarrowed && (
          <p className="text-xs text-muted-foreground sm:ml-auto" data-testid="showing-line">
            Showing {displayRows.length} of {visibleCount} balances · the cards above describe what is shown
          </p>
        )}
      </div>

      <GlassCard className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, BP code, coordinator..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
              </SelectContent>
            </Select>
            <DueDaysFilter
              value={ageingFilter}
              onChange={setAgeingFilter}
              userId={user?.id}
              presets={AGEING_FILTER_PRESETS}
              overdueOnly
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <RefreshCcw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : displayRows.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="font-medium">
                {payments.length === 0 ? 'No overdue payments yet' : 'Nothing matches your filters'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {payments.length === 0 && canManageTeam
                  ? 'Sync the connected ageing workbook above to start tracking collections.'
                  : payments.length === 0
                    ? 'Nothing is assigned to you right now.'
                    : 'Try clearing the search or status filter.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Balance Due</th>
                  <th className="px-4 py-3 font-medium">Coordinator</th>
                  <th className="px-4 py-3 font-medium">Last Follow-Up</th>
                  <th className="px-4 py-3 font-medium">Next Committed</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {progressive.visible.map((payment, index) => {
                  const summary = followupSummary.get(payment.id);
                  const attention = view === 'attention' ? overdueAttention(payment) : null;
                  const group = view === 'attention' ? groupStartingAt(displayRows, index, overdueAttention) : null;

                  return (
                    <Fragment key={payment.id}>
                    {group && <AttentionGroupRow reason={group} count={displayCounts[group]} colSpan={6} />}
                    <tr
                      onClick={() => openPayment(payment.id)}
                      className={cn(
                        'cursor-pointer hover:bg-muted/30 transition-colors',
                        payment.status === 'critical' && 'border-l-4 border-l-rose-500 bg-rose-500/5'
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{payment.customer_name || '-'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{payment.bp_code}</div>
                        {attention && <AttentionChip attention={attention} className="mt-1" />}
                      </td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(payment.balance_due)}</td>
                      <td className="px-4 py-3">
                        {payment.assigned_coordinator_id
                          ? getCoordinatorDisplayName(payment.assigned_coordinator_id)
                          : payment.coordinator_name || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3">
                        {summary?.lastFollowupDate ? formatRelativeDate(summary.lastFollowupDate) : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        {summary?.nextCommittedDate ? (
                          <span>
                            {formatDate(summary.nextCommittedDate)}
                            {summary.nextCommittedAmount ? ` · ${formatCurrency(summary.nextCommittedAmount)}` : ''}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('uppercase text-[10px]', statusBadgeClass(payment.status))}>
                          {payment.status.replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
                <MoreRowsFooter state={progressive} colSpan={6} />
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <OverdueDetailPanel
        payment={selectedPayment}
        open={!!selectedPayment}
        onClose={() => openPayment(null)}
        isAdmin={canManageTeam}
        currentUserId={user?.id}
        onChanged={loadData}
      />
    </div>
  );
}
