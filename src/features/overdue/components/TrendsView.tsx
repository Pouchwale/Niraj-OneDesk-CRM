/**
 * Overdue Payments → Trends: the book month by month, quarter by quarter and
 * person by person, and the 31–120 and 121+ money week by week.
 *
 * Read-only. The weeks are the Monday books Weekly KPI saves on its own (one
 * per week, kept for good as small sums, see server/modules/ageing-trend), and
 * "Today" is the live book on this screen, summed by the same rules
 * (src/lib/ageing-trend.ts). Nothing here changes a record.
 */

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Download, Minus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/shared/GlassCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { findUserName } from '@/features/auth/AuthContext';
import {
  BOOK_SEGMENTS,
  figuresFor,
  PERSON_ALL,
  PERSON_UNASSIGNED,
  rollUp,
  SEGMENT_LABEL,
  summariseBook,
  todayLocal,
  type AgeFigures,
  type BookPoint,
  type BookSegment,
  type BookWeek,
} from '@/lib/ageing-trend';
import { getAgeingTrend } from '@/lib/ageing-trend-api';
import type { OverduePayment } from '@/lib/types';
import { cn, formatCurrency, formatCurrencyExact, formatDate } from '@/lib/utils';

type ChartMode = 'month' | 'quarter' | 'person';
type SegmentChoice = BookSegment | 'all';

/**
 * The three age groups: one hue (the rose the Overdue buckets already use),
 * light to dark as the money gets older. Validated as an ordinal ramp against
 * the app's light and dark surfaces.
 */
const AGE_SERIES = [
  { key: 'd0_30', label: '0–30 days', color: 'var(--age-1)' },
  { key: 'd31_120', label: '31–120 days', color: 'var(--age-2)' },
  { key: 'd121_plus', label: '121+ days', color: 'var(--age-3)' },
] as const;
const AGE_VARS =
  '[--age-1:#fb7185] [--age-2:#e11d48] [--age-3:#881337] dark:[--age-1:#fda4af] dark:[--age-2:#f43f5e] dark:[--age-3:#be123c]';

const personName = (id: string) => (id === PERSON_UNASSIGNED ? 'Not assigned in CRM' : findUserName(id) ?? id);

interface TrendsViewProps {
  /** The live book on this screen (settled already left out), narrowed to what the person may see. */
  payments: OverduePayment[];
  canManageTeam: boolean;
}

/** A week's or today's figures, ready to show. */
interface Line {
  key: string;
  label: string;
  date: string;
  live: boolean;
  figures: AgeFigures;
}

function Change({ now, before }: { now: number; before: number | null }) {
  if (before === null) return <span className="text-muted-foreground/60">—</span>;
  const diff = Math.round((now - before) * 100) / 100;
  if (Math.abs(diff) < 1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Minus className="h-3 w-3" /> no change
      </span>
    );
  }
  // More money overdue is worse.
  const worse = diff > 0;
  const Icon = worse ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums',
        worse ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
      )}
      title={worse ? 'Up on the week before' : 'Down on the week before'}
    >
      <Icon className="h-3 w-3" />
      {formatCurrency(Math.abs(diff), true)}
    </span>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.key ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {AGE_SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { name: string; note?: string; exact: AgeFigures } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const total = AGE_SERIES.reduce((sum, s) => sum + row.exact[s.key], 0);
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 p-3 text-sm shadow-xl backdrop-blur-md">
      <p className="mb-1.5 font-medium text-foreground">{row.name ?? label}</p>
      {row.note && <p className="mb-1.5 text-xs text-muted-foreground">{row.note}</p>}
      {[...AGE_SERIES].reverse().map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-6">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tabular-nums text-foreground">{formatCurrencyExact(row.exact[s.key])}</span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-border/50 pt-1.5 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatCurrencyExact(total)}</span>
      </div>
    </div>
  );
}

