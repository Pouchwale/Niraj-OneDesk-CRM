/**
 * Robi's task history, for the team leader and the administrator: every task
 * Robi handed a coordinator, day by day, and whether it was done.
 *
 * Unfinished work is not lost - it comes back at the top of the next day's
 * plan, marked as carried - and this is where anybody can see that happened,
 * and whether it was finally done.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CheckCircle2, Download, History } from 'lucide-react';

import { GlassCard } from '@/components/shared/GlassCard';
import { useProgressiveRows, MoreRowsFooter } from '@/components/shared/progressive-rows';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies';
import type { Company, Followup, OverduePayment } from '@/lib/types';
import { cn, formatCurrency, formatDate, todayISO } from '@/lib/utils';
import { customerLookup, isExtraItem, openAccountKeys } from './daily-plan';
import { planHistory, RESULT_LABEL, summariseHistory, type HistoryResult, type HistoryRow } from './plan-history';

type Range = 'today' | 'yesterday' | 'week' | 'month' | 'all';

const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'all', label: 'All' },
];

type ResultFilter = 'all' | 'done' | 'missed' | 'open' | 'ended';

const RESULT_FILTERS: { id: ResultFilter; label: string; matches: (row: HistoryRow) => boolean }[] = [
  { id: 'all', label: 'All results', matches: () => true },
  { id: 'done', label: 'Done', matches: (r) => r.result === 'done' },
  { id: 'missed', label: 'Not done', matches: (r) => r.result === 'not_done' || r.result === 'later' },
  { id: 'open', label: 'Open today', matches: (r) => r.result === 'open' },
  { id: 'ended', label: 'Closed / moved', matches: (r) => r.result === 'closed' || r.result === 'moved' },
];

const RESULT_STYLE: Record<HistoryResult, string> = {
  done: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  not_done: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400',
  later: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  open: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  closed: 'bg-muted text-muted-foreground border-border',
  moved: 'bg-muted text-muted-foreground border-border',
  not_reached: 'bg-muted text-muted-foreground border-border',
};

const MODE_LABEL: Record<string, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  in_person: 'In person',
  other: 'Other',
};

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inRange(date: string, range: Range, today: string): boolean {
  switch (range) {
    case 'today':
      return date === today;
    case 'yesterday':
      return date === daysBefore(today, 1);
    case 'week':
      return date > daysBefore(today, 7);
    case 'month':
      return date > daysBefore(today, 30);
    default:
      return true;
  }
}

function time(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function accountLink(row: HistoryRow): string | null {
  const { entityType, entityId } = row.item;
  if (!entityType || !entityId) return null;
  return entityType === 'overdue_payment' ? `/overdue?payment=${entityId}` : `/companies?company=${entityId}`;
}

function whatHappened(row: HistoryRow): string {
  if (row.followup) {
    const f = row.followup;
    return [`${MODE_LABEL[f.mode] ?? f.mode} at ${time(f.created_at)}`, f.notes].filter(Boolean).join(' — ');
  }
  const parts: string[] = [];
  if (row.carriedTo) parts.push(`Carried to ${formatDate(row.carriedTo)}`);
  if (row.doneLater) parts.push(`Done later on ${formatDate(row.doneLater.created_at)}`);
  else if (row.result === 'not_done' || row.result === 'later') parts.push('Still not done');
  return parts.join(' · ');
}

interface PlanHistoryViewProps {
  coordinators: { id: string; full_name: string }[];
  companies: Company[];
  overduePayments: OverduePayment[];
  followups: Followup[];
}

export function PlanHistoryView({ coordinators, companies, overduePayments, followups }: PlanHistoryViewProps) {
  const today = todayISO();
  const [range, setRange] = useState<Range>('week');
  const [person, setPerson] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [downloading, setDownloading] = useState(false);

  // Plans are made and updated as screens open around the office; follow them.
  const [plans, setPlans] = useState(() => demoCompanyStore.getDailyPlans());
  const attendance = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.attendance);
  useEffect(() => subscribeToDemoStore(() => setPlans(demoCompanyStore.getDailyPlans())), []);

  const nameOf = useMemo(() => {
    const names = new Map(coordinators.map((c) => [c.id, c.full_name]));
    return (id: string) => names.get(id) ?? 'Former user';
  }, [coordinators]);

  const allRows = useMemo(() => {
    const owed = openAccountKeys(companies, overduePayments);
    const mine = new Map<string, Set<string>>();
    for (const c of coordinators) {
      mine.set(
        c.id,
        openAccountKeys(
          companies.filter((x) => x.assigned_coordinator_id === c.id),
          overduePayments.filter((x) => x.assigned_coordinator_id === c.id)
        )
      );
    }
    return planHistory(plans, followups, today, owed, mine, customerLookup(companies, overduePayments), (u, d) =>
      demoCompanyStore.getAttendance(u, d)?.status ?? null
    );
  }, [plans, followups, companies, overduePayments, coordinators, today, attendance]);

  const inWindow = useMemo(() => allRows.filter((r) => inRange(r.date, range, today)), [allRows, range, today]);
  const forPerson = useMemo(
    () => (person === 'all' ? inWindow : inWindow.filter((r) => r.coordinatorId === person)),
    [inWindow, person]
  );
  const shown = useMemo(() => {
    const filter = RESULT_FILTERS.find((f) => f.id === resultFilter)!;
    return forPerson.filter((r) => filter.matches(r));
  }, [forPerson, resultFilter]);

  const summary = useMemo(
    () => summariseHistory(inWindow).sort((a, b) => nameOf(a.coordinatorId).localeCompare(nameOf(b.coordinatorId))),
    [inWindow, nameOf]
  );
  const teamTotal = useMemo(() => summariseHistory(inWindow.map((r) => ({ ...r, coordinatorId: 'team' })))[0], [inWindow]);

  const firstDay = useMemo(() => plans.map((p) => p.date).sort()[0] ?? null, [plans]);
  const progressive = useProgressiveRows(shown, { resetKey: [range, person, resultFilter].join('|') });

  const download = async () => {
    setDownloading(true);
    try {
      const { downloadWorkbook, fileStamp } = await import('@/features/snapshots/download');
      const tasks = [
        ['Date', 'Coordinator', 'Stage', 'Task', 'Account', 'Amount', 'Result', 'Done at', 'How', 'Notes', 'Carried to', 'Done later on'],
        ...shown.map((r) => [
          r.date,
          nameOf(r.coordinatorId),
          isExtraItem(r.item) ? `Overdue round ${r.item.round}` : 'Daily plan',
          r.item.message,
          r.item.entityName ?? '',
          r.item.amount ?? '',
          RESULT_LABEL[r.result],
          r.followup ? time(r.followup.created_at) : '',
          r.followup ? MODE_LABEL[r.followup.mode] ?? r.followup.mode : '',
          r.followup?.notes ?? '',
          r.carriedTo ?? '',
          r.doneLater ? r.doneLater.created_at.slice(0, 10) : '',
        ]),
      ];
      const totals = [
        ['Coordinator', 'Days', 'Tasks', 'Done', 'Not done', 'Set aside (Later)', 'Closed / moved', 'Open today', 'Completion %'],
        ...summary.map((s) => [
          nameOf(s.coordinatorId), s.days, s.tasks, s.done, s.notDone, s.later, s.noLongerNeeded, s.open, s.completion ?? '',
        ]),
      ];
      const label = RANGES.find((r) => r.id === range)?.label ?? 'All';
      const who = person === 'all' ? 'team' : nameOf(person);
      downloadWorkbook(`Robi task history - ${who} - ${label} - ${fileStamp(new Date().toISOString())}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'), [
        { name: 'Tasks', rows: tasks },
        { name: 'By coordinator', rows: totals },
      ]);
    } finally {
      setDownloading(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/60 hover:border-primary/50 hover:bg-muted/50'
    );

  const peopleWithPlans = coordinators.filter((c) => inWindow.some((r) => r.coordinatorId === c.id));

  return (
    <div className="space-y-6" data-testid="plan-history">
      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold leading-tight">Robi task history</h3>
              <p className="text-xs text-muted-foreground">
                Every task Robi gave each coordinator, and whether it was done. Anything not done comes back at the
                top of their next day's plan.
                {firstDay && ` Recorded since ${formatDate(firstDay)}.`}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={download} disabled={downloading || shown.length === 0} data-testid="history-download">
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={chip(range === r.id)} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>

        {teamTotal && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Tasks given" value={teamTotal.tasks} />
            <Stat label="Done" value={teamTotal.done} tone="good" />
            {/* Everything not done yet: missed on an earlier day, set aside, or still open today. */}
            <Stat
              label={teamTotal.open > 0 ? `Not done (${teamTotal.open} still open today)` : 'Not done'}
              value={teamTotal.notDone + teamTotal.later + teamTotal.open}
              tone={teamTotal.notDone + teamTotal.later + teamTotal.open > 0 ? 'bad' : undefined}
            />
            <Stat label="Completion" value={teamTotal.completion === null ? '—' : `${teamTotal.completion}%`} />
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-primary" /> By coordinator
        </h3>
        {summary.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No plans in this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-left text-sm" data-testid="history-summary">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Coordinator</th>
                  <th className="px-3 py-3 text-right font-medium">Days</th>
                  <th className="px-3 py-3 text-right font-medium">Tasks</th>
                  <th className="px-3 py-3 text-right font-medium">Done</th>
                  <th className="px-3 py-3 text-right font-medium">Not done</th>
                  <th className="px-3 py-3 text-right font-medium">Later</th>
                  <th className="px-3 py-3 text-right font-medium" title="Paid, settled or handed to someone else before it was done">Closed / moved</th>
                  <th className="px-3 py-3 text-right font-medium">Open today</th>
                  <th className="px-4 py-3 font-medium">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {summary.map((s) => (
                  <tr
                    key={s.coordinatorId}
                    className={cn('cursor-pointer transition-colors hover:bg-muted/30', person === s.coordinatorId && 'bg-primary/5')}
                    onClick={() => setPerson(person === s.coordinatorId ? 'all' : s.coordinatorId)}
                  >
                    <td className="px-4 py-3 font-medium">{nameOf(s.coordinatorId)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.days}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.tasks}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{s.done}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums', s.notDone > 0 && 'font-medium text-rose-600 dark:text-rose-400')}>{s.notDone}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums', s.later > 0 && 'text-amber-600 dark:text-amber-400')}>{s.later}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{s.noLongerNeeded}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.open}</td>
                    <td className="px-4 py-3">
                      {s.completion === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex min-w-[110px] items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn('h-full rounded-full', s.completion >= 80 ? 'bg-emerald-500' : s.completion >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                              style={{ width: `${s.completion}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums">{s.completion}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Completion is tasks done out of all tasks given, today's open ones included. Only accounts that were paid or
          handed to another coordinator before anyone acted are left out. Click a row to see that coordinator's tasks.
        </p>
      </GlassCard>

      <GlassCard className="space-y-4 p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4 text-primary" /> Task by task
        </h3>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Coordinator">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Coordinator</span>
          <button type="button" className={chip(person === 'all')} aria-pressed={person === 'all'} onClick={() => setPerson('all')}>
            All
          </button>
          {peopleWithPlans.map((c) => (
            <button
              key={c.id}
              type="button"
              className={chip(person === c.id)}
              aria-pressed={person === c.id}
              onClick={() => setPerson(person === c.id ? 'all' : c.id)}
            >
              {c.full_name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Result">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Result</span>
          {RESULT_FILTERS.map((f) => (
            <button key={f.id} type="button" className={chip(resultFilter === f.id)} aria-pressed={resultFilter === f.id} onClick={() => setResultFilter(f.id)}>
              {f.label}
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                {forPerson.filter((r) => f.matches(r)).length}
              </span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nothing to show for this selection.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-left text-sm" data-testid="history-rows">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Coordinator</th>
                  <th className="px-4 py-3 font-medium">Task from Robi</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">What happened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {progressive.visible.map((row, i) => {
                  const link = accountLink(row);
                  return (
                    <tr key={`${row.date}-${row.coordinatorId}-${row.item.taskId}-${i}`} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(row.date)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{nameOf(row.coordinatorId)}</td>
                      <td className="px-4 py-3">
                        <div>
                          {isExtraItem(row.item) && (
                            <span className="mr-1.5 inline-block rounded bg-amber-500/15 px-1 py-px align-middle text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">
                              Overdue round {row.item.round}
                            </span>
                          )}
                          {row.item.message}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {link && row.item.entityName ? (
                            <Link to={link} className="text-primary hover:underline">
                              {row.item.entityName}
                            </Link>
                          ) : (
                            row.item.entityName
                          )}
                          {row.item.amount ? ` · ${formatCurrency(row.item.amount)}` : ''}
                          {row.item.carriedFrom && ` · first given ${formatDate(row.item.carriedFrom)}`}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('whitespace-nowrap', RESULT_STYLE[row.result])}>
                          {RESULT_LABEL[row.result]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{whatHappened(row)}</td>
                    </tr>
                  );
                })}
                <MoreRowsFooter state={progressive} colSpan={5} />
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-bold tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-rose-600 dark:text-rose-400'
        )}
      >
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </p>
    </div>
  );
}
