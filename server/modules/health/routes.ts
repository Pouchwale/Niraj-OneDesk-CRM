/**
 * Liveness and readiness, which answer different questions.
 *
 * `health` asks "is this process alive", and a load balancer restarts the
 * container when it stops answering. `ready` asks "can it actually do its
 * job", listing what is wired up. Readiness reports rather than fails: an
 * unconfigured Excel book is a setup detail, not a reason to take the app out
 * of rotation while people are using the rest of it.
 */

import { Router } from 'express'
import { EXCEL_BOOKS, type HealthResponse, type ReadyResponse } from '../../../shared/api'
import type { ServerConfig } from '../../config'
import type { AiService } from '../ai/service'
import type { ExcelService } from '../excel/service'

export function healthRoutes(config: ServerConfig, ai: AiService, excel: ExcelService, version: string): Router {
  const router = Router()
  const startedAt = Date.now()

  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptime: Math.round((Date.now() - startedAt) / 1000),
      version,
    }
    res.json(body)
  })

  router.get('/ready', (_req, res) => {
    const aiStatus = ai.status()
    const checks: ReadyResponse['checks'] = [
      {
        name: 'assistant',
        ok: aiStatus.configured && !aiStatus.keyError,
        detail: !aiStatus.configured
          ? 'no key configured'
          : aiStatus.keyError ?? `${aiStatus.provider} · ${aiStatus.model}`,
      },
      ...EXCEL_BOOKS.map((book) => {
        const status = excel.status(book)
        return {
          name: `excel:${book}`,
          ok: status.configured ? status.exists : true,
          detail: status.configured ? status.error ?? status.name ?? '' : 'not connected',
        }
      }),
    ]

    if (config.unknownExcelKeys.length > 0) {
      checks.push({
        name: 'config',
        ok: false,
        detail: `unread settings, likely misspelled: ${config.unknownExcelKeys.join(', ')}`,
      })
    }

    const body: ReadyResponse = { ready: checks.every((check) => check.ok), checks }
    res.status(body.ready ? 200 : 503).json(body)
  })

  return router
}
