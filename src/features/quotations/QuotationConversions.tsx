/**
 * Quotations → Performance → Conversions and score: the team's sheet layout
 * (total / new / existing quotations and conversions, one line per
 * coordinator) with the score, for whatever the filters above hold.
 *
 * Conversion = a Closed quotation. Points: Closed + New customer 100, Closed +
 * Existing customer 50, anything else 0 (src/lib/quotation-stats.ts). The
 * average score (points ÷ customers) is written in minus scoring since 7 Nov
 * 2026, as its gap from 100 (src/lib/minus-score.ts); the points stay as the
 * formula adds them up.
 */

import { useMemo } from 'react'

import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { GlassCard } from '@/components/shared/GlassCard'
import { minusFixed } from '@/lib/minus-score'
import { conversionsByPerson, conversionsOf, QUOTATION_SCORE, type ConversionSummary } from '@/lib/quotation-stats'
import type { Quotation } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'

const personName = (id: string) => (id ? getCoordinatorDisplayName(id) : 'Unassigned')
const n = (v: number) => v.toLocaleString('en-IN')
/** The average score in minus scoring, two decimals as before: 85.00 reads "-15.00". */
const avg = (v: number | null) => minusFixed(v, 2)

const COLUMNS: { key: keyof ConversionSummary; label: string }[] = [
  { key: 'quotations', label: 'Total quotations' },
  { key: 'conversions', label: 'Total conversion' },
  { key: 'newConversions', label: 'New conversion' },
  { key: 'existingConversions', label: 'Existing conversion' },
  { key: 'amount', label: 'Total amount' },
  { key: 'score', label: 'Total points' },
  { key: 'customers', label: 'Count of customer' },
  { key: 'averageScore', label: 'Avg score' },
]

/** A cell's text; the amount is written short on narrower screens (₹1.22Cr) and in full on wide ones. */
function cellOf(s: ConversionSummary, key: keyof ConversionSummary) {
  if (key === 'averageScore') return avg(s.averageScore)
  if (key !== 'amount') return n(s[key] as number)
  if (!s.amount) return '—'
  return (
    <>
      <span className="hidden 2xl:inline">{formatCurrency(s.amount)}</span>
      <span className="2xl:hidden" title={formatCurrency(s.amount)}>
        {formatCurrency(s.amount, true)}
      </span>
    </>
  )
}

/** Where the Conversion, amount and Score groups begin: a thin divider before them. */
const GROUP_START = new Set<keyof ConversionSummary>(['conversions', 'amount', 'score'])

/** One block of the summary: a total with its new / existing split. */
function SplitTile({ label, total, hint, split }: { label: string; total: string; hint?: string; split: [string, string][] }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/50 bg-background/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{total}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/50 pt-2">
        {split.map(([name, value]) => (
          <div key={name}>
            <p className="text-xs text-muted-foreground">{name}</p>
            <p className="font-medium tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

interface QuotationConversionsProps {
  /** The quotations the filters hold. */
  list: Quotation[]
  /** "24 Oct 2026 – 31 Oct 2026 · by quotation date", or "All dates". */
  period: string
  /** Leaders see a line per coordinator; a coordinator sees their own summary. */
  showPeople: boolean
  /** Coordinators who get a line even with nothing in the period. */
  people: string[]
  onPickPerson?: (personId: string) => void
}

export function QuotationConversions({ list, period, showPeople, people, onPickPerson }: QuotationConversionsProps) {
  const team = useMemo(() => conversionsOf(list), [list])
  const rows = useMemo(() => conversionsByPerson(list, people), [list, people])

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="quotation-conversions">
      <div>
        <h3 className="text-base font-medium">Conversions and score</h3>
        <p className="text-xs text-muted-foreground">{period}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SplitTile
          label="Total quotations"
          total={n(team.quotations)}
          split={[
            ['New', n(team.newQuotations)],
            ['Existing', n(team.existingQuotations)],
          ]}
        />
        <SplitTile
          label="Total conversion"
          total={n(team.conversions)}
          hint={[team.conversionRate === null ? null : `${team.conversionRate}% of quotations`, team.amount ? `${formatCurrency(team.amount)} total amount` : null]
            .filter(Boolean)
            .join(' · ') || undefined}
          split={[
            ['New', n(team.newConversions)],
            ['Existing', n(team.existingConversions)],
          ]}
        />
        <SplitTile
          label="Avg score (per customer)"
          total={avg(team.averageScore)}
          split={[
            ['Total points', n(team.score)],
            ['Count of customer', n(team.customers)],
          ]}
        />
      </div>

      {showPeople && (
        <div className="overflow-x-auto rounded-md border border-border/50">
          <table className="w-full text-sm" data-testid="quotation-conversions-people">
            {/* Grouped like the sheet, so each column is only as wide as its numbers. */}
            <thead className="bg-muted/50 text-[11px] uppercase leading-tight text-muted-foreground">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom font-medium">Coordinator</th>
                <th rowSpan={2} className="px-2 py-2 text-right align-bottom font-medium">Total quotations</th>
                <th colSpan={3} className="border-b border-l border-border/50 px-2 pb-1 pt-2 text-center font-medium">Conversion</th>
                <th rowSpan={2} className="border-l border-border/50 px-2 py-2 text-right align-bottom font-medium">Total amount</th>
                <th colSpan={3} className="border-b border-l border-border/50 px-2 pb-1 pt-2 text-center font-medium">Score</th>
              </tr>
              <tr>
                {['Total', 'New', 'Existing'].map((label, i) => (
                  <th key={`c-${label}`} className={cn('px-2 pb-2 pt-1 text-right font-medium', i === 0 && 'border-l border-border/50')}>
                    {label}
                  </th>
                ))}
                {['Points', 'Customers', 'Avg'].map((label, i) => (
                  <th key={`s-${label}`} className={cn('px-2 pb-2 pt-1 text-right font-medium', i === 0 && 'border-l border-border/50')}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map(({ personId, summary }) => (
                <tr
                  key={personId || 'none'}
                  className={cn('hover:bg-muted/30', onPickPerson && 'cursor-pointer', summary.quotations === 0 && 'text-muted-foreground')}
                  onClick={() => onPickPerson?.(personId || 'none')}
                  title={onPickPerson ? 'Show only this person' : undefined}
                >
                  <td className={cn('whitespace-nowrap px-3 py-2.5 font-medium', !personId && 'text-amber-600')}>{personName(personId)}</td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'whitespace-nowrap px-2 py-2.5 text-right text-[13px] tabular-nums xl:text-sm',
                        GROUP_START.has(c.key) && 'border-l border-border/40',
                        c.key === 'averageScore' && 'font-semibold'
                      )}
                    >
                      {cellOf(summary, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
              <tr>
                <td className="px-3 py-2.5">Team</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={cn('whitespace-nowrap px-2 py-2.5 text-right text-[13px] tabular-nums xl:text-sm', GROUP_START.has(c.key) && 'border-l border-border/40')}>
                    {cellOf(team, c.key)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Conversion = a Closed quotation; Total amount = the order value of the conversions. Points per quotation: Closed + New customer = {QUOTATION_SCORE.closedNew}, Closed + Existing
        customer = {QUOTATION_SCORE.closedExisting}, Open or Lost = 0. Count of customer = different customers quoted in the period;
        Avg score = total points ÷ count of customer, in minus scoring: the gap from 100, so 0 is full marks and 85 shows as -15 (above 100 shows with a +).
        Choose "Enquiry date" above to count the period the way the team sheet does.
      </p>
    </GlassCard>
  )
}
