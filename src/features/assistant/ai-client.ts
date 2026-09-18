/**
 * The browser's side of Robi's replies.
 *
 * It never holds a key. It asks the same-origin API whether one is configured,
 * posts a ready-made prompt, and reads the reply back as server-sent events so
 * the words appear as they are written. Which provider answered, and with what
 * key, is the server's business and never reaches this file.
 */

import type { AiChatEvent, AiChatRequest, AiStatusResponse } from '@shared/api'
import { ROUTES } from '@shared/api'
import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client'

export type AiStatus = AiStatusResponse
export type AiEvent = AiChatEvent
export type { AiChatRequest }

export interface AiReply {
  text: string
  refused: boolean
  model?: string
}

const OFFLINE: AiStatus = { configured: false, provider: null, model: null }

let statusPromise: Promise<AiStatus> | null = null

/** Whether replies will come from a model. Asked once and remembered. */
export function getAiStatus(): Promise<AiStatus> {
  if (!statusPromise) {
    statusPromise = apiGet<AiStatusResponse>(ROUTES.aiStatus)
      .then((data) => ({
        configured: Boolean(data.configured),
        provider: data.provider ?? null,
        model: data.model ?? null,
      }))
      // No key, or no server: Robi falls back to the rules, which always work.
      .catch(() => OFFLINE)
  }
  return statusPromise
}

/**
 * Splits a buffer of server-sent events into the complete events it holds
 * and the unfinished tail to keep for the next chunk.
 */
export function parseSseEvents(buffer: string): { events: AiEvent[]; rest: string } {
  const events: AiEvent[] = []
  const normalised = buffer.replace(/\r\n/g, '\n')
  const boundary = normalised.lastIndexOf('\n\n')
  if (boundary === -1) return { events, rest: normalised }

  const complete = normalised.slice(0, boundary)
  const rest = normalised.slice(boundary + 2)

  for (const block of complete.split('\n\n')) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!data) continue
    try {
      const parsed = JSON.parse(data) as AiEvent
      if (parsed && typeof parsed === 'object' && 'type' in parsed) events.push(parsed)
    } catch {
      // A malformed event is dropped rather than breaking the reply.
    }
  }
  return { events, rest }
}

/**
 * Sends the prompt and streams the reply. `onText` is called with each piece
 * as it arrives; the returned promise resolves with the whole reply.
 */
export async function streamAiReply(
  request: AiChatRequest,
  onText: (delta: string) => void,
  signal?: AbortSignal
): Promise<AiReply> {
  let res: Response
  try {
    res = await apiPost(ROUTES.aiChat, request, { signal })
  } catch (err) {
    // The server already wrote a message meant for the person reading it.
    throw err instanceof ApiRequestError ? new Error(err.message) : err
  }
  if (!res.body) throw new Error('The assistant service sent no reply.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let refused = false
  let model: string | undefined

  const handle = (event: AiEvent) => {
    if (event.type === 'text') {
      text += event.text
      onText(event.text)
    } else if (event.type === 'done') {
      refused = Boolean(event.refused)
      model = event.model
    } else if (event.type === 'error') {
      throw new Error(event.message)
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSseEvents(buffer)
    buffer = rest
    for (const event of events) handle(event)
  }
  // Anything left without a trailing blank line is still one event.
  const tail = parseSseEvents(`${buffer}\n\n`)
  for (const event of tail.events) handle(event)

  return { text, refused, model }
}
