/**
 * Turning a saved day into Niki's sheet, and two of them into the score.
 *
 * Transform: one line per coordinator — the sums of their Overdue balances and
 * ageing buckets, and two targets taken from one percentage:
 *   0 to 120 Days Collection target = % × (0-30 + 31-60 + 61-90 + 91-120)
 *   121+ Days Target               = % × 121+
 * Left out of the sums: customers marked bankrupt or no follow-up, settled
 * rows, and rows with no coordinator.
 *
 * Score: the existing Collection KPI calculation, unchanged, so the figures are
 * the ones her Excel formula gives. Only the old day's targets are used.
 */

import type { OverduePayment } from '@/lib/types'
import { isSetAside } from '@/lib/no-followup'
import { calculateCollectionsKpi, type KpiInputRow } from '@/features/collections-kpi/kpi-calculator'
import type { ScoreRow, SnapshotTableRow } from '@shared/snapshots'

/** The column names of the transformed day, exactly as Niki's sheet has them. */
export const DAY_COLUMNS = [
  'Coordinator Name',
  'SUM of Balance Due',
  'SUM of 0 - 30',
  'SUM of 31 - 60',
  'SUM of 61 - 90',
  'SUM of 91 - 120',
  'SUM of 121+',
  '0 to 120 Days Collection target',
  '121+ Days Target',
] as const

/** The same, without the two targets: how the newer day of a comparison is shown. */
export const DAY_COLUMNS_WITHOUT_TARGETS = DAY_COLUMNS.slice(0, 7)

/** The column names of the result, exactly as Niki's sheet has them. */
export const RESULT_COLUMNS = [
  'COORDINATOR NAME',
  'TARGET 30 - 120 DAYS',
  'Achive 30-120 DAYS',
  'TARGET 120 + DAYS',
  'Achive 120 + DAYS',
  'KPI SCORE',
] as const

const round2 = (value: number) => Math.round(value * 100) / 100

function amount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Whether an Overdue row belongs in the sums. */
export function countsTowardsScore(row: OverduePayment): boolean {
  return row.status !== 'settled' && !isSetAside(row) && Boolean(row.assigned_coordinator_id)
}

/**
 * One saved day, one line per coordinator.
 *
 * Grouped by the coordinator the system assigns — the person the Overdue
 * screen shows — so the same coordinator written two ways in the Excel file
 * is still one line.
 */
export function transformOverdueDay(
  rows: OverduePayment[],
  percentage: number,
  nameOf: (coordinatorId: string) => string
): SnapshotTableRow[] {
  const byCoordinator = new Map<string, SnapshotTableRow>()

  for (const row of rows) {
    if (!countsTowardsScore(row)) continue
    const id = row.assigned_coordinator_id as string
    let line = byCoordinator.get(id)
    if (!line) {
      line = {
        coordinatorId: id,
        coordinatorName: nameOf(id),
        balanceDue: 0,
        due0to30: 0,
        due31to60: 0,
        due61to90: 0,
        due91to120: 0,
        due121Plus: 0,
        target0to120: 0,
        target121Plus: 0,
      }
      byCoordinator.set(id, line)
    }
    line.balanceDue += amount(row.balance_due)
    line.due0to30 += amount(row.due_0_30)
    line.due31to60 += amount(row.due_31_60)
    line.due61to90 += amount(row.due_61_90)
    line.due91to120 += amount(row.due_91_120)
    line.due121Plus += amount(row.due_121_plus)
  }

  const share = percentage / 100
  return [...byCoordinator.values()]
    .map((line) => ({
      ...line,
      balanceDue: round2(line.balanceDue),
      due0to30: round2(line.due0to30),
      due31to60: round2(line.due31to60),
      due61to90: round2(line.due61to90),
      due91to120: round2(line.due91to120),
      due121Plus: round2(line.due121Plus),
      target0to120: round2((line.due0to30 + line.due31to60 + line.due61to90 + line.due91to120) * share),
      target121Plus: round2(line.due121Plus * share),
    }))
    .sort((a, b) => a.coordinatorName.localeCompare(b.coordinatorName))
}

/** The Total line of a transformed day. */
export function totalOfDay(table: SnapshotTableRow[]): Omit<SnapshotTableRow, 'coordinatorId' | 'coordinatorName'> {
  const sum = (pick: (row: SnapshotTableRow) => number) => round2(table.reduce((t, row) => t + pick(row), 0))
  return {
    balanceDue: sum((r) => r.balanceDue),
    due0to30: sum((r) => r.due0to30),
    due31to60: sum((r) => r.due31to60),
    due61to90: sum((r) => r.due61to90),
    due91to120: sum((r) => r.due91to120),
    due121Plus: sum((r) => r.due121Plus),
    target0to120: sum((r) => r.target0to120),
    target121Plus: sum((r) => r.target121Plus),
  }
}

export interface ScoreOutcome {
  rows: ScoreRow[]
  flags: string[]
}

/**
 * The score for every coordinator, from an older day and a newer one.
 *
 * Handed straight to the existing Collection KPI calculation:
 *   Achive 30-120 = old (31-60 + 61-90 + 91-120) − new (the same three)
 *   Achive 120+   = old 121+ − new 121+
 *   each part     = MIN(1, MAX(0, Achive ÷ Target)) × 50
 *   KPI SCORE     = the two parts added
 * The newer day's targets are not passed in, so they cannot be used.
 */
