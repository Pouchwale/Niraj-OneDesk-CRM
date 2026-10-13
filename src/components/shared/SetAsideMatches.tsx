/**
 * "Why isn't it here?" - answered on the list itself.
 *
 * A customer marked No follow-up or declared bankrupt is left out of Active
 * Payments and Overdue Payments altogether, and is listed only in its register
 * on the Overview. That is right for the day's work and wrong for somebody
 * searching for it: AyuLabs sat in the Excel file with ₹3.5L overdue while the
 * CRM showed nothing at all, because a coordinator had set it aside as "Diya
 * Customer" a fortnight earlier. When a search matches a customer that is set
 * aside, this says so - who, when, why - and lets the team leader bring it
 * back in one click.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext';
import { normalizeBpCode } from '@/lib/bp-code';
import { clearNoFollowup } from '@/lib/no-followup-api';
import { isBankrupt, isNoFollowup, setAsideKindOf, SET_ASIDE_LABEL } from '@/lib/no-followup';
import type { Company, OverduePayment } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Match {
  key: string;
  name: string;
  bpCode: string | null;
  entityType: 'company' | 'overdue_payment';
  entityId: string;
  reason: 'no_followup' | 'bankrupt';
  /** No follow-up, Dispute or Export client. */
  label: string;
  by: string | null;
  at: string | null;
  note: string | null;
  amount: number;
  rows: number;
}

interface SetAsideMatchesProps {
  query: string;
  companies?: Company[];
  overduePayments?: OverduePayment[];
  /** Team leader and administrator: may bring a customer back. */
  canResume: boolean;
  currentUserId?: string;
  onChanged?: () => void;
}

const MIN_QUERY = 2;

export function SetAsideMatches({ query, companies = [], overduePayments = [], canResume, currentUserId, onChanged }: SetAsideMatchesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const matches = useMemo<Match[]>(() => {
    if (q.length < MIN_QUERY) return [];
    const byCustomer = new Map<string, Match>();
    const add = (
      record: { id: string; no_followup_at?: string | null; no_followup_by?: string | null; no_followup_note?: string | null; bankrupt_declared_at?: string | null; bankrupt_declared_by?: string | null; bankrupt_note?: string | null; status?: string | null },
      entityType: Match['entityType'],
      name: string,
      bp: string | null,
      amount: number
    ) => {
      const noFollowup = isNoFollowup(record);
      if (!noFollowup && !isBankrupt(record)) return;
      if (!name.toLowerCase().includes(q) && !(bp ?? '').toLowerCase().includes(q)) return;
      const code = normalizeBpCode(bp);
      const key = code ? `bp:${code}` : `${entityType}:${record.id}`;
      const existing = byCustomer.get(key);
      if (existing) {
        existing.amount += amount;
        existing.rows++;
        return;
      }
      byCustomer.set(key, {
        key,
        name,
        bpCode: code,
        entityType,
        entityId: record.id,
        reason: noFollowup ? 'no_followup' : 'bankrupt',
        label: noFollowup ? SET_ASIDE_LABEL[setAsideKindOf(record)] : 'Bankrupt',
        by: (noFollowup ? record.no_followup_by : record.bankrupt_declared_by) ?? null,
        at: (noFollowup ? record.no_followup_at : record.bankrupt_declared_at) ?? null,
        note: (noFollowup ? record.no_followup_note : record.bankrupt_note) ?? null,
        amount,
        rows: 1,
      });
    };
    for (const c of companies) {
      if (c.status === 'paid') continue;
      add(c, 'company', c.name, c.sap_bp_code, c.total_amount || 0);
    }
    for (const p of overduePayments) {
      if (p.status === 'settled') continue;
      add(p, 'overdue_payment', p.customer_name || p.bp_code, p.bp_code, p.balance_due || 0);
    }
    return [...byCustomer.values()];
  }, [q, companies, overduePayments]);

  if (matches.length === 0) return null;

  const resume = async (match: Match) => {
    if (!currentUserId) return;
    setBusy(match.key);
    try {
      await clearNoFollowup({ entityType: match.entityType, entityId: match.entityId, bpCode: match.bpCode }, currentUserId);
      toast.success(`${match.name} is back in the follow-up lists.`);
      onChanged?.();
    } catch (err) {
      toast.error('Follow-up not resumed.', { description: err instanceof Error ? err.message : 'Try again in a moment.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3" data-testid="set-aside-matches">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
        <EyeOff className="h-4 w-4" />
        {matches.length === 1 ? 'This customer is' : `${matches.length} customers are`} not listed here — set aside
      </p>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={m.key} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="font-medium">{m.name}</span>
              {m.bpCode && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{m.bpCode}</span>}
              <span className="ml-1.5 tabular-nums text-muted-foreground">· {formatCurrency(m.amount)}</span>
              <div className="text-xs text-muted-foreground">
                {m.reason === 'no_followup' ? `Marked ${m.label}` : 'Declared bankrupt'}
                {m.by && ` by ${getCoordinatorDisplayName(m.by)}`}
                {m.at && ` on ${formatDate(m.at)}`}
                {m.note ? <> — “{m.note}”</> : ' — no reason given'}
              </div>
            </div>
            {canResume && (
              <div className="flex shrink-0 gap-2">
                {m.reason === 'no_followup' && (
                  <Button size="sm" onClick={() => resume(m)} disabled={busy !== null} data-testid="set-aside-resume">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {busy === m.key ? 'Resuming…' : 'Resume follow-up'}
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/admin/overview?tab=${m.reason === 'no_followup' ? 'no-followup' : 'bankrupt'}`}>Register</Link>
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
