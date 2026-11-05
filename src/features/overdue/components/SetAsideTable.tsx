/**
 * One set-aside register on Overdue Payments: Dispute, No follow-up or Export.
 *
 * Read-only. The balances are the ones the team already set aside (through the
 * approval flow); this only lists them where coordinators and leaders work,
 * with the same columns as the Regular list. Clicking a row opens the same
 * detail panel, which is where a leader can resume one.
 */

import { Fragment, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/shared/GlassCard';
import { OwnerFilter, OwnerName } from '@/components/shared/OwnerFilter';
import { rowOwner, findUserName } from '@/features/auth/AuthContext';
import { AGEING_BUCKETS } from '@/lib/due-filter';
import { due31to120, SEGMENT_LABEL, type BookSegment } from '@/lib/ageing-trend';
import { OWNER_ALL, matchesOwner, ownerOptions } from '@/lib/owner';
import type { OverduePayment } from '@/lib/types';
import { cn, formatCurrency, formatCurrencyExact, formatDate } from '@/lib/utils';
import { BUCKET_SWATCH } from './AgeingBookPanel';

const BUCKET_HEADERS = ['0–30', '31–60', '61–90', '91–120', '121+'];

/** What each register means, said once above its table. */
const MEANING: Record<Exclude<BookSegment, 'regular'>, string> = {
  dispute: 'Customers disputing the amount. Not chased and not in the Regular totals while the dispute stands.',
  no_followup: 'Balances the team decided not to chase (inter-company, agreed holds and the like). Not in the Regular totals.',
  export: 'Export clients whose payment is handled outside this follow-up. Not in the Regular totals.',
};

interface SetAsideTableProps {
  segment: Exclude<BookSegment, 'regular'>;
  /** This segment's balances, already narrowed to what the person may see. */
  rows: OverduePayment[];
  canManageTeam: boolean;
  onOpen: (id: string) => void;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'danger' }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/50 bg-background/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate text-lg font-semibold tabular-nums',
          tone === 'warn' && 'text-rose-600 dark:text-rose-400',
          tone === 'danger' && 'text-rose-800 dark:text-rose-300'
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function SetAsideTable({ segment, rows, canManageTeam, onOpen }: SetAsideTableProps) {
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState(OWNER_ALL);
  const label = SEGMENT_LABEL[segment];

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        (p.customer_name || '').toLowerCase().includes(q) ||
        p.bp_code.toLowerCase().includes(q) ||
        (p.coordinator_name || '').toLowerCase().includes(q) ||
        (p.no_followup_note || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const owners = useMemo(() => ownerOptions(searched, rowOwner, (p) => p.balance_due || 0), [searched]);

  // Biggest balance first: the money that matters most in a register is on top.
  const shown = useMemo(
    () =>
      searched
        .filter((p) => matchesOwner(rowOwner(p), owner))
        .sort((a, b) => (b.balance_due || 0) - (a.balance_due || 0)),
    [searched, owner]
  );

  const totals = useMemo(() => {
    const sum = (pick: (p: OverduePayment) => number) =>
      Math.round(shown.reduce((s, p) => s + Math.round(pick(p) * 100), 0)) / 100;
    return {
      balance: sum((p) => p.balance_due || 0),
      buckets: AGEING_BUCKETS.map((b) => sum((p) => p[b.key] || 0)),
      d31_120: sum(due31to120),
      d121: sum((p) => p.due_121_plus || 0),
    };
  }, [shown]);

  const download = async () => {
    try {
      const { downloadWorkbook, fileStamp } = await import('@/features/snapshots/download');
      const header = [
        'Customer', 'BP Code', 'Coordinator', ...BUCKET_HEADERS, 'Total Due', '31-120', 'Set aside on', 'Set aside by', 'Reason',
      ];
      const body = shown.map((p) => [
        p.customer_name || '', p.bp_code, rowOwner(p).name,
        ...AGEING_BUCKETS.map((b) => p[b.key] || 0), p.balance_due || 0, due31to120(p),
        p.no_followup_at ? p.no_followup_at.slice(0, 10) : '',
        p.no_followup_by ? findUserName(p.no_followup_by) ?? p.no_followup_by : '',
        p.no_followup_note ?? '',
      ]);
      const total = ['TOTAL', `${shown.length} accounts`, '', ...totals.buckets, totals.balance, totals.d31_120, '', '', ''];
      downloadWorkbook(`Overdue ${label} ${fileStamp(new Date().toISOString())}.xlsx`, [
        { name: label, rows: [header, ...body, total] },
      ]);
    } catch {
      toast.error('Could not create the Excel file.');
    }
  };

  return (
    <div className="space-y-4" data-testid={`segment-${segment}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Accounts" value={shown.length.toLocaleString('en-IN')} />
        <Stat label="Total due" value={formatCurrency(totals.balance)} />
        <Stat label="31–120 days" value={formatCurrency(totals.d31_120)} tone="warn" />
        <Stat label="121+ days" value={formatCurrency(totals.d121)} tone="danger" />
      </div>

      <GlassCard className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">{MEANING[segment]}</p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customer, BP code, coordinator, reason..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={download} disabled={shown.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>

        {canManageTeam && <OwnerFilter value={owner} onChange={setOwner} options={owners} rowNoun="account" />}

        {shown.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? `No ${label.toLowerCase()} balances right now.` : 'Nothing matches your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="min-w-[200px] px-4 py-3 font-medium">Customer</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Total Due</th>
                  {AGEING_BUCKETS.map((b, i) => (
                    <th key={b.key} className="whitespace-nowrap px-3 py-3 text-right font-medium">
                      <span className="inline-flex items-center gap-1">
                        <span className={cn('h-2 w-2 rounded-sm', BUCKET_SWATCH[b.key])} />
                        {BUCKET_HEADERS[i]}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">Coordinator</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Set aside</th>
                  <th className="min-w-[240px] px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {shown.map((p) => {
                  const who = rowOwner(p);
                  return (
                    <tr key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{p.customer_name || '-'}</div>
                        <div className="font-mono text-xs text-muted-foreground">{p.bp_code}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">
                        {formatCurrencyExact(p.balance_due || 0)}
                      </td>
                      {AGEING_BUCKETS.map((b) => {
                        const amount = p[b.key] || 0;
                        return (
                          <td key={b.key} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                            {amount ? formatCurrencyExact(amount) : <span className="text-muted-foreground/50">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        <OwnerName name={who.name} inCrm={who.inCrm} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <div>{p.no_followup_at ? formatDate(p.no_followup_at) : '-'}</div>
                        {p.no_followup_by && (
                          <div className="text-muted-foreground">by {findUserName(p.no_followup_by) ?? 'someone'}</div>
                        )}
                      </td>
                      <td className="min-w-[240px] max-w-[320px] px-4 py-3 text-xs text-muted-foreground">
                        <span className="line-clamp-2" title={p.no_followup_note ?? undefined}>
                          {p.no_followup_note || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                <tr>
                  <td className="px-4 py-3">
                    Total
                    <div className="text-xs font-normal text-muted-foreground">
                      {shown.length.toLocaleString('en-IN')} {shown.length === 1 ? 'account' : 'accounts'}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCurrencyExact(totals.balance)}</td>
                  {totals.buckets.map((amount, i) => (
                    <Fragment key={i}>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCurrencyExact(amount)}</td>
                    </Fragment>
                  ))}
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
