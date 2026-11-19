/**
 * A coordinator's Robi score starting afresh (user's rule, 19 Nov 2026):
 * every day before the start date is N/A (not scored, left out of the week
 * and the Final score), and the first day's list carries nothing over from
 * before it.
 */

/** The first day scored, by coordinator id. */
export const ROBI_FRESH_START: Readonly<Record<string, string>> = {
  // Avani Patel: N/A up to 19 Nov 2026, scored from 20 Nov 2026 with a clean list.
  'coord-11': '2026-11-20',
}

/** True for a day before the coordinator's fresh start: not scored. */
export function beforeFreshStart(userId: string, date: string, starts: Readonly<Record<string, string>> = ROBI_FRESH_START): boolean {
  const from = starts[userId]
  return from !== undefined && date < from
}

/** The items of a plan for `date` without work carried from before the coordinator's fresh start. */
export function withoutCarryBeforeFreshStart<T extends { carriedFrom?: string }>(
  userId: string,
  date: string,
  items: T[],
  starts: Readonly<Record<string, string>> = ROBI_FRESH_START
): T[] {
  const from = starts[userId]
  if (from === undefined || date < from) return items
  return items.filter((item) => !item.carriedFrom || item.carriedFrom >= from)
}

/** Takes the days before each coordinator's fresh start out of a score map keyed `${userId}|${date}`. */
export function dropBeforeFreshStart<V>(scores: Map<string, V>, starts: Readonly<Record<string, string>> = ROBI_FRESH_START): Map<string, V> {
  for (const key of [...scores.keys()]) {
    const bar = key.indexOf('|')
    if (beforeFreshStart(key.slice(0, bar), key.slice(bar + 1), starts)) scores.delete(key)
  }
  return scores
}
