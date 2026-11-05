/**
 * The filters above Quotations: when (by quotation date or closing date), how
 * big (order value), and whose. They narrow the cards, the list and the
 * Performance view alike.
 */

import { CalendarRange, IndianRupee, Users, X } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DateBasis, QuotationFilter } from '@/lib/quotation-stats'
import { addDaysISO, cn, formatCurrency, formatDate } from '@/lib/utils'

export type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'this_quarter' | 'this_year' | 'custom'
export type ValuePreset = 'any' | 'under_25k' | '25k_1l' | '1l_5l' | 'over_5l' | 'custom'

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3_months', label: 'Last 3 months' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'custom', label: 'Custom dates…' },
]

export const VALUE_PRESETS: { id: ValuePreset; label: string; min: number | null; max: number | null }[] = [
  { id: 'any', label: 'Any value', min: null, max: null },
  { id: 'under_25k', label: 'Under ₹25K', min: null, max: 24999.99 },
  { id: '25k_1l', label: '₹25K – ₹1L', min: 25000, max: 100000 },
  { id: '1l_5l', label: '₹1L – ₹5L', min: 100000.01, max: 500000 },
  { id: 'over_5l', label: 'Over ₹5L', min: 500000.01, max: null },
  { id: 'custom', label: 'Custom value…', min: null, max: null },
]

