import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parses Indian currency shorthand strings into numeric values.
 * Examples:
 *   parseCurrency('1.8L')      → 180000
 *   parseCurrency('50k')       → 50000
 *   parseCurrency('2.5Cr')     → 25000000
 *   parseCurrency('₹1,50,000') → 150000
 *   parseCurrency('1234')      → 1234
 */
export function parseCurrency(value: string | number): number {
  return parseCurrencyStrict(value) ?? 0
}

/**
 * Reads an amount the way a person would, or refuses.
 *
 * Returns null for a blank cell or one that is not a number. Callers that take
 * amounts from uploads must use this rather than `parseCurrency`: turning an
 * unreadable cell into 0 once imported a receivable as fully paid.
 */
export function parseCurrencyStrict(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  // Strip ₹ symbol, commas, and whitespace
  const cleaned = value.replace(/[₹,\s]/g, '').trim()
  if (!cleaned) return null

  // Check for multiplier suffixes
  const match = cleaned.match(/^([+-]?\d+\.?\d*)\s*(cr|crore|l|lac|lakh|k|thousand)?$/i)
  if (!match) {
    const num = parseFloat(cleaned)
    // parseFloat("12abc") is 12; only accept a cell that is a number in full.
    return Number.isFinite(num) && /^[+-]?\d*\.?\d+$/.test(cleaned) ? num : null
  }

  const num = parseFloat(match[1])
  const suffix = (match[2] || '').toLowerCase()

  if (!Number.isFinite(num)) return null

  switch (suffix) {
    case 'cr':
    case 'crore':
      return num * 10000000
    case 'l':
    case 'lac':
    case 'lakh':
      return num * 100000
    case 'k':
    case 'thousand':
      return num * 1000
    default:
      return num
  }
}

/**
 * Formats a number as Indian Rupee currency string.
 * For large values, uses shorthand: ₹1.8L, ₹2.5Cr, ₹50K
 */
export function formatCurrency(value: number, shorthand = false): string {
  if (shorthand) {
    const abs = Math.abs(value)
    const sign = value < 0 ? '-' : ''
    if (abs >= 10000000) {
      return `${sign}₹${(abs / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`
    }
    if (abs >= 100000) {
      return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, '')}L`
    }
    if (abs >= 1000) {
      return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
  }
  /*
   * Whole rupees, except when that would print real money as nothing.
   *
   * A part-payment often leaves a few paise behind - the live file has ten
   * invoices sitting at 8 to 48 paise - and rounding those to "₹0" put rows on
   * screen that read as settled while still shouting "33 days overdue" in red.
   * A balance that is not zero must never look like zero; below half a rupee
   * the paise are shown instead.
   */
  const wouldVanish = value !== 0 && Math.abs(value) < 0.5

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: wouldVanish ? 2 : 0,
  }).format(value)
}

/**
 * Rupees and paise, always two decimals: ₹12,34,567.80.
 *
 * For the ageing columns, where an accountant ties each bucket to the ledger
 * and the columns must add up to the total on screen to the paisa. Whole-rupee
 * rounding would let five rounded buckets disagree with their rounded sum.
 */
export function formatCurrencyExact(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Formats a date for display.
 */
export function formatDate(date: Date | string, format: 'short' | 'long' | 'iso' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'

  switch (format) {
    case 'long':
      return d.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    case 'iso':
      return d.toISOString().split('T')[0]
    case 'short':
    default:
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
  }
}

/**
 * Returns a relative time string (e.g., "2 hours ago", "just now").
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(d, 'short')
}

/**
 * Generate initials from a full name.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Format a number as percentage.
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Delay utility for animations.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Formats a Date as YYYY-MM-DD in the *local* timezone.
 *
 * toISOString() converts to UTC first, which shifts the calendar day backwards
 * for any timezone ahead of UTC (IST is +5:30), so due dates and "today"
 * comparisons land a day early. Every date-only value must go through here.
 */
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Today's calendar date in the local timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  return toLocalISODate(new Date())
}

/** Parses a YYYY-MM-DD string as local midnight rather than UTC midnight. */
export function parseISODate(value: string): Date {
  // A date-only string is read as local midnight. A full timestamp (which an
  // import or a database can hand back) is read as that instant, so a due
  // date never turns into "Invalid Date" and silently drops out of a filter.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`)
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value)
  return new Date(`${value}T00:00:00`)
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD string, staying in local time. */
export function addDaysISO(isoDate: string, days: number): string {
  const date = parseISODate(isoDate)
  date.setDate(date.getDate() + days)
  return toLocalISODate(date)
}
