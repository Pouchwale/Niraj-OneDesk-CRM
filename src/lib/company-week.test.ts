import { describe, expect, it } from 'vitest'

import { weekDays, weekStart as robiWeekStart } from '@/features/assistant/scores'
import { weekStartOf as trendsWeekStart } from './ageing-trend'
import { weekStartOf as otifWeekStart } from './otif-live'
import { addDays, periodRange, weekOf as finalScoreWeekStart } from './score-history'
import { weekEnd as leadsWeekEnd, weekStart as leadsWeekStart } from './self-leads'

/**
 * The company's week runs Saturday to Friday (the user's rule, 7 Nov 2026).
 * Five screens each have their own helper for it; every one must give the
 * same Saturday for every day, or two screens would disagree about a week.
 */
describe('the company week, Saturday to Friday, everywhere', () => {
  const days: string[] = []
  for (let d = '2025-01-01'; d <= '2027-12-31'; d = addDays(d, 1)) days.push(d)

  it('every screen starts every day’s week on the same Saturday, at most six days back', () => {
    for (const day of days) {
      const start = finalScoreWeekStart(day)
      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(6) // a Saturday
      expect(start <= day && addDays(start, 6) >= day).toBe(true) // the day is inside its Saturday-to-Friday week
      expect(robiWeekStart(day)).toBe(start) // Robi's scores, the PDF report's "This week"
      expect(leadsWeekStart(day)).toBe(start) // Self Leads, weekly by team
      expect(trendsWeekStart(`${day}T12:00:00`)).toBe(start) // Overdue Payments → Trends
      expect(otifWeekStart(day)).toBe(start) // OTIF Analytics
    }
  })

  it('every week ends on the Friday after its Saturday', () => {
    for (const day of days.filter((d) => finalScoreWeekStart(d) === d)) {
      expect(periodRange('week', day).end).toBe(addDays(day, 6))
      expect(leadsWeekEnd(day)).toBe(addDays(day, 6))
      expect(new Date(`${addDays(day, 6)}T00:00:00Z`).getUTCDay()).toBe(5) // a Friday
    }
  })

  it('Robi’s working days are the Saturday and Monday to Friday, never the Sunday', () => {
    for (const start of days.filter((d) => finalScoreWeekStart(d) === d).slice(0, 60)) {
      const working = weekDays(start)
      expect(working).toHaveLength(6)
      expect(working.map((d) => new Date(`${d}T00:00:00Z`).getUTCDay())).toEqual([6, 1, 2, 3, 4, 5])
      expect(working.every((d) => finalScoreWeekStart(d) === start)).toBe(true)
    }
  })
})
