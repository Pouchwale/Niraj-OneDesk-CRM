/**
 * The PostgreSQL copy of the CRM: which tables, which columns, and how each
 * row is read from the working data. Every table has a few typed columns for
 * querying and reporting, and `data`, the whole record as it is in the CRM, so
 * nothing is lost when the CRM grows a field these columns do not name.
 *
 * Password hashes never leave the account store: `users` is the public view.
 */

import type { PersistedStore } from '../../../src/lib/demo-companies'
import type { AuthUser } from '../../../shared/auth'
import type { OverdueSnapshotMeta, ScoreResult } from '../../../shared/snapshots'

export type ColumnType = 'text' | 'numeric' | 'integer' | 'boolean' | 'date' | 'timestamptz' | 'jsonb'

export interface Column {
  name: string
  type: ColumnType
  get: (row: Record<string, unknown>) => unknown
}

export interface TableSpec {
  name: string
  /** Primary-key columns. */
  key: string[]
  columns: Column[]
}

/** What the copy is made from. */
export interface MirrorSource {
  store: PersistedStore
  users: AuthUser[]
  kpiDays: (OverdueSnapshotMeta & { table?: unknown })[]
  kpiResults: ScoreResult[]
}

type Row = Record<string, unknown>
const f = (key: string) => (r: Row) => r[key]
const col = (name: string, type: ColumnType, get: (r: Row) => unknown = f(name)): Column => ({ name, type, get })
const data = col('data', 'jsonb', (r) => r)

/** How a customer was set aside, if at all: no_followup, dispute, export or bankrupt. */
const setAside = (r: Row) =>
  r.bankrupt_declared_at ? 'bankrupt' : r.no_followup_at ? (r.no_followup_kind as string | null) ?? 'no_followup' : null
const setAsideAt = (r: Row) => r.bankrupt_declared_at ?? r.no_followup_at ?? null

