import { useState } from 'react'
import { CalendarRange } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  AGE_CHOICES,
  NO_FILTER,
  describeImportFilter,
  type DateField,
  type ImportFilter,
} from '@/lib/excel-filter'
import type { ExcelBook } from '@shared/api'

interface Props {
  book: ExcelBook
  value: ImportFilter
  onChange: (filter: ImportFilter) => void
  className?: string
}

/**
 * Short labels, because six of them have to sit in a popover without wrapping
 * into three ragged rows. "90 days" is as clear as "Last 90 days" once the
 * heading above says "Bring in".
 */
const WINDOWS: { days: number; label: string }[] = [
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
]

/**
 * Which part of the workbook's timeline to bring in.
 *
 * The two books get different controls because they hold different things: an
 * invoice sheet has dates to filter on, while an ageing report has no date at
 * all — only how old the money is. Offering a date range on the ageing tab
 * would be a control that quietly did nothing, which is worse than none.
 *
 * The exact dates appear only once "Custom" is chosen. Shown always, they made
 * the panel half a screen tall and put a second "Custom dates" heading under a
 * button already labelled that, so the same thing was named twice.
 */
export function ImportWindowFilter({ book, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const active = book === 'overdue' ? value.minDaysOverdue !== null : value.window.kind !== 'any'
  const custom = value.window.kind === 'range'

  const set = (next: Partial<ImportFilter>) => onChange({ ...value, ...next })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/*
          Outline even when set: this sits beside "Sync now", and two filled
          buttons side by side leave nothing to say which one is the action.
          A dot carries the state instead.
        */}
        <Button
          variant="outline"
          size="sm"
          className={cn('shrink-0 gap-2', active && 'border-primary/50 text-primary', className)}
          aria-label="Choose which dates to import"
        >
          <CalendarRange className="h-4 w-4" />
          Date filter
          {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] space-y-3">
        {book === 'overdue' ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Only money older than</Label>
            <Select
              value={value.minDaysOverdue === null ? 'any' : String(value.minDaysOverdue)}
              onValueChange={(choice) =>
                set({ minDaysOverdue: choice === 'any' ? null : Number(choice) })
              }
            >
              <SelectTrigger className="h-9" aria-label="Age of the money">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any age</SelectItem>
                {AGE_CHOICES.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {days} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This sheet has no dates, only ageing buckets.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Measure against</Label>
              <Select
                value={value.dateField}
                onValueChange={(field) => set({ dateField: field as DateField })}
              >
                <SelectTrigger className="h-9" aria-label="Which date">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice_date">Invoice date</SelectItem>
                  <SelectItem value="due_date">Due date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bring in</Label>
              <div className="flex flex-wrap gap-1.5">
                <Choice
                  label="All time"
                  selected={value.window.kind === 'any'}
                  onClick={() => set({ window: { kind: 'any' } })}
                />
                {WINDOWS.map(({ days, label }) => (
                  <Choice
                    key={days}
                    label={label}
                    selected={value.window.kind === 'recent' && value.window.days === days}
                    onClick={() => set({ window: { kind: 'recent', days } })}
                  />
                ))}
                <Choice
                  label="Custom"
                  selected={custom}
                  onClick={() => {
                    if (!custom) set({ window: { kind: 'range', from: null, to: null } })
                    window.setTimeout(
                      () => document.querySelector<HTMLInputElement>('#import-from-date')?.focus(),
                      0
                    )
                  }}
                />
              </div>
            </div>

            {custom && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                <Input
                  id="import-from-date"
                  type="date"
                  className="h-9 px-2 text-xs"
                  aria-label="From date"
                  value={value.window.kind === 'range' ? value.window.from ?? '' : ''}
                  onChange={(event) =>
                    set({
                      window: {
                        kind: 'range',
                        from: event.target.value || null,
                        to: value.window.kind === 'range' ? value.window.to : null,
                      },
                    })
                  }
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  className="h-9 px-2 text-xs"
                  aria-label="To date"
                  value={value.window.kind === 'range' ? value.window.to ?? '' : ''}
                  onChange={(event) =>
                    set({
                      window: {
                        kind: 'range',
                        from: value.window.kind === 'range' ? value.window.from : null,
                        to: event.target.value || null,
                      },
                    })
                  }
                />
              </div>
            )}
          </>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium" data-testid="import-filter-summary">
            {describeImportFilter(value, book)}
          </p>
          {/* The one line people need before narrowing anything. */}
          <p className="text-xs text-muted-foreground">
            Affects the next sync only — nothing already in the CRM is removed.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8" onClick={() => setOpen(false)}>
              Done
            </Button>
            {active && (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => onChange(NO_FILTER)}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Choice({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-md border px-2 py-1 text-xs transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:bg-muted'
      )}
    >
      {label}
    </button>
  )
}
