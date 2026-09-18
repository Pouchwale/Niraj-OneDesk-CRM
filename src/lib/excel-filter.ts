/**
 * Choosing which part of a workbook's timeline to import.
 *
 * A real export carries everything the source system has ever recorded. This
 * team's file holds nine months of invoices and due dates running out to
 * December, and most days nobody needs all of it — they are working this
 * quarter, or the last ninety days, or everything falling due before month end.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It never removes anything already in the CRM. Narrowing the window
 *     changes what comes in next; an account somebody has been working, with
 *     follow-ups logged on it, does not vanish because a date moved.
 *   - It never filters the ageing book by date, because that sheet has no date
 *     on it. Its only sense of time is the five ageing buckets, so that is what
 *     is offered there — anything else would be a control that quietly did
 *     nothing.
 */

import type { ExcelBook } from '@shared/api'
import { todayISO } from './utils'
import { DAY_MS } from './constants'

/** Which of the two dates on an invoice row the window is measured against. */
export type DateField = 'invoice_date' | 'due_date'

export type DateWindow =
  | { kind: 'any' }
  /** A rolling window: the last N days, counted from today on every sync. */
  | { kind: 'recent'; days: number }
  /** Fixed dates. Either end may be left open. */
  | { kind: 'range'; from: string | null; to: string | null }

export interface ImportFilter {
  dateField: DateField
  window: DateWindow
  /**
   * The ageing book's only notion of time: skip rows with no money at least
   * this old. 90 means "nothing whose whole balance is younger than 91 days".
   */
  minDaysOverdue: number | null
}

export const NO_FILTER: ImportFilter = {
  dateField: 'invoice_date',
  window: { kind: 'any' },
  minDaysOverdue: null,
}

/** The ages the ageing report can actually distinguish, from its buckets. */
export const AGE_CHOICES = [30, 60, 90, 120] as const

/** Which buckets hold money at least this old. */
const BUCKETS_FROM: Record<number, readonly string[]> = {
  30: ['due_31_60', 'due_61_90', 'due_91_120', 'due_121_plus'],
  60: ['due_61_90', 'due_91_120', 'due_121_plus'],
  90: ['due_91_120', 'due_121_plus'],
  120: ['due_121_plus'],
}

export function isFilterActive(filter: ImportFilter): boolean {
  return filter.window.kind !== 'any' || filter.minDaysOverdue !== null
}

/** True when this filter has any effect on the given book. */
export function affectsBook(filter: ImportFilter, book: ExcelBook): boolean {
  return book === 'overdue' ? filter.minDaysOverdue !== null : filter.window.kind !== 'any'
}

/* ===================== Saved per book ===================== */

const KEY = 'crm.excel.filter'

export function loadImportFilter(book: ExcelBook): ImportFilter {
  try {
    const raw = localStorage.getItem(`${KEY}.${book}`)
    if (!raw) return NO_FILTER
    const parsed = JSON.parse(raw) as Partial<ImportFilter>

    const window = parsed.window
    const safeWindow: DateWindow =
      window?.kind === 'recent' && Number.isFinite(window.days) && window.days > 0
        ? { kind: 'recent', days: Math.floor(window.days) }
        : window?.kind === 'range' && (window.from || window.to)
          ? { kind: 'range', from: window.from ?? null, to: window.to ?? null }
          : { kind: 'any' }

    return {
      dateField: parsed.dateField === 'due_date' ? 'due_date' : 'invoice_date',
      window: safeWindow,
      minDaysOverdue:
        typeof parsed.minDaysOverdue === 'number' && BUCKETS_FROM[parsed.minDaysOverdue]
          ? parsed.minDaysOverdue
          : null,
    }
  } catch {
    // No storage, or something wrote nonsense there. Importing everything is
    // the reading that loses nothing.
    return NO_FILTER
  }
}

export function saveImportFilter(book: ExcelBook, filter: ImportFilter): void {
  try {
    if (!isFilterActive(filter)) localStorage.removeItem(`${KEY}.${book}`)
    else localStorage.setItem(`${KEY}.${book}`, JSON.stringify(filter))
  } catch {
    // Remembering the choice is a convenience; it still applies to this sync.
  }
}

/* ===================== Applying it ===================== */

/** The window as two dates, resolved against today. Null ends stay open. */
export function windowBounds(window: DateWindow, today: string = todayISO()): {
  from: string | null
  to: string | null
} {
  if (window.kind === 'any') return { from: null, to: null }
  if (window.kind === 'range') return { from: window.from || null, to: window.to || null }

  // Rolling, so a saved "last 90 days" is still the last 90 days tomorrow.
  const start = new Date(`${today}T00:00:00`)
  start.setTime(start.getTime() - (window.days - 1) * DAY_MS)
  const year = start.getFullYear()
  const month = String(start.getMonth() + 1).padStart(2, '0')
  const day = String(start.getDate()).padStart(2, '0')
  return { from: `${year}-${month}-${day}`, to: today }
}

/**
 * An invoice row: is its date inside the window?
 *
 * A row with no date at all is kept. The window says which part of the
 * timeline is wanted, and a row that never claimed a position on it is not
 * evidence of being outside — dropping it would lose money over a blank cell.
 */
export function keepByDate(
  row: { invoice_date: string | null; due_date: string | null },
  filter: ImportFilter,
  today: string = todayISO()
): boolean {
  if (filter.window.kind === 'any') return true

  const value = filter.dateField === 'due_date' ? row.due_date : row.invoice_date
  if (!value) return true

  const { from, to } = windowBounds(filter.window, today)
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

/** The five ageing buckets, as much of them as a row happens to carry. */
export type AgeingBuckets = Partial<Record<
  'due_0_30' | 'due_31_60' | 'due_61_90' | 'due_91_120' | 'due_121_plus',
  number | null
>>

/** An ageing row: does it carry money at least as old as the filter asks? */
export function keepByAge(row: AgeingBuckets, filter: ImportFilter): boolean {
  if (filter.minDaysOverdue === null) return true

  const buckets = BUCKETS_FROM[filter.minDaysOverdue] ?? []
  const aged = buckets.reduce((sum, key) => sum + (Number(row[key as keyof AgeingBuckets]) || 0), 0)
  // A credit sitting in an old bucket is still a position of that age.
  return aged !== 0
}

/* ===================== Saying what it does ===================== */

const FIELD_LABEL: Record<DateField, string> = {
  invoice_date: 'invoice date',
  due_date: 'due date',
}

function readableDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The filter in one line, written as what will be imported.
 *
 * Somebody glancing at the card needs to know what they are looking at, not
 * what they are missing.
 */
export function describeImportFilter(filter: ImportFilter, book: ExcelBook): string {
  if (book === 'overdue') {
    return filter.minDaysOverdue === null
      ? 'Importing every balance'
      : `Importing only money past ${filter.minDaysOverdue} days`
  }

  const field = FIELD_LABEL[filter.dateField]
  const { window } = filter

  if (window.kind === 'any') return 'Importing every row in the sheet'
  if (window.kind === 'recent') return `Importing the last ${window.days} days by ${field}`

  if (window.from && window.to) {
    return `Importing ${field} ${readableDate(window.from)} to ${readableDate(window.to)}`
  }
  if (window.from) return `Importing ${field} from ${readableDate(window.from)}`
  if (window.to) return `Importing ${field} up to ${readableDate(window.to)}`
  return 'Importing every row in the sheet'
}
