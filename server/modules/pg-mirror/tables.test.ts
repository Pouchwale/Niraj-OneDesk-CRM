import { describe, expect, it } from 'vitest'

import { TABLES, createTableSql, toSql } from './tables'

describe('the PostgreSQL copy', () => {
  it('turns CRM values into what each column type takes, and odd values into null', () => {
    expect(toSql('date', '2026-10-14T09:30:00')).toBe('2026-10-14')
    expect(toSql('date', 'not a date')).toBeNull()
    expect(toSql('numeric', '1,23,456.5')).toBe(123456.5)
    expect(toSql('numeric', 'abc')).toBeNull()
    expect(toSql('integer', 4.6)).toBe(5)
    expect(toSql('timestamptz', '2026-10-14T04:00:00.000Z')).toBe('2026-10-14T04:00:00.000Z')
    expect(toSql('timestamptz', 'garbage')).toBeNull()
    expect(toSql('text', '')).toBeNull()
    expect(toSql('jsonb', { a: 1 })).toBe('{"a":1}')
  })

  it('never copies a password hash into users', () => {
    const users = TABLES.find((t) => t.spec.name === 'users')!
    expect(users.spec.columns.map((c) => c.name)).not.toContain('passwordHash')
    expect(users.spec.columns.some((c) => c.name === 'data')).toBe(false)
  })

  it('flattens each plan into one row per task, with how it ended', () => {
    const items = TABLES.find((t) => t.spec.name === 'daily_plan_items')!
    const rows = items.rows({
      store: {
        dailyPlans: [
          {
            userId: 'coord-1', date: '2026-10-13', createdAt: 'x', skipped: ['t2'], proofTaskIds: ['t1'],
            outcome: { t1: 'done' },
            items: [
              { taskId: 't1', kind: 'stale_contact', message: '', entityType: 'company', entityId: 'c1' },
              { taskId: 't2', kind: 'overdue_followup', message: '', entityType: 'overdue_payment', entityId: 'o1', carriedFrom: '2026-10-12' },
            ],
          },
        ],
      } as never,
      users: [],
      kpiDays: [],
      kpiResults: [],
    })
    expect(rows).toEqual([
      expect.objectContaining({ task_id: 't1', proof_check: true, skipped: false, outcome: 'done' }),
      expect.objectContaining({ task_id: 't2', proof_check: false, skipped: true, carried_from: '2026-10-12' }),
    ])
  })

  it('makes each table with its key and a sync time', () => {
    const sql = createTableSql(TABLES.find((t) => t.spec.name === 'attendance')!.spec)
    expect(sql).toContain('PRIMARY KEY (user_id, att_date)')
    expect(sql).toContain('synced_at timestamptz NOT NULL DEFAULT now()')
  })
})
