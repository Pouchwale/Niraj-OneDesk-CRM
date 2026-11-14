/**
 * Pre Sales Analysis over the wire (14 Nov 2026).
 *
 * The server reads the Pre-Sales-Order-CRM workbook itself (read again only
 * when it has been saved since) and sends each person only what they may see:
 * a coordinator gets the customers the CRM assigns to them (matched by
 * customer code against Active and Overdue Payments); the team leader and the
 * administrator get everyone, the customers with no CRM account included
 * (shown as "Not assigned"). A customer with no CRM account goes to the
 * coordinator named on its latest order in the file when that name matches
 * one CRM coordinator (match.ts). Follow-ups (which items, how, what the
 * customer said, when next) are kept in presales-followups.json beside the
 * score history.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Router } from 'express'
import { itemKeyOf, PRESALES_MODES, PRESALES_RESPONSES, type PresalesCustomer, type PresalesFollowup, type PresalesResponse } from '../../../shared/presales'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'
import type { ExcelBookConfig } from '../../config'
import type { ExcelService } from '../excel/service'
import { coordinatorMatcher } from './match'
import { readPresales, type PresalesRead } from './read'

export const PRESALES_FOLLOWUPS_FILE = 'presales-followups.json'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const dayOrNull = (v: unknown): string | null => (typeof v === 'string' && ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null)

interface Deps {
  excel: ExcelService
  config: ExcelBookConfig | undefined
  /** Customer code (upper case) → the CRM coordinator assigned to it. */
  assigned: () => Map<string, string | null>
  /** The CRM's coordinators, to match the file's coordinator names for customers with no CRM account. */
  coordinators: () => { id: string; name: string }[]
  snapshotDir: string
  logger: Logger
  now?: () => Date
}

const seesTeam = (role: string | undefined) => role === 'admin' || role === 'team_leader'

