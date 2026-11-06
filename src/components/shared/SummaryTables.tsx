/**
 * The pivot-sheet summary (src/lib/ageing-summary.ts) on screen: a strip with
 * each group's total, then one table per group with a coloured title bar like
 * the sheet's, a line per coordinator and a grand total. Used by Overdue
 * Payments and Active Payments for the team leader and administrator.
 */

import { Download } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { SUMMARY_GROUPS, type SummaryGroup, type SummaryLine, type SummaryTable } from '@/lib/ageing-summary'
import { cn, formatCurrency } from '@/lib/utils'

const amount = (v: number) => (v === 0 ? '0.00' : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

function Cells({ line, bold }: { line: SummaryLine; bold?: boolean }) {
  return (
    <>
      <td className={cn('px-3 py-2 text-right tabular-nums', bold && 'font-semibold')}>{line.customers.toLocaleString('en-IN')}</td>
      <td className={cn('px-3 py-2 text-right tabular-nums', bold ? 'font-bold' : 'font-medium', line.balance < 0 && 'text-rose-600')}>{amount(line.balance)}</td>
      {line.buckets.map((v, i) => (
        <td key={i} className={cn('px-3 py-2 text-right tabular-nums', bold && 'font-semibold', v < 0 && 'text-rose-600', v === 0 && !bold && 'text-muted-foreground/60')}>
          {amount(v)}
        </td>
      ))}
    </>
  )
}

export function SummaryTables({
  title,
  subtitle,
  tables,
  columns,
  nameOf,
  onDownload,
  onPick,
}: {
  title: string
  subtitle: string
  tables: SummaryTable[]
  /** Age column labels, e.g. "0 - 30". */
  columns: string[]
  nameOf: (ownerId: string | null) => string
  onDownload?: () => void
  /** Open the list for one coordinator in one group. */
  onPick?: (group: SummaryGroup, ownerId: string | null) => void
}) {
  const shown = tables.filter((t) => t.lines.length > 0)
  const empty = tables.filter((t) => t.lines.length === 0)
  const meta = (g: SummaryGroup) => SUMMARY_GROUPS.find((x) => x.key === g)!

  return (
    <div className="space-y-4" data-testid="summary-tables">
      <GlassCard className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {onDownload && (
          <Button variant="outline" size="sm" onClick={onDownload} disabled={shown.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Excel
          </Button>
        )}
        {/* Each group at a glance, in the sheet's order. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {tables.map((t) => (
            <a
              key={t.group}
              href={`#summary-${t.group}`}
              className={cn('rounded-lg border border-border/50 bg-background/40 px-3 py-2 transition-colors hover:bg-muted/40', t.lines.length === 0 && 'opacity-50')}
            >
              <span className={cn('mb-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold', meta(t.group).bar)}>{meta(t.group).label}</span>
              <span className="block text-sm font-semibold tabular-nums">{formatCurrency(t.total.balance, true)}</span>
              <span className="block text-xs text-muted-foreground">{t.total.customers.toLocaleString('en-IN')} customer{t.total.customers === 1 ? '' : 's'}</span>
            </a>
          ))}
        </div>
      </GlassCard>

      {shown.map((t) => (
        <GlassCard key={t.group} id={`summary-${t.group}`} className="overflow-hidden p-0" data-testid={`summary-${t.group}`}>
          <div className={cn('px-4 py-2 text-center text-sm font-bold tracking-wide', meta(t.group).bar)}>{meta(t.group).label}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-600 text-xs text-white dark:bg-slate-700">
                <tr>
                  <th className="px-4 py-2 text-left font-medium italic">Coordinator Name</th>
                  <th className="px-3 py-2 text-right font-medium">Customers</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  {columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {t.lines.map((l) => (
                  <tr
                    key={l.ownerId ?? 'none'}
                    className={cn(onPick && 'cursor-pointer hover:bg-muted/30')}
                    onClick={() => onPick?.(t.group, l.ownerId)}
                    title={onPick ? 'Show these customers' : undefined}
                  >
                    <td className={cn('whitespace-nowrap px-4 py-2', !l.ownerId && 'text-amber-600')}>{nameOf(l.ownerId)}</td>
                    <Cells line={l} />
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-4 border-double border-border bg-muted/60">
                <tr>
                  <td className="px-4 py-2 font-bold">Grand Total</td>
                  <Cells line={t.total} bold />
                </tr>
              </tfoot>
            </table>
          </div>
        </GlassCard>
      ))}

      {shown.length === 0 && <GlassCard className="p-10 text-center text-sm text-muted-foreground">Nothing owed to summarise.</GlassCard>}
      {empty.length > 0 && shown.length > 0 && (
        <p className="text-xs text-muted-foreground">No customers in: {empty.map((t) => meta(t.group).label).join(', ')}.</p>
      )}
    </div>
  )
}