export const TABLES: { spec: TableSpec; rows: (s: MirrorSource) => Row[] }[] = [
  {
    spec: {
      name: 'companies',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('bp_code', 'text', f('sap_bp_code')),
        col('name', 'text'),
        col('invoice_no', 'text'),
        col('invoice_date', 'date'),
        col('due_date', 'date'),
        col('total_amount', 'numeric'),
        col('status', 'text'),
        col('payment_terms', 'text'),
        col('coordinator_id', 'text', f('assigned_coordinator_id')),
        col('coordinator_name', 'text'),
        col('set_aside', 'text', setAside),
        col('set_aside_at', 'timestamptz', setAsideAt),
        col('updated_at', 'timestamptz'),
        data,
      ],
    },
    rows: (s) => s.store.companies as unknown as Row[],
  },
  {
    spec: {
      name: 'overdue_payments',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('bp_code', 'text'),
        col('customer_name', 'text'),
        col('balance_due', 'numeric'),
        col('due_0_30', 'numeric'),
        col('due_31_60', 'numeric'),
        col('due_61_90', 'numeric'),
        col('due_91_120', 'numeric'),
        col('due_121_plus', 'numeric'),
        col('status', 'text'),
        col('coordinator_id', 'text', f('assigned_coordinator_id')),
        col('coordinator_name', 'text'),
        col('set_aside', 'text', setAside),
        col('set_aside_at', 'timestamptz', setAsideAt),
        col('imported_at', 'timestamptz'),
        data,
      ],
    },
    rows: (s) => s.store.overduePayments as unknown as Row[],
  },
  {
    spec: {
      name: 'followups',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('entity_type', 'text'),
        col('entity_id', 'text'),
        col('coordinator_id', 'text'),
        col('followup_date', 'timestamptz'),
        col('mode', 'text'),
        col('status', 'text'),
        col('customer_response', 'text'),
        col('notes', 'text'),
        col('committed_date', 'date'),
        col('committed_amount', 'numeric'),
        col('next_reminder_date', 'date'),
        col('created_at', 'timestamptz'),
        col('edited_at', 'timestamptz'),
        data,
      ],
    },
    rows: (s) => s.store.followups as unknown as Row[],
  },
  {
    spec: {
      name: 'daily_plans',
      key: ['user_id', 'plan_date'],
      columns: [
        col('user_id', 'text', f('userId')),
        col('plan_date', 'date', f('date')),
        col('created_at', 'timestamptz', f('createdAt')),
        col('item_count', 'integer', (r) => (r.items as unknown[] | undefined)?.length ?? 0),
        col('closed_at', 'timestamptz', f('closedAt')),
        data,
      ],
    },
    rows: (s) => (s.store.dailyPlans ?? []) as unknown as Row[],
  },
  {
    spec: {
      name: 'daily_plan_items',
      key: ['user_id', 'plan_date', 'task_id'],
      columns: [
        col('user_id', 'text'),
        col('plan_date', 'date'),
        col('task_id', 'text'),
        col('kind', 'text'),
        col('entity_type', 'text'),
        col('entity_id', 'text'),
        col('entity_name', 'text'),
        col('amount', 'numeric'),
        col('carried_from', 'date'),
        col('skipped', 'boolean'),
        col('proof_check', 'boolean'),
        col('outcome', 'text'),
      ],
    },
    rows: (s) => {
      const out: Row[] = []
      const seen = new Set<string>()
      for (const plan of s.store.dailyPlans ?? []) {
        const skipped = new Set(plan.skipped ?? [])
        const proofs = new Set(plan.proofTaskIds ?? [])
        for (const item of plan.items) {
          // One row per task: a plan that somehow lists one twice keeps the first.
          const key = `${plan.userId}|${plan.date}|${item.taskId}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({
            user_id: plan.userId,
            plan_date: plan.date,
            task_id: item.taskId,
            kind: item.kind,
            entity_type: item.entityType ?? null,
            entity_id: item.entityId ?? null,
            entity_name: item.entityName ?? null,
            amount: item.amount ?? null,
            carried_from: item.carriedFrom ?? null,
            skipped: skipped.has(item.taskId),
            proof_check: proofs.has(item.taskId),
            outcome: plan.outcome?.[item.taskId] ?? null,
          })
        }
      }
      return out
    },
  },
  {
    spec: {
      name: 'proof_requests',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('coordinator_id', 'text', f('coordinatorId')),
        col('plan_date', 'date', f('date')),
        col('entity_type', 'text', f('entityType')),
        col('entity_id', 'text', f('entityId')),
        col('entity_name', 'text', f('entityName')),
        col('status', 'text'),
        col('requested_at', 'timestamptz', f('requestedAt')),
        col('submitted_at', 'timestamptz', f('submittedAt')),
        col('reviewed_by', 'text', f('reviewedBy')),
        col('reviewed_at', 'timestamptz', f('reviewedAt')),
        col('file_url', 'text', f('fileUrl')),
        data,
      ],
    },
    rows: (s) => (s.store.proofRequests ?? []) as unknown as Row[],
  },
  {
    spec: {
      name: 'decision_requests',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('kind', 'text'),
        col('entity_type', 'text', f('entityType')),
        col('entity_id', 'text', f('entityId')),
        col('bp_code', 'text', f('bpCode')),
        col('customer_name', 'text', f('name')),
        col('amount', 'numeric'),
        col('reason', 'text'),
        col('requested_by', 'text', f('requestedBy')),
        col('requested_at', 'timestamptz', f('requestedAt')),
        col('status', 'text'),
        col('reviewed_by', 'text', f('reviewedBy')),
        col('reviewed_at', 'timestamptz', f('reviewedAt')),
        col('review_note', 'text', f('reviewNote')),
      ],
    },
    rows: (s) => (s.store.decisionRequests ?? []) as unknown as Row[],
  },
  {
    spec: {
      name: 'attendance',
      key: ['user_id', 'att_date'],
      columns: [
        col('user_id', 'text', f('userId')),
        col('att_date', 'date', f('date')),
        col('status', 'text'),
        col('marked_by', 'text', f('by')),
        col('marked_at', 'timestamptz', f('at')),
      ],
    },
    rows: (s) => (s.store.attendance ?? []) as unknown as Row[],
  },
  {
    spec: {
      name: 'rfd_rows',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('customer_name', 'text'),
        col('bp_code', 'text'),
        col('coordinator_id', 'text', f('assigned_coordinator_id')),
        col('sales_order', 'text'),
        col('production_order', 'text'),
        col('item_code', 'text'),
        col('item_name', 'text'),
        col('rfd_value', 'numeric'),
        col('paid', 'numeric', (r) => Number(r.paid_1 ?? 0) + Number(r.paid_2 ?? 0)),
        col('pending_value', 'numeric'),
        col('ready_since', 'date'),
        col('days_waiting', 'integer', f('days')),
        data,
      ],
    },
    rows: (s) => (s.store.rfdRows ?? []) as unknown as Row[],
  },
  {
    spec: {
      name: 'quotations',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('quotation_no', 'text'),
        col('quotation_date', 'date'),
        col('inquiry_date', 'date'),
        col('coordinator_id', 'text'),
        col('coordinator_name', 'text'),
        col('customer_name', 'text'),
        col('concern_person', 'text'),
        col('source', 'text'),
        col('sales_employee', 'text'),
        col('customer_type', 'text'),
        col('status', 'text'),
        col('amount', 'numeric'),
        col('closing_date', 'date'),
        col('lost_remark', 'text'),
        col('followup_count', 'integer', (r) => Number(r.earlier_followups ?? 0) + ((r.followups as unknown[] | undefined)?.length ?? 0)),
        col('created_at', 'timestamptz'),
        col('updated_at', 'timestamptz'),
        data,
      ],
    },
    rows: (s) => (s.store.quotations ?? []) as unknown as Row[],
  },
  {
    spec: {
      name: 'messages',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('from_user_id', 'text', f('fromUserId')),
        col('to_coordinator_id', 'text', f('toCoordinatorId')),
        col('subject', 'text'),
        col('message', 'text'),
        col('created_at', 'timestamptz', f('createdAt')),
        data,
      ],
    },
    rows: (s) => (s.store.messages ?? []) as unknown as Row[],
  },
  {
    spec: {
      name: 'audit_log',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('actor_id', 'text'),
        col('action', 'text'),
        col('entity_type', 'text'),
        col('entity_id', 'text'),
        col('created_at', 'timestamptz'),
        data,
      ],
    },
    rows: (s) => s.store.auditLog as unknown as Row[],
  },
  {
    spec: {
      name: 'users',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('username', 'text'),
        col('full_name', 'text'),
        col('role', 'text'),
        col('module', 'text'),
        col('email', 'text'),
        col('created_at', 'timestamptz'),
        col('updated_at', 'timestamptz'),
      ],
    },
    // The public view only: no password hash ever reaches this table.
    rows: (s) => s.users as unknown as Row[],
  },
  {
    spec: {
      name: 'kpi_saved_days',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('saved_at', 'timestamptz', f('savedAt')),
        col('saved_by', 'text', f('savedBy')),
        col('saved_by_name', 'text', f('savedByName')),
        col('percentage', 'numeric'),
        col('row_count', 'integer', f('rowCount')),
        col('coordinator_count', 'integer', f('coordinatorCount')),
        col('total_balance', 'numeric', f('totalBalance')),
        col('coordinator_table', 'jsonb', f('table')),
      ],
    },
    rows: (s) => s.kpiDays as unknown as Row[],
  },
  {
    spec: {
      name: 'kpi_results',
      key: ['id'],
      columns: [
        col('id', 'text'),
        col('generated_at', 'timestamptz', f('generatedAt')),
        col('generated_by', 'text', f('generatedBy')),
        col('old_day_id', 'text', f('oldId')),
        col('new_day_id', 'text', f('newId')),
        col('scores', 'jsonb', f('rows')),
        data,
      ],
    },
    rows: (s) => s.kpiResults as unknown as Row[],
  },
]

/* ===================== Values ===================== */

const DATE = /^(\d{4})-(\d{2})-(\d{2})/

/** A value as PostgreSQL should receive it for that column, or null. */
export function toSql(type: ColumnType, value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null
  switch (type) {
    case 'text':
      return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)
    case 'numeric':
    case 'integer': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
      if (!Number.isFinite(n)) return null
      return type === 'integer' ? Math.round(n) : n
    }
    case 'boolean':
      return Boolean(value)
    case 'date': {
      const m = DATE.exec(String(value))
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null
    }
    case 'timestamptz': {
      const t = Date.parse(String(value))
      return Number.isNaN(t) ? null : new Date(t).toISOString()
    }
    case 'jsonb':
      return JSON.stringify(value)
  }
}

export function createTableSql(spec: TableSpec): string {
  const cols = spec.columns.map((c) => `  ${c.name} ${c.type}${spec.key.includes(c.name) ? ' NOT NULL' : ''}`)
  cols.push('  synced_at timestamptz NOT NULL DEFAULT now()')
  return `CREATE TABLE IF NOT EXISTS ${spec.name} (\n${cols.join(',\n')},\n  PRIMARY KEY (${spec.key.join(', ')})\n)`
}