export function presalesRoutes(deps: Deps): Router {
  const router = Router()
  const now = deps.now ?? (() => new Date())
  let cache: { modifiedAt: string; read: PresalesRead; at: string } | null = null

  const load = (): { read: PresalesRead | null; error: string | null; readAt: string | null } => {
    const status = deps.excel.status('presales')
    if (!status.configured || !deps.config) return { read: null, error: null, readAt: null }
    if (!status.exists || !status.modifiedAt) return { read: null, error: status.error ?? 'The file is not there.', readAt: null }
    if (cache?.modifiedAt === status.modifiedAt) return { read: cache.read, error: null, readAt: cache.at }
    try {
      const read = readPresales(readFileSync(deps.config.path), deps.config.sheet)
      cache = { modifiedAt: status.modifiedAt, read, at: now().toISOString() }
      deps.logger.info('presales: workbook read', { lines: read.lines.length, skipped: read.skipped, sheet: read.sheet })
      return { read, error: null, readAt: cache.at }
    } catch (err) {
      // A save in progress can leave the file half written; the last good read stands.
      const message = err instanceof Error ? err.message : 'Could not read the workbook.'
      deps.logger.warn('presales: workbook not read', { error: message })
      return cache ? { read: cache.read, error: null, readAt: cache.at } : { read: null, error: message, readAt: null }
    }
  }

  const followupsPath = join(deps.snapshotDir, PRESALES_FOLLOWUPS_FILE)
  const readFollowups = (): PresalesFollowup[] => {
    if (!existsSync(followupsPath)) return []
    try {
      const parsed = JSON.parse(readFileSync(followupsPath, 'utf8')) as { followups?: PresalesFollowup[] }
      return Array.isArray(parsed.followups) ? parsed.followups : []
    } catch {
      return []
    }
  }
  const writeFollowups = (followups: PresalesFollowup[]) => {
    mkdirSync(deps.snapshotDir, { recursive: true })
    writeFileSync(`${followupsPath}.tmp`, JSON.stringify({ version: 1, followups }))
    renameSync(`${followupsPath}.tmp`, followupsPath)
  }

  /** Whose customer each code is: the CRM account's coordinator, else the file's name when it matches one coordinator. */
  const ownerOf = (read: PresalesRead) => {
    const assigned = deps.assigned()
    const match = coordinatorMatcher(deps.coordinators())
    return (code: string): { id: string | null; from: 'crm' | 'file' | null } => {
      const crm = assigned.get(code)
      if (crm) return { id: crm, from: 'crm' }
      const byName = match(read.fileCoordinator.get(code))
      return byName ? { id: byName, from: 'file' } : { id: null, from: null }
    }
  }

  router.get('/', (req, res, next) => {
    try {
      const user = req.user!
      const status = deps.excel.status('presales')
      const { read, error, readAt } = load()
      const team = seesTeam(user.role)
      const customers: PresalesCustomer[] = []
      if (read) {
        const owner = ownerOf(read)
        const codes = new Set(read.lines.map((l) => l.c))
        for (const code of codes) {
          const o = owner(code)
          if (!team && o.id !== user.id) continue
          customers.push({ code, name: read.names.get(code) ?? code, coordinatorId: o.id, assignedFrom: o.from, fileCoordinator: read.fileCoordinator.get(code) ?? null })
        }
      }
      const shown = new Set(customers.map((c) => c.code))
      const body: PresalesResponse = {
        file: { configured: status.configured, name: status.name, modifiedAt: status.modifiedAt, error: error ?? (status.configured ? status.error : null) },
        readAt,
        customers,
        lines: read ? read.lines.filter((l) => shown.has(l.c)) : [],
        followups: readFollowups().filter((f) => shown.has(f.customerCode)),
        skipped: read?.skipped ?? 0,
      }
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  /** Just the file's save time, for the page to notice a new save cheaply. */
  router.get('/status', (_req, res) => {
    const status = deps.excel.status('presales')
    res.json({ configured: status.configured, modifiedAt: status.modifiedAt })
  })

  router.post('/followups', (req, res, next) => {
    try {
      const user = req.user!
      const body = (req.body ?? {}) as Record<string, unknown>
      const code = String(body.customerCode ?? '').trim().toUpperCase()
      const { read } = load()
      const lines = read ? read.lines.filter((l) => l.c === code) : []
      if (!code || !read || !lines.length) {
        next(ApiError.badRequest('That customer is not in the Pre-Sales file.'))
        return
      }
      if (!seesTeam(user.role) && ownerOf(read)(code).id !== user.id) {
        next(ApiError.forbidden('You can only follow up your own customers.'))
        return
      }
      const known = new Set(lines.map(itemKeyOf))
      const items = [...new Set((Array.isArray(body.items) ? body.items : []).map((i) => String(i)))].filter((i) => known.has(i))
      if (!items.length) {
        next(ApiError.badRequest('Tick at least one of the customer’s items.'))
        return
      }
      const mode = PRESALES_MODES.find((m) => m.id === body.mode)?.id
      const response = PRESALES_RESPONSES.find((r) => r.id === body.response)?.id
      if (!mode || !response) {
        next(ApiError.badRequest('Choose how you reached them and what they said.'))
        return
      }
      const said = typeof body.said === 'string' ? body.said.trim().slice(0, 1000) : ''
      if (said.length < 3) {
        next(ApiError.badRequest('Write what the customer said.'))
        return
      }
      const expectedOrderDate = response === 'order_expected' ? dayOrNull(body.expectedOrderDate) : null
      if (response === 'order_expected' && !expectedOrderDate) {
        next(ApiError.badRequest('Give the date the order is expected.'))
        return
      }
      const followup: PresalesFollowup = {
        id: randomUUID(),
        customerCode: code,
        items,
        at: now().toISOString(),
        by: user.id,
        byName: user.full_name || user.username,
        mode,
        response,
        said,
        expectedOrderDate,
        nextDate: dayOrNull(body.nextDate),
      }
      writeFollowups([...readFollowups(), followup])
      deps.logger.info('presales: follow-up logged', { customer: code, items: items.length, response, by: user.id })
      res.json(followup)
    } catch (err) {
      next(err)
    }
  })

  return router
}
