/**
 * Talking to the model provider.
 *
 * The service knows nothing about HTTP: it takes a request and emits events
 * to a sink. That keeps the streaming logic testable without a socket, and
 * means the two providers differ in one file rather than across the server.
 *
 * The API key never leaves this process. The browser sends a prompt to our
 * own origin and gets words back; it has no idea which provider answered or
 * what the key is.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AiChatEvent, AiChatRequest, AiStatusResponse } from '../../../shared/api'
import type { AiConfig } from '../../config'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'

export type EventSink = (event: AiChatEvent) => void

export interface AiService {
  status(): AiStatusResponse
  /** Streams one reply. Resolves when the reply is complete or has failed. */
  stream(body: AiChatRequest, sink: EventSink, signal: AbortSignal): Promise<void>
}

export interface AiServiceDeps {
  fetch?: typeof fetch
  /** Injected in tests so no network is touched. */
  anthropic?: Pick<Anthropic, 'beta'>
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Groq retires model names faster than a deployment cycle, so a configured
 * model that no longer exists falls back to the next known-good one rather
 * than leaving the assistant silent.
 */
const GROQ_FALLBACKS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile']

/** A message a person can act on, for each way a call can fail. */
export function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'The Claude API key was rejected. Check ANTHROPIC_API_KEY and restart the server.'
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'The Claude API key does not have permission for this model.'
  }
  if (err instanceof Anthropic.NotFoundError) {
    return 'The configured model was not found. Check AI_MODEL.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'The Claude API is rate-limiting requests. Try again in a moment.'
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the Claude API. Check this machine\'s internet connection.'
  }
  if (err instanceof Anthropic.APIError) {
    return `The Claude API returned an error (${err.status ?? 'unknown'}): ${err.message}`
  }
  return err instanceof Error ? err.message : 'Something went wrong while asking the assistant.'
}

export function describeGroqError(status: number, fromBody?: string): string {
  if (status === 401) return 'The Groq API key was rejected. Check GROQ_API_KEY and restart the server.'
  if (status === 429) return 'The Groq API is rate-limiting requests. Try again in a moment.'
  return fromBody || `The Groq API returned an error (${status}).`
}

/** Groq speaks the OpenAI shape: one system message, then the turns. */
export function toGroqMessages(body: AiChatRequest): { role: string; content: string }[] {
  const system = [body.system, body.context].filter((part) => part && part.trim()).join('\n\n')
  return [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...body.messages.map((turn) => ({ role: turn.role, content: turn.content })),
  ]
}

/** Pulls text deltas out of one OpenAI-style SSE data payload. */
export function readGroqChunk(data: string): { text?: string; finishReason?: string } {
  try {
    const parsed = JSON.parse(data) as {
      choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
    }
    const choice = parsed.choices?.[0]
    return {
      text: choice?.delta?.content || undefined,
      finishReason: choice?.finish_reason ? (choice.finish_reason === 'stop' ? 'end_turn' : choice.finish_reason) : undefined,
    }
  } catch {
    // A partial chunk: the next read completes it.
    return {}
  }
}

export function createAiService(config: AiConfig, logger: Logger, deps: AiServiceDeps = {}): AiService {
  const doFetch = deps.fetch ?? fetch
  let anthropic: Pick<Anthropic, 'beta'> | null = deps.anthropic ?? null

  const anthropicClient = (): Pick<Anthropic, 'beta'> => {
    if (!anthropic) anthropic = new Anthropic({ apiKey: config.apiKey })
    return anthropic
  }

  const streamGroq = async (body: AiChatRequest, sink: EventSink, signal: AbortSignal): Promise<void> => {
    const messages = toGroqMessages(body)
    const candidates = [config.model, ...GROQ_FALLBACKS].filter(
      (model, index, all) => Boolean(model) && all.indexOf(model) === index
    )

    let response: Response | null = null
    let model = config.model

    for (const candidate of candidates) {
      const attempt = await doFetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: candidate, messages, max_tokens: config.maxTokens, stream: true }),
        signal,
      })

      // Only a "no such model" is worth retrying elsewhere; a bad key is not.
      if (!attempt.ok && (attempt.status === 404 || attempt.status === 400)) {
        const detail = await attempt
          .clone()
          .json()
          .then((data) => (data as { error?: { message?: string } }).error?.message ?? '')
          .catch(() => '')
        if (/does not exist|access/i.test(detail)) {
          logger.warn('model unavailable, trying the next one', { model: candidate })
          continue
        }
      }

      response = attempt
      model = candidate
      break
    }

    if (!response || !response.ok) {
      const detail = response
        ? await response
            .json()
            .then((data) => (data as { error?: { message?: string } }).error?.message ?? '')
            .catch(() => '')
        : ''
      sink({ type: 'error', message: describeGroqError(response?.status ?? 0, detail) })
      return
    }
    if (!response.body) {
      sink({ type: 'error', message: 'The assistant service sent no reply.' })
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let finishReason = 'end_turn'

    const consume = (block: string) => {
      const line = block.trim()
      if (!line.startsWith('data:')) return
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return
      const { text, finishReason: reason } = readGroqChunk(data)
      if (text) sink({ type: 'text', text })
      if (reason) finishReason = reason
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(consume)
    }
    consume(buffer)

    sink({ type: 'done', stop_reason: finishReason, model, refused: false })
  }

  const streamAnthropic = async (body: AiChatRequest, sink: EventSink, signal: AbortSignal): Promise<void> => {
    const stream = anthropicClient().beta.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens,
      // A safety decline is re-run server-side on the recommended model
      // rather than leaving the person with no answer at all.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: config.effort },
      system: [
        // The persona is stable, so it is worth caching between questions.
        { type: 'text', text: body.system, cache_control: { type: 'ephemeral' } },
        ...(body.context.trim() ? [{ type: 'text' as const, text: body.context }] : []),
      ],
      messages: body.messages.map((turn) => ({ role: turn.role, content: turn.content })),
    })

    signal.addEventListener('abort', () => stream.abort(), { once: true })
    stream.on('text', (text) => sink({ type: 'text', text }))

    const final = await stream.finalMessage()
    sink({
      type: 'done',
      stop_reason: final.stop_reason ?? undefined,
      model: final.model,
      // A refusal on the final message means the whole chain declined.
      refused: final.stop_reason === 'refusal',
    })
  }

  return {
    status: () => ({
      configured: Boolean(config.apiKey),
      provider: config.apiKey ? config.provider : null,
      model: config.apiKey ? config.model : null,
    }),

    async stream(body, sink, signal) {
      if (!config.apiKey || !config.provider) {
        throw ApiError.notConfigured(
          'No assistant key is configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY and restart the server.'
        )
      }

      try {
        if (config.provider === 'groq') await streamGroq(body, sink, signal)
        else await streamAnthropic(body, sink, signal)
      } catch (err) {
        if (signal.aborted) return
        const message = config.provider === 'groq'
          ? err instanceof Error
            ? err.message
            : 'Something went wrong while asking the assistant.'
          : describeAnthropicError(err)
        logger.error('assistant call failed', { provider: config.provider, err: message })
        sink({ type: 'error', message })
      }
    },
  }
}
