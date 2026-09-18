/**
 * Transforming a saved day, and scoring two of them.
 *
 * The example that was checked with the team leader before this was built:
 * 20%; old day 0-30 ₹10L, 31-60 ₹5L, 61-90 ₹3L, 91-120 ₹2L, 121+ ₹4L; new day
 * 31-60 ₹4L, 61-90 ₹2L, 91-120 ₹1.5L, 121+ ₹3L. Targets ₹4L and ₹0.8L;
 * achievements ₹2.5L and ₹1L; points 31.25 and 50; KPI SCORE 81.25.
 */

import { describe, expect, it } from 'vitest'
import type { OverduePayment } from '@/lib/types'
import {
  DAY_COLUMNS,
  RESULT_COLUMNS,
  daySheet,
  rawDaySheet,
  resultSheet,
  scoreTwoDays,
  totalOfDay,
  transformOverdueDay,
} from './transform'

const L = 100000

const row = (over: Partial<OverduePayment> & { id: string }): OverduePayment => ({
  bp_code: over.id.toUpperCase(),
  customer_name: over.id,
  balance_due: 24 * L,
  due_0_30: 10 * L,
  due_31_60: 5 * L,
  due_61_90: 3 * L,
  due_91_120: 2 * L,
  due_121_plus: 4 * L,
  payment_terms: null,
  contact_person: null,
  contact_number: null,
  email: null,
  coordinator_name: 'Pragati',
  sales_person_name: null,
  department: null,
  account_type: null,
  followup_details: null,
  followup_timeline: null,
  assigned_coordinator_id: 'coord-1',
  status: 'overdue',
  extra_fields: {},
  imported_at: '2026-09-11',
  created_at: '2026-09-11',
  updated_at: '2026-09-11',
  ...over,
})

const names: Record<string, string> = { 'coord-1': 'Pragati', 'coord-9': 'Vishva' }
const nameOf = (id: string) => names[id] ?? id

describe('transforming a saved day', () => {
  it('fills the columns from the saved rows, with targets from the percentage', () => {
    const [pragati] = transformOverdueDay([row({ id: 'c1' })], 20, nameOf)

    expect(pragati.coordinatorName).toBe('Pragati')
    expect(pragati.balanceDue).toBe(24 * L)
    expect(pragati.due0to30).toBe(10 * L)
    expect(pragati.due121Plus).toBe(4 * L)
    // 20% of (0-30 + 31-60 + 61-90 + 91-120) = 20% of ₹20L
    expect(pragati.target0to120).toBe(4 * L)
    // 20% of 121+ = 20% of ₹4L
    expect(pragati.target121Plus).toBe(0.8 * L)
  })

  it('adds up every customer a coordinator carries', () => {
    const table = transformOverdueDay([row({ id: 'c1' }), row({ id: 'c2', due_121_plus: L, balance_due: 21 * L })], 20, nameOf)
    expect(table).toHaveLength(1)
    expect(table[0].balanceDue).toBe(45 * L)
    expect(table[0].due121Plus).toBe(5 * L)
  })

  it('gives each coordinator a line of their own, by name', () => {
    const table = transformOverdueDay([row({ id: 'c1' }), row({ id: 'c2', assigned_coordinator_id: 'coord-9' })], 20, nameOf)
    expect(table.map((t) => t.coordinatorName)).toEqual(['Pragati', 'Vishva'])
  })

  it('leaves out bankrupt, no follow-up, settled, and unassigned rows', () => {
    const table = transformOverdueDay(
      [
        row({ id: 'kept' }),
        row({ id: 'bankrupt', status: 'bankrupt', bankrupt_declared_at: '2026-09-10' }),
        row({ id: 'aside', no_followup_at: '2026-09-10' }),
        row({ id: 'settled', status: 'settled' }),
        row({ id: 'nobody', assigned_coordinator_id: null }),
      ],
      20,
      nameOf
    )
    expect(table).toHaveLength(1)
    expect(table[0].balanceDue).toBe(24 * L)
  })

  it('adds a Total line to the sheet', () => {
    const table = transformOverdueDay([row({ id: 'c1' }), row({ id: 'c2', assigned_coordinator_id: 'coord-9' })], 20, nameOf)
    expect(totalOfDay(table).balanceDue).toBe(48 * L)
    const sheet = daySheet(table)
    expect(sheet[0]).toEqual([...DAY_COLUMNS])
    expect(sheet.at(-1)?.[0]).toBe('Total')
    expect(sheet.at(-1)?.[7]).toBe(8 * L)
  })

  it('shows the newer day without its two target columns', () => {
    const sheet = daySheet(transformOverdueDay([row({ id: 'c1' })], 20, nameOf), false)
    expect(sheet[0]).toEqual([...DAY_COLUMNS.slice(0, 7)])
    expect(sheet[1]).toHaveLength(7)
  })
})