export function scoreTwoDays(oldTable: SnapshotTableRow[], newTable: SnapshotTableRow[]): ScoreOutcome {
  const flags: string[] = []

  const balances = (table: SnapshotTableRow[]) =>
    JSON.stringify(
      table
        .map((r) => [r.coordinatorId, r.due31to60, r.due61to90, r.due91to120, r.due121Plus])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    )
  if (oldTable.length > 0 && balances(oldTable) === balances(newTable)) {
    flags.push('The two days hold the same balances for every coordinator — nothing changed between them, so every achievement is zero.')
  }

  const input = (row: SnapshotTableRow, withTargets: boolean): KpiInputRow => ({
    Coordinator: row.coordinatorName,
    'Balance Due': row.balanceDue,
    '0-30': row.due0to30,
    '31-60': row.due31to60,
    '61-90': row.due61to90,
    '91-120': row.due91to120,
    '121+': row.due121Plus,
    ...(withTargets ? { 'Target 0-120': row.target0to120, '121+ Target': row.target121Plus } : {}),
  })

  const outcome = calculateCollectionsKpi(
    oldTable.map((row) => input(row, true)),
    newTable.map((row) => input(row, false))
  )

  return {
    rows: outcome.results.map((r) => ({
      coordinatorName: r.Coordinator,
      target30to120: round2(r.Target_30_120),
      achieve30to120: round2(r.Achievement_30_120),
      target120Plus: round2(r.Target_121_Plus),
      achieve120Plus: round2(r.Achievement_121_Plus),
      kpiScore: r.KPI_Score,
    })),
    flags: [...flags, ...outcome.flags],
  }
}

/* ===================== Sheets for download ===================== */

type Cell = string | number | null

/** A transformed day as sheet rows: the header, one line per coordinator, and Total. */
export function daySheet(table: SnapshotTableRow[], withTargets = true): Cell[][] {
  const cells = (name: string, r: Omit<SnapshotTableRow, 'coordinatorId' | 'coordinatorName'>): Cell[] => {
    const base: Cell[] = [name, r.balanceDue, r.due0to30, r.due31to60, r.due61to90, r.due91to120, r.due121Plus]
    return withTargets ? [...base, r.target0to120, r.target121Plus] : base
  }
  return [
    [...(withTargets ? DAY_COLUMNS : DAY_COLUMNS_WITHOUT_TARGETS)],
    ...table.map((row) => cells(row.coordinatorName, row)),
    cells('Total', totalOfDay(table)),
  ]
}

/**
 * The result as sheet rows, with a Total line. The Total line adds up the
 * targets and achievements; it leaves KPI SCORE empty, because adding
 * coordinators' scores together does not give a score.
 */
export function resultSheet(rows: ScoreRow[]): Cell[][] {
  const sum = (pick: (row: ScoreRow) => number) => round2(rows.reduce((t, row) => t + pick(row), 0))
  return [
    [...RESULT_COLUMNS],
    ...rows.map((r) => [r.coordinatorName, r.target30to120, r.achieve30to120, r.target120Plus, r.achieve120Plus, r.kpiScore]),
    ['Total', sum((r) => r.target30to120), sum((r) => r.achieve30to120), sum((r) => r.target120Plus), sum((r) => r.achieve120Plus), null],
  ]
}

const RAW_NUMBERS = ['balance_due', 'due_0_30', 'due_31_60', 'due_61_90', 'due_91_120', 'due_121_plus']

/**
 * Every row of a saved day, with every detail, as sheet rows. The Excel file's
 * own extra columns are spread out as columns of their own, and the money
 * columns get a Total line.
 */
export function rawDaySheet(rows: Record<string, unknown>[]): Cell[][] {
  const columns: string[] = []
  const extraColumns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'extra_fields' && !columns.includes(key)) columns.push(key)
    }
    const extra = row.extra_fields
    if (extra && typeof extra === 'object') {
      for (const key of Object.keys(extra as Record<string, unknown>)) {
        if (!extraColumns.includes(key)) extraColumns.push(key)
      }
    }
  }
  const extraHeader = (key: string) => (columns.includes(key) ? `Excel: ${key}` : key)
  const cell = (value: unknown): Cell => {
    if (value === null || value === undefined) return null
    if (typeof value === 'number' || typeof value === 'string') return value
    if (typeof value === 'boolean') return value ? 'yes' : 'no'
    return JSON.stringify(value)
  }

  const body = rows.map((row) => {
    const extra = (row.extra_fields ?? {}) as Record<string, unknown>
    return [...columns.map((key) => cell(row[key])), ...extraColumns.map((key) => cell(extra[key]))]
  })
  const total: Cell[] = [
    ...columns.map((key, index) =>
      index === 0 ? 'Total' : RAW_NUMBERS.includes(key) ? round2(rows.reduce((t, row) => t + amount(row[key]), 0)) : null
    ),
    ...extraColumns.map(() => null),
  ]
  return [[...columns, ...extraColumns.map(extraHeader)], ...body, total]
}
