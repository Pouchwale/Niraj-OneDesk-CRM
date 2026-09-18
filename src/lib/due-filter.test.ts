import { describe, expect, it } from 'vitest'

import {
  AGEING_FILTER_PRESETS,
  DUE_FILTER_PRESETS,
  daysUntilDue,
  describeRange,
  formFromRange,
  isOverdueRange,
  matchesAgeingRange,
  matchesDueRange,
  rangeFromForm,
} from './due-filter'

const TODAY = '2026-09-06'
const preset = (id: string) => DUE_FILTER_PRESETS.find((p) => p.id === id)!

describe('daysUntilDue', () => {
  it('counts forward to a future date and backward past it', () => {
    expect(daysUntilDue('2026-09-13', TODAY)).toBe(7)
    expect(daysUntilDue('2026-09-06', TODAY)).toBe(0)
    expect(daysUntilDue('2026-08-07', TODAY)).toBe(-30)
  })

  it('copes with a due date that arrives as a timestamp', () => {
    // An import or a database can hand back "2026-09-13T00:00:00"; it must not
    // turn into "Invalid Date" and silently drop out of every filter.
    expect(daysUntilDue('2026-09-13T00:00:00', TODAY)).toBe(7)
    expect(matchesDueRange('2026-09-13T00:00:00', preset('next7'), TODAY)).toBe(true)
  })
})

describe('matchesDueRange', () => {
  it('applies the built-in windows', () => {
    expect(matchesDueRange('2026-09-06', preset('today'), TODAY)).toBe(true)
    expect(matchesDueRange('2026-09-07', preset('today'), TODAY)).toBe(false)

    expect(matchesDueRange('2026-09-13', preset('next7'), TODAY)).toBe(true)
    expect(matchesDueRange('2026-09-14', preset('next7'), TODAY)).toBe(false)
    // Already overdue is not "due in the next 7 days".
    expect(matchesDueRange('2026-09-05', preset('next7'), TODAY)).toBe(false)

    expect(matchesDueRange('2026-09-05', preset('overdue'), TODAY)).toBe(true)
    expect(matchesDueRange('2026-09-06', preset('overdue'), TODAY)).toBe(false)

    expect(matchesDueRange('2026-08-07', preset('overdue_1_30'), TODAY)).toBe(true)
    expect(matchesDueRange('2026-08-06', preset('overdue_1_30'), TODAY)).toBe(false)
    expect(matchesDueRange('2026-08-06', preset('overdue_31_60'), TODAY)).toBe(true)
    expect(matchesDueRange('2026-06-07', preset('overdue_90_plus'), TODAY)).toBe(true)
    expect(matchesDueRange('2026-06-08', preset('overdue_90_plus'), TODAY)).toBe(false)
  })

  it('never matches a record without a due date', () => {
    expect(matchesDueRange(null, preset('overdue'), TODAY)).toBe(false)
    expect(matchesDueRange('', { minDays: null, maxDays: null }, TODAY)).toBe(false)
  })
})

describe('ageing rows (bucketed)', () => {
  const gokul = { due_0_30: 0, due_31_60: 0, due_61_90: 200000, due_91_120: 285000, due_121_plus: 500000 }
  const meridian = { due_0_30: 0, due_31_60: 120000, due_61_90: 150000, due_91_120: 150000, due_121_plus: 0 }
  const ageing = (id: string) => AGEING_FILTER_PRESETS.find((p) => p.id === id)!

  it('reads the built-in windows off the buckets', () => {
    expect(matchesAgeingRange(gokul, ageing('age_121_plus'))).toBe(true)
    expect(matchesAgeingRange(meridian, ageing('age_121_plus'))).toBe(false)
    expect(matchesAgeingRange(meridian, ageing('age_31_60'))).toBe(true)
    expect(matchesAgeingRange(gokul, ageing('age_31_60'))).toBe(false)
    expect(matchesAgeingRange(gokul, ageing('age_90_plus'))).toBe(true)
    expect(matchesAgeingRange(meridian, ageing('age_90_plus'))).toBe(true)
    expect(matchesAgeingRange(meridian, ageing('age_0_30'))).toBe(false)
  })

  it('counts any bucket the custom range touches', () => {
    // 45–75 days touches 31–60 and 61–90.
    const range = rangeFromForm('overdue', 45, 75)
    expect(matchesAgeingRange(meridian, range)).toBe(true)
    expect(matchesAgeingRange(gokul, range)).toBe(true)
    // 1–20 days only touches 0–30, where neither has money.
    expect(matchesAgeingRange(gokul, rangeFromForm('overdue', 1, 20))).toBe(false)
    // "over 150 days" reaches only the open-ended bucket.
    expect(matchesAgeingRange(gokul, rangeFromForm('overdue', 150, null))).toBe(true)
    expect(matchesAgeingRange(meridian, rangeFromForm('overdue', 150, null))).toBe(false)
  })

  it('never matches a "due in" range: an ageing report has nothing not yet due', () => {
    expect(matchesAgeingRange(gokul, rangeFromForm('due', 0, 7))).toBe(false)
    expect(isOverdueRange(rangeFromForm('due', 0, 7))).toBe(false)
    expect(isOverdueRange(ageing('age_0_30'))).toBe(true)
  })
})

describe('custom ranges from the form', () => {
  it('reads "overdue by 30 to 60 days" as due 60 to 30 days ago', () => {
    const range = rangeFromForm('overdue', 30, 60)
    expect(range).toEqual({ minDays: -60, maxDays: -30 })
    expect(matchesDueRange('2026-08-07', range, TODAY)).toBe(true) // 30 days ago
    expect(matchesDueRange('2026-07-08', range, TODAY)).toBe(true) // 60 days ago
    expect(matchesDueRange('2026-08-08', range, TODAY)).toBe(false) // 29 days ago
  })

  it('treats "overdue by 0" as at least one day, so today never counts', () => {
    expect(rangeFromForm('overdue', 0, null)).toEqual({ minDays: null, maxDays: -1 })
  })

  it('reads "due in 3 to 10 days" directly', () => {
    expect(rangeFromForm('due', 3, 10)).toEqual({ minDays: 3, maxDays: 10 })
  })

  it('round-trips a range back into the form', () => {
    expect(formFromRange({ minDays: -60, maxDays: -30 })).toEqual({ mode: 'overdue', from: 30, to: 60 })
    expect(formFromRange({ minDays: null, maxDays: -91 })).toEqual({ mode: 'overdue', from: 91, to: null })
    expect(formFromRange({ minDays: 0, maxDays: 7 })).toEqual({ mode: 'due', from: 0, to: 7 })
  })

  it('describes ranges the way a person would say them', () => {
    expect(describeRange(preset('next7'))).toBe('Due in the next 7 days')
    expect(describeRange(preset('today'))).toBe('Due today')
    expect(describeRange(preset('overdue_31_60'))).toBe('Overdue 31–60 days')
    expect(describeRange(preset('overdue_90_plus'))).toBe('Overdue over 90 days')
    expect(describeRange(preset('overdue'))).toBe('Overdue (any)')
    expect(describeRange({ minDays: 3, maxDays: 10 })).toBe('Due in 3–10 days')
    expect(describeRange({ minDays: null, maxDays: -45 })).toBe('Overdue over 44 days')
  })
})