describe('scoring two days', () => {
  const oldDay = () => transformOverdueDay([row({ id: 'c1' })], 20, nameOf)
  const newDay = (over: Partial<OverduePayment> = {}) =>
    transformOverdueDay(
      [row({ id: 'c1', due_31_60: 4 * L, due_61_90: 2 * L, due_91_120: 1.5 * L, due_121_plus: 3 * L, ...over })],
      20,
      nameOf
    )

  it('gives the example that was checked: 81.25', () => {
    const { rows } = scoreTwoDays(oldDay(), newDay())
    expect(rows).toEqual([
      {
        coordinatorName: 'Pragati',
        target30to120: 4 * L,
        achieve30to120: 2.5 * L,
        target120Plus: 0.8 * L,
        achieve120Plus: 1 * L,
        kpiScore: 81.25,
      },
    ])
  })

  it("never uses the newer day's targets", () => {
    const withDifferentTargets = newDay().map((r) => ({ ...r, target0to120: 1, target121Plus: 1 }))
    expect(scoreTwoDays(oldDay(), withDifferentTargets).rows[0].kpiScore).toBe(81.25)
  })

  it('gives no points for a balance that grew', () => {
    const { rows } = scoreTwoDays(oldDay(), newDay({ due_31_60: 9 * L, due_121_plus: 6 * L }))
    expect(rows[0].achieve30to120).toBeLessThan(0)
    expect(rows[0].kpiScore).toBe(0)
  })

  it('caps each part at 50', () => {
    const { rows } = scoreTwoDays(oldDay(), newDay({ due_31_60: 0, due_61_90: 0, due_91_120: 0, due_121_plus: 0 }))
    expect(rows[0].kpiScore).toBe(100)
  })

  it('warns when nothing changed between the two days', () => {
    const { flags, rows } = scoreTwoDays(oldDay(), oldDay())
    expect(flags.some((f) => /nothing changed/.test(f))).toBe(true)
    expect(rows[0].kpiScore).toBe(0)
  })

  it('names a coordinator who is on only one of the two days', () => {
    const newer = [...newDay(), ...transformOverdueDay([row({ id: 'c9', assigned_coordinator_id: 'coord-9' })], 20, nameOf)]
    const { flags } = scoreTwoDays(oldDay(), newer)
    expect(flags.some((f) => /Vishva/.test(f))).toBe(true)
  })

  it('lays the result out in the sheet columns, with a Total line and no summed score', () => {
    const sheet = resultSheet(scoreTwoDays(oldDay(), newDay()).rows)
    expect(sheet[0]).toEqual([...RESULT_COLUMNS])
    expect(sheet.at(-1)).toEqual(['Total', 4 * L, 2.5 * L, 0.8 * L, 1 * L, null])
  })
})

describe('the full saved day as a sheet', () => {
  it('keeps every column, spreads the Excel extras, and totals the money', () => {
    const sheet = rawDaySheet([
      { id: 'o1', bp_code: 'C1', balance_due: 100, due_0_30: 60, extra_fields: { Region: 'West', bp_code: 'dup' } },
      { id: 'o2', bp_code: 'C2', balance_due: 50, due_0_30: 50, extra_fields: {} },
    ])
    expect(sheet[0]).toEqual(['id', 'bp_code', 'balance_due', 'due_0_30', 'Region', 'Excel: bp_code'])
    expect(sheet[1]).toEqual(['o1', 'C1', 100, 60, 'West', 'dup'])
    expect(sheet.at(-1)).toEqual(['Total', null, 150, 110, null, null])
  })
})
