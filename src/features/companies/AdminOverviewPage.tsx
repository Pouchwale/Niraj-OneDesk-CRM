import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlanHistoryView } from '@/features/assistant/PlanHistoryView';
import { ProofReview, useProofsToReview } from '@/features/assistant/ProofReview';
import { WeeklyScores } from '@/features/assistant/ScoresView';
import { DecisionApprovals, usePendingDecisions } from './DecisionApprovals';
import { AttendanceView } from './AttendanceView';
import { OverviewReportButton } from './OverviewReportButton';
import { motion } from 'motion/react';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiCard } from '@/components/shared/KpiCard';
import { GlassCard } from '@/components/shared/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, AlertTriangle, Users, IndianRupee, Clock, AlertCircle } from 'lucide-react';
import { formatCurrency, formatRelativeDate, todayISO } from '@/lib/utils';
import { getCompanies, getCompanyStats } from '@/lib/companies-api';
import { getOverduePayments } from '@/lib/overdue-api';
import { bookForCoordinator, buildReceivablesBook, summariseBook } from '@/lib/receivables-book';
import { teamPlans, type TeamPlan } from '@/features/assistant/plan-store';
import {
  getAllFollowups,
  getFollowupSummaryByCompany,
  getOverdueCommitmentDetails,
  type CompanyFollowupSummary,
  type OverdueCommitment,
} from '@/lib/followups-api';
import { getAllCoordinators, getCoordinatorDisplayName, rowOwner } from '@/features/auth/AuthContext';
import { OWNER_NONE_KEY, type Owner } from '@/lib/owner';
import { CompanyDetailPanel } from './CompanyDetailPanel';
import { FollowupHistoryView } from './FollowupHistoryView';
import { NoFollowupRegister } from './NoFollowupRegister';
import { isNoFollowup, listBankruptCustomers, setAsideKindOf } from '@/lib/no-followup';
import { normalizeBpCode } from '@/lib/bp-code';
import { BankruptRegister } from '@/features/overdue/components/BankruptRegister';
import { useAuth } from '@/features/auth/AuthContext';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { OverviewMobileNav, OverviewSideNav } from './OverviewNav';
import { cn } from '@/lib/utils';
import type { Company, Followup, OverduePayment } from '@/lib/types';
import { demoCompanyStore } from '@/lib/demo-companies';

