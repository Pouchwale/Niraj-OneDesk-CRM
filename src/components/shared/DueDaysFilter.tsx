import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, SlidersHorizontal, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  DUE_FILTER_PRESETS,
  describeRange,
  formFromRange,
  isOverdueRange,
  loadCustomPresets,
  rangeFromForm,
  removeCustomPreset,
  saveCustomPreset,
  type DueFilterPreset,
  type DueRangeMode,
} from '@/lib/due-filter'

interface DueDaysFilterProps {
  value: DueFilterPreset | null
  onChange: (next: DueFilterPreset | null) => void
  /** Saved ranges are kept per person. */
  userId?: string
  /** The built-in windows to offer; defaults to the due-date ones. */
  presets?: DueFilterPreset[]
  /**
   * For the ageing report, which only holds money already past due: hides
   * the "due in" mode and any saved range that is not an overdue one.
   */
  overdueOnly?: boolean
  className?: string
}

const CUSTOM = '__custom__'
const ANY = '__any__'

/**
 * "Payment due" filter: the usual windows, plus ranges the person defines and
 * keeps - "overdue by 45 to 75 days", "due in 3 to 10 days".
 */
export function DueDaysFilter({
  value,
  onChange,
  userId,
  presets = DUE_FILTER_PRESETS,
  overdueOnly = false,
  className,
}: DueDaysFilterProps) {
  const [open, setOpen] = useState(false)
  const [savedAll, setSavedAll] = useState<DueFilterPreset[]>(() => (userId ? loadCustomPresets(userId) : []))
  const [mode, setMode] = useState<DueRangeMode>('overdue')
  const [from, setFrom] = useState<string>('1')
  const [to, setTo] = useState<string>('30')
  const [name, setName] = useState('')

  const saved = useMemo(
    () => (overdueOnly ? savedAll.filter(isOverdueRange) : savedAll),
    [savedAll, overdueOnly]
  )
  const setSaved = setSavedAll

  useEffect(() => {
    setSavedAll(userId ? loadCustomPresets(userId) : [])
  }, [userId])

  // Opening the editor on an existing range shows that range, not the defaults.
  useEffect(() => {
    if (!open) return
    if (!value) {
      if (overdueOnly) setMode('overdue')
      return
    }
    const form = formFromRange(value)
    setMode(overdueOnly ? 'overdue' : form.mode)
    setFrom(form.from === null ? '' : String(form.from))
    setTo(form.to === null ? '' : String(form.to))
    setName(value.custom ? value.label : '')
  }, [open, value, overdueOnly])

  const parse = (text: string): number | null => {
    const n = Number(text)
    return text.trim() === '' || Number.isNaN(n) ? null : n
  }
  const draft = useMemo(() => rangeFromForm(mode, parse(from), parse(to)), [mode, from, to])
  const draftLabel = describeRange(draft)
  const draftValid = parse(from) !== null || parse(to) !== null

  const apply = (label?: string) => {
    onChange({
      id: `adhoc-${draft.minDays ?? 'x'}-${draft.maxDays ?? 'x'}`,
      label: label ?? draftLabel,
      minDays: draft.minDays,
      maxDays: draft.maxDays,
      custom: true,
    })
    setOpen(false)
  }

  const saveAndApply = () => {
    if (!userId) {
      apply()
      return
    }
    const preset = saveCustomPreset(userId, name || draftLabel, draft)
    setSaved(loadCustomPresets(userId))
    onChange(preset)
    setName('')
    setOpen(false)
  }

  const remove = (id: string) => {
    if (!userId) return
    removeCustomPreset(userId, id)
    setSaved(loadCustomPresets(userId))
    if (value?.id === id) onChange(null)
  }

  const selectValue = value ? (value.id.startsWith('adhoc-') ? CUSTOM : value.id) : ANY

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Select
        value={selectValue}
        onValueChange={(id) => {
          if (id === ANY) return onChange(null)
          if (id === CUSTOM) return setOpen(true)
          const preset = [...presets, ...saved].find((p) => p.id === id)
          if (preset) onChange(preset)
        }}
      >
        <SelectTrigger className="w-full sm:w-[210px]" aria-label="Payment due">
          <CalendarClock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Payment due">
            {value ? value.label : 'Any due date'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any due date</SelectItem>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
          {saved.length > 0 && (
            <div className="mt-1 border-t border-border px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Saved
            </div>
          )}
          {saved.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
          <div className="mt-1 border-t border-border" />
          <SelectItem value={CUSTOM}>Custom range…</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Customise the payment due filter"
            title="Custom range"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[320px] space-y-4">
          <div>
            <p className="text-sm font-semibold">Custom due range</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Days are counted from today. Leave a box empty for no limit.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{overdueOnly ? 'Show balances overdue by' : 'Show accounts that are'}</Label>
            {!overdueOnly && (
              <Select value={mode} onValueChange={(v) => setMode(v as DueRangeMode)}>
                <SelectTrigger className="h-9" aria-label="Show accounts that are">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overdue">Overdue by</SelectItem>
                  <SelectItem value="due">Due in</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9"
                aria-label="From days"
                placeholder="from"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9"
                aria-label="To days"
                placeholder="to"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
            <p className="text-xs font-medium text-foreground" data-testid="due-range-preview">
              {draftValid ? draftLabel : 'Enter at least one number.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs" htmlFor="due-range-name">
              Save it as
            </Label>
            <Input
              id="due-range-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={draftLabel}
              className="h-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => apply()} disabled={!draftValid}>
              Apply
            </Button>
            {userId && (
              <Button size="sm" variant="outline" onClick={saveAndApply} disabled={!draftValid}>
                Save &amp; apply
              </Button>
            )}
            {value && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>

          {saved.length > 0 && (
            <div className="space-y-1 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Your saved ranges</p>
              <ul className="space-y-1">
                {saved.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left hover:bg-muted"
                      onClick={() => {
                        onChange(p)
                        setOpen(false)
                      }}
                    >
                      {p.label}
                      <span className="ml-1.5 text-xs text-muted-foreground">{describeRange(p)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label={`Remove ${p.label}`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
