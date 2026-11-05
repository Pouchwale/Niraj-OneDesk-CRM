/**
 * Reading dates from the team's old Google Sheets, for one-off imports.
 *
 * Text is MM/DD/YYYY (DD/MM when the first part is over 12; stray spaces as in
 * "04/13 /2026" are ignored). An Excel date cell was sometimes typed day-first
 * and read month-first, so one with a day of 12 or less could be either way
 * round; the sheet's rows are in rough date order, which settles it.
 */

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => {
  if (!(y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null
}
const dayNumber = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000

/** The dates a sheet cell could mean, the plain reading first. */
export function sheetDateCandidates(value: unknown): string[] {
  if (typeof value === 'number' && Number.isFinite(value) && value > 30000) {
    const t = new Date(Math.round((value - 25569) * 86_400_000))
    const y = t.getUTCFullYear()
    const m = t.getUTCMonth() + 1
    const d = t.getUTCDate()
    const asIs = iso(y, m, d)
    const swapped = d <= 12 && d !== m ? iso(y, d, m) : null
    return [asIs, swapped].filter((x): x is string => Boolean(x))
  }
  const m = String(value ?? '').replace(/\s+/g, '').match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (!m) return []
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = a > 12 ? iso(y, b, a) : iso(y, a, b)
  return date ? [date] : []
}

/** Of the readings, the one nearest the anchor; a date after today only if nothing else fits. */
export function pickDate(candidates: string[], anchor: string | null, today: string): string | null {
  if (candidates.length === 0) return null
  const sensible = candidates.filter((c) => c <= today)
  const pool = sensible.length ? sensible : candidates
  if (!anchor || pool.length === 1) return pool[0]
  return [...pool].sort((x, y) => Math.abs(dayNumber(x) - dayNumber(anchor)) - Math.abs(dayNumber(y) - dayNumber(anchor)))[0]
}

/**
 * Each row's date, read by its neighbours: an ambiguous one takes the reading
 * nearer the middle of the clear dates within `reach` rows either side.
 */
export function datesByNeighbours(options: string[][], today: string, reach = 6): (string | null)[] {
  return options.map((own, i) => {
    const near = options
      .slice(Math.max(0, i - reach), i + reach + 1)
      .filter((o, j) => o.length === 1 && j !== Math.min(i, reach))
      .map((o) => o[0])
      .sort()
    return pickDate(own, near.length ? near[Math.floor(near.length / 2)] : null, today)
  })
}

/** Days from one yyyy-mm-dd to another (to minus from). */
export function daysBetween(from: string, to: string): number {
  return Math.round(dayNumber(to) - dayNumber(from))
}