/** Under an account count: how many are overdue, and how many of those are critical. */
function AccountSplit({ overdue, critical }: { overdue: number; critical: number }) {
  return (
    <div className="text-xs tabular-nums">
      <span className={cn('whitespace-nowrap', overdue > 0 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{overdue} overdue</span>
      <span className="text-muted-foreground"> · </span>
      <span className={cn('whitespace-nowrap', critical > 0 ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>{critical} critical</span>
    </div>
  );
}

export function AdminOverviewPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const navigate = useNavigate();
  const [overdueCommitments, setOverdueCommitments] = useState<OverdueCommitment[]>([]);
  const [overduePayments, setOverduePayments] = useState<OverduePayment[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [coordinators, setCoordinators] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [followupSummary, setFollowupSummary] = useState<Map<string, CompanyFollowupSummary>>(new Map());
  const { user } = useAuth();
  const [showAllMissed, setShowAllMissed] = useState(false);

  // In the URL so Robi's "see history" link can open a tab directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'summary';
  const proofsToReview = useProofsToReview();
  const pendingDecisions = usePendingDecisions();
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'summary') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  /** Shown on the tab so a declaration is never waiting unseen — from either book. */
  const bankruptCount = useMemo(
    () => listBankruptCustomers(companies, overduePayments).length,
    [companies, overduePayments]
  );

  // Customers, not records: setting aside is a decision about a customer, and
  // one of them usually carries several invoices and an ageing row.
  const setAsideCount = useMemo(() => {
    const plain = new Set<string>();
    const disputed = new Set<string>();
    const exported = new Set<string>();
    const pick = (r: Parameters<typeof setAsideKindOf>[0]) => { const k = setAsideKindOf(r); return k === 'export' ? exported : k === 'dispute' ? disputed : plain; };
    for (const c of companies) {
      if (isNoFollowup(c)) pick(c).add(normalizeBpCode(c.sap_bp_code) ?? `company:${c.id}`);
    }
    for (const o of overduePayments) {
      if (isNoFollowup(o)) pick(o).add(normalizeBpCode(o.bp_code) ?? `ageing:${o.id}`);
    }
    return { plain: plain.size, disputed: disputed.size, exported: exported.size };
  }, [companies, overduePayments]);

  const loadData = useCallback(async () => {
      setIsLoading(true);
      try {
        const allCompanies = await getCompanies();
        setCompanies(allCompanies);
        // Unscoped: the leader's view is the whole book, both records of it.
        setOverduePayments(await getOverduePayments());
        setFollowups(await getAllFollowups());

        // No coordinator filter: admins see broken commitments across the team.
        setOverdueCommitments(await getOverdueCommitmentDetails());
        setFollowupSummary(await getFollowupSummaryByCompany());
        
        const allCoords = typeof getAllCoordinators === 'function' ? await getAllCoordinators() : [];
        setCoordinators(allCoords);
      } catch (error) {
        console.error('Failed to load admin overview data:', error);
      } finally {
        setIsLoading(false);
      }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // One customer, one line: the shared book the dashboard and the assistant
  // read too, so the total here is the total everywhere.
  const book = useMemo(
    () => buildReceivablesBook({ companies, overduePayments, today: todayISO() }),
    [companies, overduePayments]
  );

  const stats = useMemo(() => {
    const totals = summariseBook(book);
    return {
      totalCompanies: totals.accounts,
      totalOverdue: totals.overdueAccounts,
      overdueCommitmentsCount: overdueCommitments.length,
      totalOutstanding: totals.outstanding,
      criticalAmount: totals.criticalAmount,
    };
  }, [book, overdueCommitments]);

  // Each coordinator's plan for today - the very plan their robot hands them.
  // Never made from an empty screen: a plan built before the data landed
  // would be empty, and an empty plan is one nobody works.
  const plans = useMemo<Map<string, TeamPlan>>(() => {
    if (isLoading || coordinators.length === 0) return new Map();
    return new Map(
      teamPlans(coordinators, companies, overduePayments, followups, todayISO()).map(t => [t.coordinatorId, t])
    );
  }, [isLoading, coordinators, companies, overduePayments, followups]);

  const coordinatorStats = useMemo(() => {
    if (coordinators.length === 0) return [];

    return coordinators.map(coord => {
      // The same book as the cards above, so every column reconciles to them.
      const mine = bookForCoordinator(book, coord.id);
      const totals = summariseBook(mine);
      const plan = plans.get(coord.id)?.plan ?? null;

      let latestFollowupDate: string | null = null;
      for (const account of mine) {
        // Follow-ups are filed on the company or the ageing row; a ledger-only
        // customer has neither, so it cannot have been contacted here.
        const recordId = account.company?.id ?? account.ageing?.id;
        const lastContact = recordId ? followupSummary.get(recordId)?.lastFollowupDate ?? null : null;
        if (lastContact && (!latestFollowupDate || new Date(lastContact) > new Date(latestFollowupDate))) {
          latestFollowupDate = lastContact;
        }
      }

      const coordOverdueCommitments = overdueCommitments.filter(oc => oc.coordinator_id === coord.id);

      return {
        id: coord.id,
        // getCoordinatorDisplayName takes an id, not the profile object.
        name: coord.full_name || getCoordinatorDisplayName(coord.id),
        totalCompanies: totals.accounts,
        overdue: totals.overdueAccounts,
        critical: totals.criticalAccounts,
        outstanding: totals.outstanding,
        lastFollowupDate: latestFollowupDate,
        overdueCommitmentsCount: coordOverdueCommitments.length,
        planDone: plan?.done ?? 0,
        planTotal: plan?.total ?? 0,
        planOpen: plan?.open ?? 0,
      };
    }).sort((a, b) => b.overdueCommitmentsCount - a.overdueCommitmentsCount || b.overdue - a.overdue);
  }, [coordinators, book, overdueCommitments, followupSummary, plans]);

  /*
   * The rest of the book, so the breakdown adds up to the cards above it:
   * accounts under a name the Excel file uses for someone with no login here,
   * and accounts booked to someone who is not a coordinator (the team leader).
   * Grouped by the name on the record, with the same totals as a coordinator's.
   */
  const otherOwnerStats = useMemo(() => {
    const coordinatorIds = new Set(coordinators.map((c) => c.id));
    const groups = new Map<string, { owner: Owner; accounts: typeof book }>();
    for (const account of book) {
      if (account.coordinatorId && coordinatorIds.has(account.coordinatorId)) continue;
      const record = account.company ?? account.ageing;
      const owner = record
        ? rowOwner(record)
        : { key: OWNER_NONE_KEY, name: 'Unassigned', inCrm: false };
      const group = groups.get(owner.key) ?? { owner, accounts: [] };
      group.accounts.push(account);
      groups.set(owner.key, group);
    }
    return [...groups.values()]
      .map(({ owner, accounts }) => ({ owner, totals: summariseBook(accounts) }))
      .sort((a, b) => Number(b.owner.inCrm) - Number(a.owner.inCrm) || b.totals.outstanding - a.totals.outstanding);
  }, [book, coordinators]);

  const MISSED_SHOWN = 8;
  const navCounts = {
    approvals: pendingDecisions,
    proofs: proofsToReview,
    noFollowup: setAsideCount.plain,
    dispute: setAsideCount.disputed,
    exported: setAsideCount.exported,
    bankrupt: bankruptCount,
  };

  return (
    // Wide screens: a console. The title bar and the section menu never move;
    // only the section on the right scrolls. (Viewport less the 4rem header and
    // the main area's 2rem padding top and bottom.) Narrow screens scroll whole.
    <div className="space-y-6 lg:flex lg:h-[calc(100vh-8rem)] lg:flex-col lg:space-y-0">
      <PageHeader
        title="Coordinator Overview"
        subtitle="Team performance, activity, approvals and set-aside customers in one place"
        className="lg:shrink-0"
      >
        <OverviewReportButton coordinators={coordinators} />
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row">
        <OverviewSideNav counts={navCounts} />
        <div
          className="min-w-0 flex-1 space-y-6 lg:overflow-y-auto lg:pb-6 lg:pr-2 scrollbar-thin [&_td]:px-3 [&_th]:px-3"
          data-testid="overview-content"
        >
        <OverviewMobileNav value={tab} onChange={setTab} counts={navCounts} />

        <TabsContent value="export" className="outline-none">
          <NoFollowupRegister
            companies={companies}
            overduePayments={overduePayments}
            currentUserId={user?.id}
            exports
            onChanged={loadData}
          />
        </TabsContent>

        <TabsContent value="dispute" className="outline-none">
          <NoFollowupRegister
            companies={companies}
            overduePayments={overduePayments}
            currentUserId={user?.id}
            disputes
            onChanged={loadData}
          />
        </TabsContent>

        <TabsContent value="no-followup" className="outline-none">
          <NoFollowupRegister
            companies={companies}
            overduePayments={overduePayments}
            currentUserId={user?.id}
            onChanged={loadData}
          />
        </TabsContent>

        <TabsContent value="bankrupt" className="outline-none">
          <BankruptRegister
            payments={overduePayments}
            companies={companies}
            currentUserId={user?.id}
            onChanged={loadData}
          />
        </TabsContent>

        <TabsContent value="history" className="outline-none">
          {/* Whole team by default; the filter narrows to one person. */}
          <FollowupHistoryView />
        </TabsContent>

        <TabsContent value="attendance" className="outline-none">
          <AttendanceView coordinators={coordinators} />
        </TabsContent>

        <TabsContent value="approvals" className="outline-none">
          <DecisionApprovals onChanged={loadData} />
        </TabsContent>

        <TabsContent value="scores" className="outline-none">
          <WeeklyScores coordinators={coordinators} />
        </TabsContent>

        <TabsContent value="proofs" className="outline-none">
          <ProofReview />
        </TabsContent>

        <TabsContent value="robi" className="outline-none">
          <PlanHistoryView
            coordinators={coordinators}
            companies={companies}
            overduePayments={overduePayments}
            followups={followups}
          />
        </TabsContent>

        <TabsContent value="summary" className="space-y-6 outline-none">
      <div className="grid grid-cols-2 gap-4 2xl:grid-cols-4">
        <KpiCard
          title="Total Accounts"
          value={stats.totalCompanies.toString()}
          icon={Building2}
          hint="One line per customer"
        />
        <KpiCard
          title="Overdue Accounts"
          value={stats.totalOverdue.toString()}
          icon={AlertTriangle}
          hint="Past their due date"
        />
        <KpiCard
          title="Missed promises"
          value={stats.overdueCommitmentsCount.toString()}
          icon={Clock}
          hint="Promises past their date"
        />
        <KpiCard
          title="Total Outstanding"
          value={formatCurrency(stats.totalOutstanding)}
          icon={IndianRupee}
          hint={`${formatCurrency(stats.criticalAmount)} of it past 90 days`}
        />
      </div>

      <GlassCard className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Team breakdown
          </h3>
          <p className="text-xs text-muted-foreground">Accounts, money and today's Robi plan for each coordinator</p>
        </div>
        
        {/*
          Five columns that always fit: related figures share a cell (last
          follow-up under the name, overdue and critical under the accounts)
          instead of a column each, so nothing scrolls sideways.
        */}
        <div className="rounded-md border border-border/50">
          <Table className="table-fixed [&_td]:px-3 [&_td]:py-3 [&_th]:h-10 [&_th]:px-3">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[22%]" />
              <col className="w-[18%]" />
              <col className="w-[13%]" />
              <col className="w-[23%]" />
            </colgroup>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Coordinator</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Missed promises</TableHead>
                <TableHead>Today's plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coordinatorStats.length > 0 ? (
                coordinatorStats.map((stat) => (
                  <TableRow
                    key={stat.id}
                    className="transition-colors duration-200 hover:bg-muted/30"
                  >
                    <TableCell>
                      <div className="truncate font-medium text-foreground" title={stat.name}>{stat.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        Last follow-up {stat.lastFollowupDate ? formatRelativeDate(stat.lastFollowupDate) : '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="tabular-nums text-foreground">{stat.totalCompanies}</div>
                      <AccountSplit overdue={stat.overdue} critical={stat.critical} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(stat.outstanding)}</TableCell>
                    <TableCell className="text-right">
                      {stat.overdueCommitmentsCount > 0 ? (
                        <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">{stat.overdueCommitmentsCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {stat.planTotal === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                            <span className={cn('font-medium', stat.planDone === stat.planTotal ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>
                              {stat.planDone}/{stat.planTotal} done
                            </span>
                            {stat.planOpen > 0 && (
                              <span className="text-muted-foreground">{stat.planOpen} open</span>
                            )}
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn('h-full rounded-full', stat.planDone === stat.planTotal ? 'bg-emerald-500' : 'bg-primary')}
                              style={{ width: `${Math.round((stat.planDone / stat.planTotal) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {isLoading ? 'Loading coordinators...' : 'No coordinator data available.'}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && otherOwnerStats.map(({ owner, totals }) => (
                <TableRow key={owner.key} className={owner.inCrm ? undefined : 'bg-amber-500/5'} data-testid="other-owner-row">
                  <TableCell className="font-medium text-foreground">
                    <div className={cn('truncate', owner.inCrm ? undefined : 'text-amber-700 dark:text-amber-400')} title={owner.name}>{owner.name}</div>
                    <div className="truncate text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      {owner.inCrm ? 'Team leader / other login' : 'Not in CRM'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="tabular-nums">{totals.accounts}</div>
                    <AccountSplit overdue={totals.overdueAccounts} critical={totals.criticalAccounts} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(totals.outstanding)}</TableCell>
                  <TableCell colSpan={2}>
                    {/* The accounts behind the figure, with every detail, on the screens that hold them. */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => navigate(`/companies?owner=${encodeURIComponent(owner.key)}`)}
                      >
                        Active payments →
                      </button>
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => navigate(`/overdue?owner=${encodeURIComponent(owner.key)}`)}
                      >
                        Overdue →
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && book.length > 0 && (
                <TableRow className="border-t-2 border-border bg-muted/40 font-semibold" data-testid="breakdown-total">
                  <TableCell>Total</TableCell>
                  <TableCell>
                    <div className="tabular-nums">{stats.totalCompanies}</div>
                    <AccountSplit overdue={stats.totalOverdue} critical={summariseBook(book).criticalAccounts} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(stats.totalOutstanding)}</TableCell>
                  <TableCell colSpan={2} className="text-xs font-normal text-muted-foreground">
                    Matches the cards above
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
      {overdueCommitments.length > 0 && (
        <GlassCard className="p-4 sm:p-5" data-testid="missed-promises">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              <h3 className="text-base font-semibold">Missed promises</h3>
              <Badge variant="outline" className="tabular-nums">{overdueCommitments.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Payment dates customers gave that have passed, longest overdue first</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-border/50">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Coordinator</TableHead>
                  <TableHead>Promised for</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Overdue by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(showAllMissed ? overdueCommitments : overdueCommitments.slice(0, MISSED_SHOWN)).map((commitment, idx) => (
                  <TableRow
                    key={commitment.id || idx}
                    className="cursor-pointer transition-colors duration-200 hover:bg-muted/40"
                    onClick={() =>
                      commitment.entity_type === 'company'
                        ? setSelectedCompanyId(commitment.entity_id)
                        : navigate(`/overdue?payment=${commitment.entity_id}`)
                    }
                  >
                    <TableCell className="font-medium">{commitment.entity_name}</TableCell>
                    <TableCell className="text-muted-foreground">{commitment.coordinator_name || '-'}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {commitment.committed_date ? new Date(commitment.committed_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{commitment.committed_amount ? formatCurrency(commitment.committed_amount) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-rose-600 dark:text-rose-400">{commitment.days_overdue} days</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {overdueCommitments.length > MISSED_SHOWN && (
            <button
              type="button"
              className="mt-3 cursor-pointer text-sm font-medium text-primary hover:underline"
              onClick={() => setShowAllMissed((v) => !v)}
            >
              {showAllMissed ? 'Show fewer' : `Show all ${overdueCommitments.length}`}
            </button>
          )}
        </GlassCard>
      )}
        </TabsContent>
        </div>
      </Tabs>

      {selectedCompanyId && (
        <CompanyDetailPanel
          company={companies.find(c => c.id === selectedCompanyId) || null}
          open={!!selectedCompanyId}
          onClose={() => setSelectedCompanyId(null)}
        />
      )}
    </div>
  );
}
