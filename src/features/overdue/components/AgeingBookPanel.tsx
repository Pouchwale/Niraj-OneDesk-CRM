/**
 * The ageing book at a glance: how much of what the list owes sits in each
 * bucket, and how many companies hold it.
 *
 * Reads exactly the rows the table below lists, so a search or filter moves
 * these figures with it, and the bucket totals here are the same numbers as
 * the table's footer row. Figures are to the paisa: an accountant ties them to
 * the ledger, and whole-rupee rounding would stop the buckets adding up.
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Layers } from 'lucide-react';

import { GlassCard } from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import type { AgeingBook } from '@/lib/ageing';
import type { CompanyFollowupSummary } from '@/lib/followups-api';
import { downloadAgeing } from '../download-ageing';
import type { Owner } from '@/lib/owner';
import { AGEING_FILTER_PRESETS, type AgeingBucketKey, type DueFilterPreset } from '@/lib/due-filter';
import type { OverduePayment } from '@/lib/types';
import { cn, formatCurrencyExact } from '@/lib/utils';

/**
 * One hue, lighter to darker as the money ages: the buckets are an order, not
 * a set of unrelated categories. Every swatch sits beside its label.
 */
export const BUCKET_SWATCH: Record<AgeingBucketKey, string> = {
  due_0_30: 'bg-rose-200 dark:bg-rose-300',
  due_31_60: 'bg-rose-300 dark:bg-rose-400',
  due_61_90: 'bg-rose-400 dark:bg-rose-500',
  due_91_120: 'bg-rose-600',
  due_121_plus: 'bg-rose-800 dark:bg-rose-700',
};

/** The ageing filter that lists the companies holding money in a bucket. */
export function presetForBucket(key: AgeingBucketKey): DueFilterPreset | undefined {
  return AGEING_FILTER_PRESETS.find((preset) => preset.id === `age_${key.slice('due_'.length)}`);
}

const percent = (share: number) => `${share.toFixed(share > 0 && share < 1 ? 2 : 1)}%`;

interface AgeingBookPanelProps {
  /** Every row listed, settled ones included: what the download carries. */
  rows: OverduePayment[];
  /** Totals of the open rows, shared with the table's footer so the two are one computation. */
  book: AgeingBook;
  /** Rows marked settled in the CRM that the ageing file still shows money against. */
  settledInFile: { count: number; amount: number };
  /** A search, filter or window has narrowed the list. */
  narrowed: boolean;
  activeFilterId: string | null;
  onPickBucket: (preset: DueFilterPreset | null) => void;
  ownerOf: (payment: OverduePayment) => Owner;
  /** Whose rows these are, for the file name: "all coordinators", "Bhakti"... */
  scopeLabel: string;
  followups?: Map<string, CompanyFollowupSummary>;
}

export function AgeingBookPanel({ rows, book, settledInFile, narrowed, activeFilterId, onPickBucket, ownerOf, scopeLabel, followups }: AgeingBookPanelProps) {
  const [downloading, setDownloading] = useState(false);
  const accountsLabel = `${book.accounts.toLocaleString('en-IN')} open ${book.accounts === 1 ? 'account' : 'accounts'}`;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadAgeing({ rows, book, settledInFile, ownerOf, scopeLabel, followups });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <GlassCard className="space-y-5 p-4 sm:p-6" data-testid="ageing-book">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-rose-500/10 p-2 text-rose-500">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Ageing breakdown</h3>
            <p className="text-xs text-muted-foreground">
              What the {accountsLabel}{narrowed ? ' shown' : ''} owe, split by days overdue · click a bucket to list its
              companies
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total outstanding</p>
            <p className="text-xl font-bold tabular-nums sm:text-2xl" data-testid="ageing-total">
              {formatCurrencyExact(book.total)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={download} disabled={downloading || rows.length === 0} className="ml-auto sm:ml-0">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>

      {/* Distribution: each segment is a bucket's part of the total. */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted" aria-hidden>
        {book.buckets.map((b) =>
          b.share > 0 ? (
            <div
              key={b.key}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', BUCKET_SWATCH[b.key])}
              style={{ width: `${b.share}%` }}
              title={`${b.label}: ${formatCurrencyExact(b.amount)} (${percent(b.share)})`}
            />
          ) : null
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {book.buckets.map((b) => {
          const preset = presetForBucket(b.key);
          const active = !!preset && activeFilterId === preset.id;
          return (
            <button
              key={b.key}
              type="button"
              data-testid={`bucket-${b.key}`}
              onClick={() => onPickBucket(active ? null : preset ?? null)}
              aria-pressed={active}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                b.isCritical ? 'border-rose-500/30 bg-rose-500/5' : 'border-border/60',
                active && 'border-primary ring-1 ring-primary'
              )}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', BUCKET_SWATCH[b.key])} />
                {b.label}
                {b.isCritical && (
                  <span className="ml-auto rounded bg-rose-500/10 px-1.5 py-px text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400">
                    Critical
                  </span>
                )}
              </div>
              <p className="mt-2 break-all text-base font-bold tabular-nums leading-tight sm:text-lg">
                {formatCurrencyExact(b.amount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {b.accounts.toLocaleString('en-IN')} {b.accounts === 1 ? 'company' : 'companies'} · {percent(b.share)}
              </p>
              {b.credit < 0 && (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground tabular-nums" data-testid={`bucket-credit-${b.key}`}>
                  Owed {formatCurrencyExact(b.owed)}
                  <br />
                  <span className="text-emerald-600 dark:text-emerald-400">Credit {formatCurrencyExact(b.credit)}</span>
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-border/50 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          Past 90 days:{' '}
          <span className="font-semibold text-foreground tabular-nums">{formatCurrencyExact(book.criticalAmount)}</span>
          {' '}across {book.criticalAccounts.toLocaleString('en-IN')} {book.criticalAccounts === 1 ? 'company' : 'companies'}
          {book.total > 0 && <> ({percent((book.criticalAmount / book.total) * 100)} of the total)</>}
          {book.credit < 0 && (
            <>
              {' '}· Owed <span className="font-semibold text-foreground tabular-nums">{formatCurrencyExact(book.owed)}</span>
              {' '}less advances / credit notes{' '}
              <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">{formatCurrencyExact(book.credit)}</span>
            </>
          )}
        </p>
        {book.tiesOut ? (
          <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" data-testid="ageing-ties-out">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Buckets add up to the balance total
          </p>
        ) : (
          <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400" data-testid="ageing-mismatch">
            <AlertTriangle className="h-3.5 w-3.5" />
            Buckets differ from the balance total ({formatCurrencyExact(book.balance)}) by {formatCurrencyExact(book.difference)}
          </p>
        )}
      </div>
      {settledInFile.count > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground" data-testid="ageing-settled-note">
          Not counted: {settledInFile.count.toLocaleString('en-IN')}{' '}
          {settledInFile.count === 1 ? 'account marked settled in the CRM still shows' : 'accounts marked settled in the CRM still show'}{' '}
          <span className="font-semibold text-foreground tabular-nums">{formatCurrencyExact(settledInFile.amount)}</span> on the
          ageing file (struck through in the table), matching the Outstanding card.
        </p>
      )}
    </GlassCard>
  );
}
