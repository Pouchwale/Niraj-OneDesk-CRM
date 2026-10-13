import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlanHistoryView } from '@/features/assistant/PlanHistoryView';
import { ProofReview, useProofsToReview } from '@/features/assistant/ProofReview';
import { WeeklyScores } from '@/features/assistant/ScoresView';
import { Leaderboard } from '@/features/assistant/Leaderboard';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Company, Followup, OverduePayment } from '@/lib/types';
import { demoCompanyStore } from '@/lib/demo-companies';

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coordinator Overview"
        subtitle="Cross-coordinator payment follow-up tracking"
      >
        <OverviewReportButton coordinators={coordinators} />
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="history">Follow-up history</TabsTrigger>
          <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance</TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-approvals">
            Approvals
            {pendingDecisions > 0 && (
              <span className="ml-1.5 rounded bg-blue-500/15 px-1.5 text-xs text-blue-600 dark:text-blue-400">{pendingDecisions}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="scores" data-testid="tab-scores">Scores</TabsTrigger>
          <TabsTrigger value="robi" data-testid="tab-robi">Robi task history</TabsTrigger>
          <TabsTrigger value="proofs" data-testid="tab-proofs">
            Proof checks
            {proofsToReview > 0 && (
              <span className="ml-1.5 rounded bg-blue-500/15 px-1.5 text-xs text-blue-600 dark:text-blue-400">{proofsToReview}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="bankrupt">
            Bankrupt
            {bankruptCount > 0 && (
              <span className="ml-1.5 rounded bg-rose-500/15 px-1.5 text-xs text-rose-600 dark:text-rose-400">
                {bankruptCount}
              </span>
            )}
          </TabsTrigger>
          {/*
            Beside bankruptcy because they are the two ways an account leaves
            the working lists, and this is the one that also takes the money out
            of the total - so it is the one more worth being able to review.
          */}
          <TabsTrigger value="no-followup" data-testid="tab-no-followup">
            No follow-up
            {setAsideCount.plain > 0 && (
              <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 text-xs text-amber-600 dark:text-amber-400">
                {setAsideCount.plain}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dispute" data-testid="tab-dispute">
            Dispute
            {setAsideCount.disputed > 0 && (
              <span className="ml-1.5 rounded bg-orange-500/15 px-1.5 text-xs text-orange-600 dark:text-orange-400">
                {setAsideCount.disputed}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="export" data-testid="tab-export">
            Export clients
            {setAsideCount.exported > 0 && (
              <span className="ml-1.5 rounded bg-sky-500/15 px-1.5 text-xs text-sky-600 dark:text-sky-400">
                {setAsideCount.exported}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="leaderboard" className="outline-none">
          <Leaderboard coordinators={coordinators} />
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Accounts"
          value={stats.totalCompanies.toString()}
          icon={Building2}
          delta="One line per customer"
          deltaType="neutral"
        />
        <KpiCard
          title="Overdue Accounts"
          value={stats.totalOverdue.toString()}
          icon={AlertTriangle}
          delta="Past their due date"
          deltaType="down"
        />
        <KpiCard
          title="Overdue Commitments"
          value={stats.overdueCommitmentsCount.toString()}
          icon={Clock}
          delta="Missed promises"
          deltaType="down"
        />
        <KpiCard
          title="Total Outstanding"
          value={formatCurrency(stats.totalOutstanding)}
          icon={IndianRupee}
          delta={`${formatCurrency(stats.criticalAmount)} of it past 90 days`}
          deltaType="down"
        />
      </div>

      {overdueCommitments.length > 0 && (
        <GlassCard className="p-4 border-rose-500/30">
          <div className="flex items-center space-x-2 mb-4">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            <h3 className="text-lg font-semibold text-rose-500">Overdue Commitments Alert</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Coordinator</TableHead>
                  <TableHead>Committed Date</TableHead>
                  <TableHead>Committed Amount</TableHead>
                  <TableHead>Days Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueCommitments.map((commitment, idx) => (
                  <TableRow 
                    key={commitment.id || idx}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() =>
                      commitment.entity_type === 'company'
                        ? setSelectedCompanyId(commitment.entity_id)
                        : navigate(`/overdue?payment=${commitment.entity_id}`)
                    }
                  >
                    <TableCell className="font-medium">{commitment.entity_name}</TableCell>
                    <TableCell>{commitment.coordinator_name || '-'}</TableCell>
                    <TableCell>{commitment.committed_date ? new Date(commitment.committed_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{formatCurrency(commitment.committed_amount || 0)}</TableCell>
                    <TableCell>
                      <span className="text-rose-500 font-medium">
                        {commitment.days_overdue} days
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Per-Coordinator Breakdown
        </h3>
        
        <div className="overflow-x-auto rounded-md border border-border/50">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Coordinator</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead>Critical</TableHead>
                <TableHead>Outstanding Amount</TableHead>
                <TableHead>Last Follow-Up</TableHead>
                <TableHead>Overdue Commitments</TableHead>
                <TableHead>Today's Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coordinatorStats.length > 0 ? (
                coordinatorStats.map((stat) => (
                  <TableRow 
                    key={stat.id}
                    className={cn(
                      "transition-colors",
                      stat.overdueCommitmentsCount > 0 ? "border-l-4 border-l-rose-500 bg-rose-500/5" : ""
                    )}
                  >
                    <TableCell className="font-medium text-foreground">{stat.name}</TableCell>
                    <TableCell>{stat.totalCompanies}</TableCell>
                    <TableCell>
                      {stat.overdue > 0 ? (
                        <span className="text-amber-500 font-medium">{stat.overdue}</span>
                      ) : (
                        '0'
                      )}
                    </TableCell>
                    <TableCell>
                      {stat.critical > 0 ? (
                        <span className="text-rose-500 font-medium">{stat.critical}</span>
                      ) : (
                        '0'
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(stat.outstanding)}</TableCell>
                    <TableCell>
                      {stat.lastFollowupDate ? formatRelativeDate(stat.lastFollowupDate) : '-'}
                    </TableCell>
                    <TableCell>
                      {stat.overdueCommitmentsCount > 0 ? (
                        <Badge variant="destructive">{stat.overdueCommitmentsCount}</Badge>
                      ) : (
                        <Badge variant="secondary">0</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {stat.planTotal === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="min-w-[96px]">
                          <div className="flex items-center justify-between text-xs tabular-nums">
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
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    {isLoading ? 'Loading coordinators...' : 'No coordinator data available.'}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && otherOwnerStats.map(({ owner, totals }) => (
                <TableRow key={owner.key} className={owner.inCrm ? undefined : 'bg-amber-500/5'} data-testid="other-owner-row">
                  <TableCell className="font-medium text-foreground">
                    <div className={owner.inCrm ? undefined : 'text-amber-700 dark:text-amber-400'}>{owner.name}</div>
                    <div className="whitespace-nowrap text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      {owner.inCrm ? 'Team leader / other login' : 'Not in CRM'}
                    </div>
                  </TableCell>
                  <TableCell>{totals.accounts}</TableCell>
                  <TableCell>
                    {totals.overdueAccounts > 0 ? <span className="text-amber-500 font-medium">{totals.overdueAccounts}</span> : '0'}
                  </TableCell>
                  <TableCell>
                    {totals.criticalAccounts > 0 ? <span className="text-rose-500 font-medium">{totals.criticalAccounts}</span> : '0'}
                  </TableCell>
                  <TableCell>{formatCurrency(totals.outstanding)}</TableCell>
                  <TableCell colSpan={3}>
                    {/* The accounts behind the figure, with every detail, on the screens that hold them. */}
                    <div className="flex flex-wrap gap-3 text-xs">
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
                  <TableCell>{stats.totalCompanies}</TableCell>
                  <TableCell>{stats.totalOverdue}</TableCell>
                  <TableCell>{summariseBook(book).criticalAccounts}</TableCell>
                  <TableCell>{formatCurrency(stats.totalOutstanding)}</TableCell>
                  <TableCell colSpan={3} className="text-xs font-normal text-muted-foreground">
                    Matches the cards above
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
        </TabsContent>
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
