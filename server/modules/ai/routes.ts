/**
 * The assistant's two routes.
 *
 * `status` is what the browser asks on load to know whether replies come from
 * a model or from the rules. `chat` streams one answer as server-sent events.
 */

import { Router } from 'express'
import { z } from 'zod'
import type { AiChatEvent } from '../../../shared/api'
import { ApiError } from '../../http/errors'
import { NO_KEY_MESSAGE, type AiService } from './service'

/**
 * What the browser is allowed to send.
 *
 * The caps are not arbitrary: a prompt is billed by the token, so an unbounded
 * body is an unbounded bill as well as a slow request.
 */
export const chatBodySchema = z.object({
  system: z.string().trim().min(1, 'A system prompt is required.').max(20_000),
  context: z.string().max(120_000).default(''),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(20_000),
      })
    )
    .min(1, 'At least one message is required.')
    .max(40)
    .refine((turns) => turns.length === 0 || turns[0].role === 'user', { message: 'The first turn must be from the user.' })
    .refine((turns) => turns.length === 0 || turns[turns.length - 1].role === 'user', {
      message: 'The last turn must be from the user.',
    }),
})

/** One server-sent event. */
export function sseLine(event: AiChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function aiRoutes(service: AiService): Router {
  const router = Router()

  router.get('/status', (_req, res) => {
    res.json(service.status())
  })

  router.post('/chat', async (req, res, next) => {
    const parsed = chatBodySchema.safeParse(req.body)
    if (!parsed.success) {
      next(ApiError.badRequest(parsed.error.issues[0]?.message ?? 'That request could not be read.'))
      return
    }

    // Anything that could fail before the stream opens must fail now: once
    // headers are out, the only way to report a problem is inside the stream.
    if (!service.status().configured) {
      next(ApiError.notConfigured(NO_KEY_MESSAGE))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Proxies buffer by default, which would hold the whole answer back.
      'X-Accel-Buffering': 'no',
    })

    // A closed tab should stop the model mid-sentence rather than run up a
    // bill answering nobody.
    const controller = new AbortController()
    req.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    try {
      await service.stream(parsed.data, (event) => res.write(sseLine(event)), controller.signal)
    } finally {
      res.end()
    }
  })

  return router
}
