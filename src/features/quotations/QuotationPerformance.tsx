/**
 * Quotations → Performance: how the team and each person did, for whatever
 * the filters above hold. Read-only.
 *
 * Win rate is closed out of decided (closed + lost); value won is the order
 * amount of the closed quotations (src/lib/quotation-stats.ts).
 */

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import {
  monthlyPerformance,
  performanceByPerson,
  performanceOf,
  type DateBasis,
  type QuotationPerformance as Perf,
} from '@/lib/quotation-stats'
import type { Quotation } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'

/**
 * Status colours, validated for colour-blind separation with Open between Won
 * and Lost (they are never neighbours in a stack), in light and dark mode.
 */
const STATUS_VARS = '[--q-won:#059669] [--q-open:#3b82f6] [--q-lost:#e11d48] dark:[--q-lost:#f43f5e]'
const STATUS_SERIES = [
  { key: 'closed', label: 'Won', color: 'var(--q-won)' },
  { key: 'open', label: 'Open', color: 'var(--q-open)' },
  { key: 'lost', label: 'Lost', color: 'var(--q-lost)' },
] as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`

type SortKey = 'quotations' | 'closed' | 'lost' | 'open' | 'winRate' | 'valueWon' | 'averageOrder' | 'averageDaysToClose'

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'quotations', label: 'Quotations' },
  { key: 'closed', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'open', label: 'Open' },
  { key: 'winRate', label: 'Win rate', title: 'Won out of decided (won + lost)' },
  { key: 'valueWon', label: 'Value won' },
  { key: 'averageOrder', label: 'Avg order', title: 'Average value of a won order that carries an amount' },
  { key: 'averageDaysToClose', label: 'Days to close', title: 'Average days from quotation to closing, won ones' },
]

const personName = (id: string) => (id ? getCoordinatorDisplayName(id) : 'Unassigned')

function cell(p: Perf, key: SortKey): string {
  const v = p[key]
  if (v === null) return '—'
  if (key === 'winRate') return `${v}%`
  if (key === 'valueWon' || key === 'averageOrder') return v ? formatCurrency(v as number) : '—'
  if (key === 'averageDaysToClose') return `${v} d`
  return String(v)
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/50 bg-background/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {STATUS_SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

function StatusTooltip({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number | string> }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const total = STATUS_SERIES.reduce((s, x) => s + (Number(row[x.key]) || 0), 0)
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 p-3 text-sm shadow-xl backdrop-blur-md">
      <p className="mb-1.5 font-medium">{String(row.name)}</p>
      {STATUS_SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-6">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tabular-nums">{Number(row[s.key]) || 0}</span>
        </div>
      ))}
      <div className="mt-1.5 flex justify-between gap-6 border-t border-border/50 pt-1.5 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </div>
  )
}

function ValueTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; valueWon: number; closed: number } }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 p-3 text-sm shadow-xl backdrop-blur-md">
      <p className="mb-1 font-medium">{row.name}</p>
      <p className="tabular-nums">{formatCurrency(row.valueWon)} won</p>
      <p className="text-xs text-muted-foreground">{row.closed} won quotations</p>
    </div>
  )
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-md border border-border/60 bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.key ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface QuotationPerformanceProps {
  /** The quotations the filters hold. */
  list: Quotation[]
  basis: DateBasis
  /** Leaders see the team and every person; a coordinator sees their own. */
  showPeople: boolean
  /** Open one person's performance (sets the Coordinator filter). */
  onPickPerson?: (personId: string) => void
}

export function QuotationPerformance({ list, basis, showPeople, onPickPerson }: QuotationPerformanceProps) {
  const team = useMemo(() => performanceOf(list), [list])
  const people = useMemo(() => performanceByPerson(list), [list])
  const months = useMemo(() => monthlyPerformance(list, basis).map((m) => ({ ...m, name: monthName(m.month) })), [list, basis])
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'valueWon', dir: 'desc' })
  const [valueBy, setValueBy] = useState<'month' | 'person'>(showPeople ? 'person' : 'month')

  const sortedPeople = useMemo(() => {
    const sign = sort.dir === 'desc' ? -1 : 1
    return [...people].sort((a, b) => sign * ((a.performance[sort.key] ?? -1) - (b.performance[sort.key] ?? -1)))
  }, [people, sort])

  const valueData =
    showPeople && valueBy === 'person'
      ? people.filter((p) => p.performance.valueWon > 0).map((p) => ({ name: personName(p.personId), valueWon: p.performance.valueWon, closed: p.performance.closed }))
      : months.map((m) => ({ name: m.name, valueWon: m.valueWon, closed: m.closed }))

  if (list.length === 0) {
    return <GlassCard className="p-10 text-center text-sm text-muted-foreground">No quotations match these filters.</GlassCard>
  }

  return (
    <div className={cn('space-y-6', STATUS_VARS)} data-testid="quotation-performance">
      <GlassCard className="space-y-4 p-4 sm:p-6">
        <h3 className="text-base font-medium">{showPeople ? 'Team performance' : 'Your performance'}</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Win rate" value={team.winRate === null ? '—' : `${team.winRate}%`} hint={`${team.closed} won · ${team.lost} lost`} />
          <Tile label="Value won" value={formatCurrency(team.valueWon)} hint={`${team.valued} orders with a value`} />
          <Tile label="Average order" value={team.averageOrder === null ? '—' : formatCurrency(team.averageOrder)} />
          <Tile label="Days to close" value={team.averageDaysToClose === null ? '—' : `${team.averageDaysToClose} days`} hint="Sent to won" />
          <Tile label="Follow-ups per quotation" value={team.averageFollowups === null ? '—' : String(team.averageFollowups)} />
          <Tile label="New customers" value={String(team.newCustomers)} hint={`of ${team.quotations} quotations`} />
        </div>

        {showPeople && (
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-sm" data-testid="quotation-people">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Coordinator</th>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key
                    const Icon = !active ? ArrowUpDown : sort.dir === 'desc' ? ArrowDown : ArrowUp
                    return (
                      <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right font-medium" aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
                        <button
                          type="button"
                          title={c.title ?? `Sort by ${c.label}`}
                          onClick={() => setSort(active ? { key: c.key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key: c.key, dir: 'desc' })}
                          className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', active && 'text-foreground')}
                        >
                          {c.label}
                          <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sortedPeople.map(({ personId, performance }) => (
                  <tr
                    key={personId || 'none'}
                    className={cn('hover:bg-muted/30', onPickPerson && 'cursor-pointer')}
                    onClick={() => onPickPerson?.(personId || 'none')}
                    title={onPickPerson ? 'Show only this person' : undefined}
                  >
                    <td className={cn('whitespace-nowrap px-4 py-2.5 font-medium', !personId && 'text-amber-600')}>{personName(personId)}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', c.key === 'valueWon' && 'font-semibold')}>
                        {cell(performance, c.key)}
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
                      {cell(team, c.key)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="space-y-3 p-4 sm:p-6">
          <div>
            <h3 className="text-base font-medium">Quotations month by month</h3>
            <p className="text-xs text-muted-foreground">By {basis === 'closing' ? 'closing' : 'quotation'} date, split by where each stands.</p>
          </div>
          <Legend />
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="25%">
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<StatusTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }} />
                {STATUS_SERIES.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="status"
                    fill={s.color}
                    stroke="var(--color-background)"
                    strokeWidth={1}
                    radius={i === STATUS_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                    maxBarSize={40}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-medium">Value won {showPeople && valueBy === 'person' ? 'by person' : 'month by month'}</h3>
              <p className="text-xs text-muted-foreground">Order value of won quotations.</p>
            </div>
            {showPeople && (
              <Toggle
                value={valueBy}
                onChange={setValueBy}
                options={[
                  { key: 'person', label: 'By person' },
                  { key: 'month', label: 'By month' },
                ]}
              />
            )}
          </div>
          {valueData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No won quotations with a value here.</div>
          ) : showPeople && valueBy === 'person' ? (
            <div style={{ height: Math.max(220, valueData.length * 40 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap={10}>
                  <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeOpacity={0.5} />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v, true)} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fill: 'var(--color-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ValueTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }} />
                  <Bar dataKey="valueWon" fill="var(--q-won)" radius={[0, 4, 4, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.5} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--color-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => formatCurrency(v, true)} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip content={<ValueTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }} />
                  <Bar dataKey="valueWon" fill="var(--q-won)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