export function TrendsView({ payments, canManageTeam }: TrendsViewProps) {
  const [weeks, setWeeks] = useState<BookWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [segment, setSegment] = useState<SegmentChoice>('regular');
  const [person, setPerson] = useState<string>(PERSON_ALL);
  const [chart, setChart] = useState<ChartMode>('month');
  const [tableMode, setTableMode] = useState<'total' | 'person'>('total');

  useEffect(() => {
    let alive = true;
    getAgeingTrend()
      .then((body) => alive && setWeeks(body.weeks))
      .catch((err: Error) => alive && setFailed(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const liveRows = useMemo(() => summariseBook(payments), [payments]);
  const today = todayLocal();

  /** Today first, then every saved week, latest first. */
  const points: BookPoint[] = useMemo(
    () => [{ date: today, rows: liveRows, live: true }, ...weeks.map((w) => ({ date: w.weekStart, rows: w.rows }))],
    [today, liveRows, weeks]
  );

  /** Everyone who holds money in any week, biggest book today first. */
  const people = useMemo(() => {
    const ids = new Set<string>();
    for (const p of points)
      for (const r of p.rows)
        if ((segment === 'all' || r.segment === segment) && (r.d0_30 || r.d31_120 || r.d121_plus))
          ids.add(r.coordinatorId ?? PERSON_UNASSIGNED);
    const now = (id: string) => {
      const f = figuresFor(liveRows, segment, id);
      return f.d0_30 + f.d31_120 + f.d121_plus;
    };
    return [...ids].sort((a, b) => now(b) - now(a) || personName(a).localeCompare(personName(b)));
  }, [points, liveRows, segment]);

  // A coordinator's rows are only ever their own; the person filter is the team's.
  const who = canManageTeam ? person : PERSON_ALL;
  const lines: Line[] = useMemo(
    () =>
      points.map((p) => ({
        key: p.live ? 'live' : p.date,
        label: p.live ? 'Today' : `Week of ${formatDate(p.date)}`,
        date: p.date,
        live: Boolean(p.live),
        figures: figuresFor(p.rows, segment, who),
      })),
    [points, segment, who]
  );

  const chartData = useMemo(() => {
    /*
     * A group in credit (a negative 0–30, say) is drawn as nothing rather than
     * as a bar below zero, which would stretch the axis for one small credit.
     * The tooltip still shows the exact figure, sign and all.
     */
    const bars = (name: string, f: AgeFigures, note?: string) => ({
      name,
      note,
      exact: f,
      d0_30: Math.max(0, f.d0_30),
      d31_120: Math.max(0, f.d31_120),
      d121_plus: Math.max(0, f.d121_plus),
    });
    if (chart === 'person') {
      return people
        .map((id) => bars(personName(id), figuresFor(liveRows, segment, id)))
        .filter((r) => r.d0_30 || r.d31_120 || r.d121_plus);
    }
    return rollUp(points, chart).map((p) =>
      bars(p.label, figuresFor(p.rows, segment, who), p.live ? 'Today (period still running)' : `As of the week of ${formatDate(p.date)}`)
    );
  }, [chart, people, liveRows, segment, points, who]);

  const latest = lines[0]?.figures;
  const lastWeek = lines[1]?.figures ?? null;
  const scopeName = canManageTeam ? (person === PERSON_ALL ? 'the whole team' : personName(person)) : 'your accounts';
  const segmentName = segment === 'all' ? 'all four registers' : SEGMENT_LABEL[segment];

  /** By person: the latest weeks across, everyone down. */
  const gridWeeks = lines.slice(0, 6);

  const download = async () => {
    try {
      const { downloadWorkbook, fileStamp } = await import('@/features/snapshots/download');
      const weekly = [
        ['Week', '31-120 days', 'Change', '121+ days', 'Change', '31+ total', 'Accounts'],
        ...lines.map((l, i) => {
          const before = lines[i + 1]?.figures;
          return [
            l.live ? `Today ${today}` : l.date,
            l.figures.d31_120,
            before ? Math.round((l.figures.d31_120 - before.d31_120) * 100) / 100 : '',
            l.figures.d121_plus,
            before ? Math.round((l.figures.d121_plus - before.d121_plus) * 100) / 100 : '',
            Math.round((l.figures.d31_120 + l.figures.d121_plus) * 100) / 100,
            l.figures.accounts,
          ];
        }),
      ];
      const sheets = [{ name: 'Week-wise', rows: weekly }];
      if (canManageTeam) {
        const header = ['Coordinator'];
        for (const l of lines) header.push(`${l.live ? 'Today' : l.date} 31-120`, `${l.live ? 'Today' : l.date} 121+`);
        const rows = people.map((id) => {
          const out: (string | number)[] = [personName(id)];
          for (const p of points) {
            const f = figuresFor(p.rows, segment, id);
            out.push(f.d31_120, f.d121_plus);
          }
          return out;
        });
        sheets.push({ name: 'By person', rows: [header, ...rows] });
      }
      downloadWorkbook(`Overdue week-wise ${segmentName} ${fileStamp(new Date().toISOString())}.xlsx`, sheets);
    } catch {
      toast.error('Could not create the Excel file.');
    }
  };

  const chartOptions: { key: ChartMode; label: string }[] = [
    { key: 'month', label: 'Monthly' },
    { key: 'quarter', label: 'Quarterly' },
    ...(canManageTeam && person === PERSON_ALL ? [{ key: 'person' as const, label: 'By person' }] : []),
  ];
  // Picking one person leaves nothing to compare people by.
  const chartMode: ChartMode = chart === 'person' && !chartOptions.some((o) => o.key === 'person') ? 'month' : chart;

  return (
    <div className={cn('space-y-6', AGE_VARS)} data-testid="trends-view">
      {/* One row of filters above everything they drive. */}
      <GlassCard className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Register</span>
          <Select value={segment} onValueChange={(v) => setSegment(v as SegmentChoice)}>
            <SelectTrigger className="w-[170px]" aria-label="Register">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOK_SEGMENTS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
              <SelectItem value="all">All four together</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canManageTeam && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Person</span>
            {/* The select cannot hold an empty value, so "not assigned" travels as a placeholder. */}
            <Select
              value={person === PERSON_UNASSIGNED ? '__none__' : person}
              onValueChange={(v) => setPerson(v === '__none__' ? PERSON_UNASSIGNED : v)}
            >
              <SelectTrigger className="w-[210px]" aria-label="Person">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PERSON_ALL}>Whole team</SelectItem>
                {people.map((id) => (
                  <SelectItem key={id || 'none'} value={id || '__none__'}>
                    {personName(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs text-muted-foreground sm:ml-auto">
          {segmentName} · {scopeName}
        </p>
      </GlassCard>

      {/* Headline: where 31–120 and 121+ stand today against the last saved week. */}
      {latest && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: '31–120 days today', now: latest.d31_120, before: lastWeek?.d31_120 ?? null },
            { label: '121+ days today', now: latest.d121_plus, before: lastWeek?.d121_plus ?? null },
            {
              label: '31+ days today',
              now: latest.d31_120 + latest.d121_plus,
              before: lastWeek ? lastWeek.d31_120 + lastWeek.d121_plus : null,
            },
          ].map((tile) => (
            <GlassCard key={tile.label} className="p-4">
              <p className="text-xs text-muted-foreground">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(tile.now)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <Change now={tile.now} before={tile.before} />
                {tile.before !== null && <span> vs week of {formatDate(lines[1].date)}</span>}
              </p>
            </GlassCard>
          ))}
        </div>
      )}

      {/* The chart. */}
      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-medium">
              {chartMode === 'person' ? 'By person, today' : chartMode === 'month' ? 'Month by month' : 'Quarter by quarter'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {chartMode === 'person'
                ? 'Each coordinator’s book today, split by age.'
                : 'Each period shows the book at its last saved week; the period still running shows today.'}
            </p>
          </div>
          <Toggle value={chartMode} onChange={setChart} options={chartOptions} label="Chart" />
        </div>
        <Legend />
        {loading && chartMode !== 'person' ? (
          <div className="flex h-[300px] items-center justify-center">
            <RefreshCcw className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Nothing to show for this choice.</div>
        ) : chartMode === 'person' ? (
          <div style={{ height: Math.max(220, chartData.length * 44 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" stackOffset="sign" margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeOpacity={0.5} />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v, true)} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'var(--color-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }} />
                {AGE_SERIES.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="age"
                    fill={s.color}
                    stroke="var(--color-background)"
                    strokeWidth={1}
                    radius={i === AGE_SERIES.length - 1 ? [0, 4, 4, 0] : 0}
                    maxBarSize={28}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} stackOffset="sign" margin={{ top: 4, right: 8, left: 8, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatCurrency(v, true)} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }} />
                {AGE_SERIES.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="age"
                    fill={s.color}
                    stroke="var(--color-background)"
                    strokeWidth={1}
                    radius={i === AGE_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                    maxBarSize={72}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {!loading && weeks.length === 0 && chartMode !== 'person' && (
          <p className="text-xs text-muted-foreground">No saved weeks yet: Weekly KPI saves one every Monday morning.</p>
        )}
      </GlassCard>

      {/* Week-wise 31–120 and 121+. */}
      <GlassCard className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-medium">31–120 and 121+ days, week by week</h3>
            <p className="text-xs text-muted-foreground">
              Built by itself from the book saved every Monday morning; the top line is today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageTeam && person === PERSON_ALL && (
              <Toggle
                value={tableMode}
                onChange={setTableMode}
                options={[
                  { key: 'total', label: 'Team total' },
                  { key: 'person', label: 'By person' },
                ]}
                label="Table"
              />
            )}
            <Button variant="outline" onClick={download} disabled={loading}>
              <Download className="mr-2 h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>

        {failed && <p className="text-sm text-rose-600 dark:text-rose-400">Saved weeks could not be loaded: {failed} Today’s line is still shown.</p>}

        {canManageTeam && person === PERSON_ALL && tableMode === 'person' ? (
          <div className="overflow-x-auto rounded-md border border-border/50" data-testid="weekly-by-person">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-10 min-w-[170px] bg-muted px-4 py-2 text-left font-medium uppercase">
                    Coordinator
                  </th>
                  {gridWeeks.map((l) => (
                    <th key={l.key} colSpan={2} className="whitespace-nowrap border-l border-border/50 px-3 py-2 text-center font-medium">
                      {l.live ? 'Today' : formatDate(l.date)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {gridWeeks.map((l) => (
                    <FragmentPair key={l.key} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {people.map((id) => (
                  <tr key={id || 'none'} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-medium">{personName(id)}</td>
                    {gridWeeks.map((l, i) => {
                      const point = points[i];
                      const f = figuresFor(point.rows, segment, id);
                      return (
                        <PairCells key={l.key} a={f.d31_120} b={f.d121_plus} />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                <tr>
                  <td className="sticky left-0 z-10 bg-muted px-4 py-2.5">Team</td>
                  {gridWeeks.map((l) => (
                    <PairCells key={l.key} a={l.figures.d31_120} b={l.figures.d121_plus} />
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50" data-testid="weekly-table">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Week</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--age-2)' }} />
                      31–120 days
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-medium">Change</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--age-3)' }} />
                      121+ days
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-medium">Change</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-medium">31+ total</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium" title="Every account in this register, whatever its age">
                    All accounts
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {lines.map((l, i) => {
                  const before = lines[i + 1]?.figures ?? null;
                  return (
                    <tr key={l.key} className={cn(l.live ? 'bg-primary/5 font-medium' : 'hover:bg-muted/30')}>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {l.live ? (
                          <span className="inline-flex items-center gap-2">
                            Today <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase text-primary">live</span>
                          </span>
                        ) : (
                          l.label
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyExact(l.figures.d31_120)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">
                        <Change now={l.figures.d31_120} before={before?.d31_120 ?? null} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyExact(l.figures.d121_plus)}</td>
                      <td className="px-3 py-2.5 text-right text-xs">
                        <Change now={l.figures.d121_plus} before={before?.d121_plus ?? null} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                        {formatCurrencyExact(l.figures.d31_120 + l.figures.d121_plus)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{l.figures.accounts.toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })}
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      <RefreshCcw className="mr-2 inline h-4 w-4 animate-spin" /> Loading saved weeks…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function FragmentPair() {
  return (
    <>
      <th className="whitespace-nowrap border-l border-border/50 px-3 py-1.5 text-right font-normal">31–120</th>
      <th className="whitespace-nowrap px-3 py-1.5 text-right font-normal">121+</th>
    </>
  );
}

function PairCells({ a, b }: { a: number; b: number }) {
  return (
    <>
      <td className="whitespace-nowrap border-l border-border/50 px-3 py-2.5 text-right tabular-nums">
        {a ? formatCurrency(a, true) : <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {b ? formatCurrency(b, true) : <span className="text-muted-foreground/50">—</span>}
      </td>
    </>
  );
}
