/**
 * Keeps a PostgreSQL copy of the CRM in step with the working data (since
 * 14 Oct 2026). store.json stays the CRM's own store; this is a live copy for
 * reports, other tools and a second place the data lives.
 *
 * Every few seconds: if anything changed, each table whose rows changed is
 * rewritten in one transaction, so a reader never sees half an update. A
 * database that is down or refuses is logged and retried; the CRM never waits
 * for it and never fails because of it.
 */

import { createHash } from 'node:crypto'
import pg from 'pg'
import type { Logger } from '../../logger'
import { TABLES, createTableSql, toSql, type MirrorSource, type TableSpec } from './tables'

export interface MirrorDeps {
  databaseUrl: string
  /** Everything to copy, read fresh each time. */
  source: () => MirrorSource
  /** Changes when anything in the source may have changed; cheap to call. */
  signature: () => string
  logger: Logger
  intervalMs?: number
}

export interface MirrorStatus {
  connected: boolean
  lastSyncAt: string | null
  lastError: string | null
  tables: Record<string, number>
}

/** Rows per INSERT: well under PostgreSQL's 65,535 parameters. */
const BATCH = 400

const hashOf = (value: unknown) => createHash('sha1').update(JSON.stringify(value)).digest('hex')

async function ensureSchema(client: pg.PoolClient): Promise<void> {
  for (const { spec } of TABLES) {
    await client.query(createTableSql(spec))
    // A column added to a table after it was first made.
    for (const c of spec.columns) await client.query(`ALTER TABLE ${spec.name} ADD COLUMN IF NOT EXISTS ${c.name} ${c.type}`)
  }
  await client.query(`CREATE TABLE IF NOT EXISTS sync_status (
  table_name text PRIMARY KEY,
  row_count integer NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
)`)
}

async function rewrite(client: pg.PoolClient, spec: TableSpec, rows: Record<string, unknown>[]): Promise<number> {
  await client.query(`DELETE FROM ${spec.name}`)
  const names = spec.columns.map((c) => c.name)
  const keyOf = (values: unknown[]) => spec.key.map((k) => String(values[names.indexOf(k)])).join('|')
  const seen = new Set<string>()
  const prepared: unknown[][] = []
  for (const row of rows) {
    const values = spec.columns.map((c) => toSql(c.type, c.get(row)))
    // A record with no key, or the same key twice, cannot go into a keyed table.
    if (spec.key.some((k) => values[names.indexOf(k)] === null)) continue
    const k = keyOf(values)
    if (seen.has(k)) continue
    seen.add(k)
    prepared.push(values)
  }
  for (let i = 0; i < prepared.length; i += BATCH) {
    const chunk = prepared.slice(i, i + BATCH)
    const params: unknown[] = []
    const tuples = chunk.map((values) =>
      `(${values
        .map((v, j) => {
          params.push(v)
          return `$${params.length}${spec.columns[j].type === 'jsonb' ? '::jsonb' : ''}`
        })
        .join(', ')})`
    )
    await client.query(`INSERT INTO ${spec.name} (${names.join(', ')}) VALUES ${tuples.join(', ')}`, params)
  }
  await client.query(
    `INSERT INTO sync_status (table_name, row_count, synced_at) VALUES ($1, $2, now())
     ON CONFLICT (table_name) DO UPDATE SET row_count = EXCLUDED.row_count, synced_at = now()`,
    [spec.name, prepared.length]
  )
  return prepared.length
}

export function startPgMirror(deps: MirrorDeps): { status: () => MirrorStatus; stop: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: deps.databaseUrl, max: 2, connectionTimeoutMillis: 5_000 })
  // An idle connection dropped by the server must not take the CRM down with it.
  pool.on('error', (err) => deps.logger.warn('postgres: idle connection error', { error: err.message }))

  const status: MirrorStatus = { connected: false, lastSyncAt: null, lastError: null, tables: {} }
  const hashes = new Map<string, string>()
  let schemaReady = false
  let lastSignature = ''
  let busy = false
  let warned = false

  const tick = async () => {
    if (busy) return
    const signature = deps.signature()
    if (schemaReady && signature === lastSignature) return
    busy = true
    let client: pg.PoolClient | null = null
    try {
      client = await pool.connect()
      if (!schemaReady) {
        await ensureSchema(client)
        schemaReady = true
        deps.logger.info('postgres: copy connected, tables ready')
      }
      const source = deps.source()
      const changed = TABLES.map((t) => ({ ...t, data: t.rows(source) }))
        .map((t) => ({ ...t, hash: hashOf(t.data) }))
        .filter((t) => hashes.get(t.spec.name) !== t.hash)
      if (changed.length > 0) {
        await client.query('BEGIN')
        try {
          for (const t of changed) status.tables[t.spec.name] = await rewrite(client, t.spec, t.data)
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw err
        }
        for (const t of changed) hashes.set(t.spec.name, t.hash)
        deps.logger.info('postgres: copy updated', { tables: changed.map((t) => t.spec.name).join(', ') })
      }
      lastSignature = signature
      status.connected = true
      status.lastSyncAt = new Date().toISOString()
      status.lastError = null
      warned = false
    } catch (err) {
      status.connected = false
      status.lastError = err instanceof Error ? err.message : String(err)
      // Said once until it recovers, not every few seconds.
      if (!warned) deps.logger.warn('postgres: copy not updated; will retry', { error: status.lastError })
      warned = true
    } finally {
      client?.release()
      busy = false
    }
  }

  const timer = setInterval(() => void tick(), deps.intervalMs ?? 5_000)
  timer.unref?.()
  void tick()

  return {
    status: () => ({ ...status, tables: { ...status.tables } }),
    stop: async () => {
      clearInterval(timer)
      await pool.end().catch(() => undefined)
    },
  }
}