const pad = (n: number) => String(n).padStart(2, '0')
const monthStart = (y: number, m: number) => `${y}-${pad(m)}-01`
const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`

/** The from/to a preset means today (calendar months and quarters). */
export function presetRange(preset: DatePreset, today: string): { from: string | null; to: string | null } {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  switch (preset) {
    case 'this_month':
      return { from: monthStart(y, m), to: monthEnd(y, m) }
    case 'last_month': {
      const ly = m === 1 ? y - 1 : y
      const lm = m === 1 ? 12 : m - 1
      return { from: monthStart(ly, lm), to: monthEnd(ly, lm) }
    }
    case 'last_3_months':
      return { from: addDaysISO(today, -91), to: today }
    case 'this_quarter': {
      const first = Math.floor((m - 1) / 3) * 3 + 1
      return { from: monthStart(y, first), to: monthEnd(y, first + 2) }
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    default:
      return { from: null, to: null }
  }
}

export interface FilterState {
  datePreset: DatePreset
  basis: DateBasis
  customFrom: string
  customTo: string
  valuePreset: ValuePreset
  customMin: string
  customMax: string
  owner: string
}

export const DEFAULT_FILTERS: FilterState = {
  datePreset: 'all',
  basis: 'quotation',
  customFrom: '',
  customTo: '',
  valuePreset: 'any',
  customMin: '',
  customMax: '',
  owner: 'all',
}

/** The filter the lists apply. */
export function toQuotationFilter(state: FilterState, today: string): QuotationFilter {
  const range = state.datePreset === 'custom' ? { from: state.customFrom || null, to: state.customTo || null } : presetRange(state.datePreset, today)
  const value =
    state.valuePreset === 'custom'
      ? {
          min: state.customMin.trim() === '' ? null : Number(state.customMin),
          max: state.customMax.trim() === '' ? null : Number(state.customMax),
        }
      : VALUE_PRESETS.find((p) => p.id === state.valuePreset)!
  return {
    basis: state.basis,
    from: range.from,
    to: range.to,
    minValue: value.min !== null && Number.isFinite(value.min) ? value.min : null,
    maxValue: value.max !== null && Number.isFinite(value.max) ? value.max : null,
  }
}

/** What is applied, in words, for the line under the filters. */
export function describeFilter(f: QuotationFilter, ownerName: string | null): string[] {
  const out: string[] = []
  if (f.from || f.to) {
    const by = f.basis === 'closing' ? 'Closed' : f.basis === 'enquiry' ? 'Enquired' : 'Sent'
    out.push(
      f.from && f.to
        ? `${by} ${formatDate(f.from)} – ${formatDate(f.to)}`
        : f.from
          ? `${by} from ${formatDate(f.from)}`
          : `${by} up to ${formatDate(f.to!)}`
    )
  }
  if (f.minValue !== null || f.maxValue !== null) {
    out.push(
      f.minValue !== null && f.maxValue !== null
        ? `Value ${formatCurrency(f.minValue, true)} – ${formatCurrency(f.maxValue, true)}`
        : f.minValue !== null
          ? `Value over ${formatCurrency(f.minValue, true)}`
          : `Value under ${formatCurrency(f.maxValue!, true)}`
    )
  }
  if (ownerName) out.push(ownerName)
  return out
}

interface QuotationFiltersProps {
  state: FilterState
  onChange: (next: FilterState) => void
  today: string
  /** Leaders only: whose quotations. */
  owners?: { id: string; full_name: string }[]
  ownerName: string | null
}

function Field({ icon: Icon, label, children }: { icon: typeof CalendarRange; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function QuotationFilters({ state, onChange, today, owners, ownerName }: QuotationFiltersProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...state, ...patch })
  const applied = describeFilter(toQuotationFilter(state, today), ownerName)
  const isDefault = JSON.stringify(state) === JSON.stringify(DEFAULT_FILTERS)

  return (
    <GlassCard className="space-y-3 p-4" data-testid="quotation-filters">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
        <Field icon={CalendarRange} label="Date">
          <Select value={state.datePreset} onValueChange={(v) => set({ datePreset: v as DatePreset })}>
            <SelectTrigger className="h-9 w-[160px]" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div role="radiogroup" aria-label="Date of" className="inline-flex rounded-md border border-border/60 bg-muted/40 p-0.5">
            {(['enquiry', 'quotation', 'closing'] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={state.basis === b}
                onClick={() => set({ basis: b })}
                title={
                  b === 'enquiry'
                    ? 'The date the enquiry came in (as the team sheet counts)'
                    : b === 'quotation'
                      ? 'The date the quotation was sent'
                      : 'The date it was won or lost (open ones have none)'
                }
                className={cn(
                  'rounded px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  state.basis === b ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {b === 'enquiry' ? 'Enquiry date' : b === 'quotation' ? 'Quotation date' : 'Closing date'}
              </button>
            ))}
          </div>
          {state.datePreset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="From"
                className="h-9 w-[150px]"
                value={state.customFrom}
                max={state.customTo || undefined}
                onChange={(e) => set({ customFrom: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To"
                className="h-9 w-[150px]"
                value={state.customTo}
                min={state.customFrom || undefined}
                onChange={(e) => set({ customTo: e.target.value })}
              />
            </div>
          )}
        </Field>

        <Field icon={IndianRupee} label="Order value">
          <Select value={state.valuePreset} onValueChange={(v) => set({ valuePreset: v as ValuePreset })}>
            <SelectTrigger className="h-9 w-[160px]" aria-label="Order value">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VALUE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.valuePreset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Min ₹"
                aria-label="Minimum value"
                className="h-9 w-[110px]"
                value={state.customMin}
                onChange={(e) => set({ customMin: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Max ₹"
                aria-label="Maximum value"
                className="h-9 w-[110px]"
                value={state.customMax}
                onChange={(e) => set({ customMax: e.target.value })}
              />
            </div>
          )}
        </Field>

        {owners && (
          <Field icon={Users} label="Coordinator">
            <Select value={state.owner} onValueChange={(v) => set({ owner: v })}>
              <SelectTrigger className="h-9 w-full min-w-[170px]" aria-label="Coordinator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole team</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.full_name}
                  </SelectItem>
                ))}
                <SelectItem value="none">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 text-xs">
        {applied.length === 0 ? (
          <span className="text-muted-foreground">Showing every quotation.</span>
        ) : (
          applied.map((a) => (
            <span key={a} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-foreground">
              {a}
            </span>
          ))
        )}
        {state.valuePreset !== 'any' && (
          <span className="text-muted-foreground">Only won quotations carry an order value.</span>
        )}
        {!isDefault && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => onChange(DEFAULT_FILTERS)}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>
    </GlassCard>
  )
}
