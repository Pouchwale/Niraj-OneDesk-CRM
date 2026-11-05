/**
 * Quotations → Performance → Conversions and score: the team's sheet layout
 * (total / new / existing quotations and conversions, one line per
 * coordinator) with the score, for whatever the filters above hold.
 *
 * Conversion = a Closed quotation. Score: Closed + New customer 100, Closed +
 * Existing customer 50, anything else 0 (src/lib/quotation-stats.ts).
 */

import { useMemo } from 'react'

import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { GlassCard } from '@/components/shared/GlassCard'
import { conversionsByPerson, conversionsOf, QUOTATION_SCORE, type ConversionSummary } from '@/lib/quotation-stats'
import type { Quotation } from '@/lib/types'
import { cn } from '@/lib/utils'

const personName = (id: string) => (id ? getCoordinatorDisplayName(id) : 'Unassigned')
const n = (v: number) => v.toLocaleString('en-IN')

const COLUMNS: { key: keyof ConversionSummary; label: string }[] = [
  { key: 'quotations', label: 'Total quotations' },
  { key: 'conversions', label: 'Total conversion' },
  { key: 'newConversions', label: 'New conversion' },
  { key: 'existingConversions', label: 'Existing conversion' },
  { key: 'score', label: 'Score' },
]

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
          hint={team.conversionRate === null ? undefined : `${team.conversionRate}% of quotations`}
          split={[
            ['New', n(team.newConversions)],
            ['Existing', n(team.existingConversions)],
          ]}
        />
        <SplitTile
          label="Score"
          total={n(team.score)}
          split={[
            [`New × ${QUOTATION_SCORE.closedNew}`, n(team.newConversions * QUOTATION_SCORE.closedNew)],
            [`Existing × ${QUOTATION_SCORE.closedExisting}`, n(team.existingConversions * QUOTATION_SCORE.closedExisting)],
          ]}
        />
      </div>

      {showPeople && (
        <div className="overflow-x-auto rounded-md border border-border/50">
          <table className="w-full text-sm" data-testid="quotation-conversions-people">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Coordinator</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                    {c.label}
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
                  <td className={cn('whitespace-nowrap px-4 py-2.5 font-medium', !personId && 'text-amber-600')}>{personName(personId)}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', c.key === 'score' && 'font-semibold')}>
                      {n(summary[c.key] as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
              <tr>
                <td className="px-4 py-2.5">Team</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {n(team[c.key] as number)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Conversion = a Closed quotation. Score per quotation: Closed + New customer = {QUOTATION_SCORE.closedNew}, Closed + Existing
        customer = {QUOTATION_SCORE.closedExisting}, Open or Lost = 0.
      </p>
    </GlassCard>
  )
}
