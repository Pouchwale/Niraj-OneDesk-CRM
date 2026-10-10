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
import type { AiChatEvent, AiChatRequest, AiProvider, AiStatusResponse } from '../../../shared/api'
import type { AiConfig } from '../../config'
import { ApiError } from '../../http/errors'
import type { Logger } from '../../logger'

export type EventSink = (event: AiChatEvent) => void

export type KeyCheck = 'accepted' | 'rejected' | 'unknown' | 'unconfigured'

export interface AiService {
  status(): AiStatusResponse
  /** Streams one reply. Resolves when the reply is complete or has failed. */
  stream(body: AiChatRequest, sink: EventSink, signal: AbortSignal): Promise<void>
  /**
   * Asks the provider whether it takes the key, and says so in the log. A
   * key that is present but refused used to show "AI on" to everyone while
   * every question quietly fell back to the rules.
   */
  verify(): Promise<KeyCheck>
  /** Swaps in new settings, so a replaced key works without a restart. */
  reconfigure(config: AiConfig): void
}

export interface AiServiceDeps {
  fetch?: typeof fetch
  /** Injected in tests so no network is touched. */
  anthropic?: Pick<Anthropic, 'beta'>
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * Groq retires model names faster than a deployment cycle, so a configured
 * model that no longer exists falls back to the next known-good one rather
 * than leaving the assistant silent.
 */
const GROQ_FALLBACKS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile']

/**
 * Robi answers about real money and real people, so it is run cold. At the
 * provider's default (1.0) gpt-4o-mini invented a customer, "UiU", with a
 * promise of ₹35 lakh that exists nowhere in the data. Reasoning models
 * (o-series, gpt-5) refuse the setting, so it is only sent where it is taken.
 */
export function factualSampling(model: string): { temperature?: number } {
  return /^(o\d|gpt-5)/i.test(model) ? {} : { temperature: 0.2 }
}

/** Listing models is free on all three, so it is how a key gets checked. */
const MODELS_URL: Record<AiProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  openai: 'https://api.openai.com/v1/models',
}

const PROVIDER_LABEL: Record<AiProvider, string> = { anthropic: 'Claude', groq: 'Groq', openai: 'OpenAI' }
const KEY_NAME: Record<AiProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
}

export const NO_KEY_MESSAGE =
  'No assistant key is configured. Set OPENAI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY in .env.local.'

/** The one failure that will not fix itself: the provider does not take the key. */
export function describeRejectedKey(provider: AiProvider): string {
  return `The ${PROVIDER_LABEL[provider]} API key was rejected. Put a working key in ${KEY_NAME[provider]} in .env.local; the server picks it up without a restart.`
}

/** A message a person can act on, for each way a call can fail. */
export function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return describeRejectedKey('anthropic')
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
  if (status === 401) return describeRejectedKey('groq')
  if (status === 429) return 'The Groq API is rate-limiting requests. Try again in a moment.'
  return fromBody || `The Groq API returned an error (${status}).`
}

export function describeOpenAiError(status: number, fromBody?: string): string {
  if (status === 401) return describeRejectedKey('openai')
  if (status === 429) return 'The OpenAI API is rate-limiting requests or quota is exceeded. Check your OpenAI account.'
  if (status === 404) return 'The configured OpenAI model was not found. Check AI_MODEL.'
  return fromBody || `The OpenAI API returned an error (${status}).`
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

export function createAiService(initial: AiConfig, logger: Logger, deps: AiServiceDeps = {}): AiService {
  const doFetch = deps.fetch ?? fetch
  let config = initial
  /** What the provider last said about the current key; any good reply clears it. */
  let keyError: string | null = null
  let anthropic: Pick<Anthropic, 'beta'> | null = deps.anthropic ?? null

  const anthropicClient = (): Pick<Anthropic, 'beta'> => {
    if (!anthropic) anthropic = new Anthropic({ apiKey: config.apiKey })
    return anthropic
  }

  /** A call that started on a key since replaced has no say about the new one. */
  const noteKey = (used: AiConfig, error: string | null) => {
    if (used === config) keyError = error
  }

  const streamGroq = async (cfg: AiConfig, body: AiChatRequest, sink: EventSink, signal: AbortSignal): Promise<void> => {
    const messages = toGroqMessages(body)
    const candidates = [cfg.model, ...GROQ_FALLBACKS].filter(
      (model, index, all) => Boolean(model) && all.indexOf(model) === index
    )

    let response: Response | null = null
    let model = cfg.model

    for (const candidate of candidates) {
      const attempt = await doFetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: candidate, messages, max_tokens: cfg.maxTokens, stream: true, ...factualSampling(candidate) }),
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
      const status = response?.status ?? 0
      if (status === 401) noteKey(cfg, describeGroqError(401))
      logger.warn('assistant call failed', { provider: 'groq', status, err: detail })
      sink({ type: 'error', message: describeGroqError(status, detail) })
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

    noteKey(cfg, null)
    sink({ type: 'done', stop_reason: finishReason, model, refused: false })
  }

  const streamOpenAi = async (cfg: AiConfig, body: AiChatRequest, sink: EventSink, signal: AbortSignal): Promise<void> => {
    const messages = toGroqMessages(body)
    const model = cfg.model

    const response = await doFetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: cfg.maxTokens, stream: true, ...factualSampling(model) }),
      signal,
    })

    if (!response.ok) {
      const detail = await response
        .json()
        .then((data) => (data as { error?: { message?: string } }).error?.message ?? '')
        .catch(() => '')
      if (response.status === 401) noteKey(cfg, describeOpenAiError(401))
      // Until now a refused key reached the coordinator but never this log.
      logger.warn('assistant call failed', { provider: 'openai', status: response.status, err: detail })
      sink({ type: 'error', message: describeOpenAiError(response.status, detail) })
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

    noteKey(cfg, null)
    sink({ type: 'done', stop_reason: finishReason, model, refused: false })
  }

  const streamAnthropic = async (cfg: AiConfig, body: AiChatRequest, sink: EventSink, signal: AbortSignal): Promise<void> => {
    const stream = anthropicClient().beta.messages.stream({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      // A safety decline is re-run server-side on the recommended model
      // rather than leaving the person with no answer at all.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: cfg.effort },
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
    noteKey(cfg, null)
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
      keyError: config.apiKey ? keyError : null,
    }),

    async stream(body, sink, signal) {
      const cfg = config
      if (!cfg.apiKey || !cfg.provider) throw ApiError.notConfigured(NO_KEY_MESSAGE)

      try {
        if (cfg.provider === 'openai') await streamOpenAi(cfg, body, sink, signal)
        else if (cfg.provider === 'groq') await streamGroq(cfg, body, sink, signal)
        else await streamAnthropic(cfg, body, sink, signal)
      } catch (err) {
        if (signal.aborted) return
        if (err instanceof Anthropic.AuthenticationError) noteKey(cfg, describeRejectedKey('anthropic'))
        const message =
          cfg.provider === 'anthropic'
            ? describeAnthropicError(err)
            : err instanceof Error
              ? err.message
              : 'Something went wrong while asking the assistant.'
        logger.error('assistant call failed', { provider: cfg.provider, err: message })
        sink({ type: 'error', message })
      }
    },

    async verify() {
      const cfg = config
      if (!cfg.apiKey || !cfg.provider) return 'unconfigured'
      const label = PROVIDER_LABEL[cfg.provider]
      const headers: Record<string, string> =
        cfg.provider === 'anthropic'
          ? { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }
          : { Authorization: `Bearer ${cfg.apiKey}` }

      try {
        const res = await doFetch(MODELS_URL[cfg.provider], { headers, signal: AbortSignal.timeout(15_000) })
        // Replaced while this was in flight: the check of the newer key decides.
        if (cfg !== config) return 'unknown'
        if (res.status === 401) {
          noteKey(cfg, describeRejectedKey(cfg.provider))
          logger.error(`assistant: ${label} rejected the API key; Robi answers from the rules until it is replaced`, {
            setting: KEY_NAME[cfg.provider],
          })
          return 'rejected'
        }
        if (res.ok) {
          noteKey(cfg, null)
          logger.info(`assistant: ${label} accepted the API key`)
          return 'accepted'
        }
        logger.warn(`assistant: could not confirm the ${label} key`, { status: res.status })
        return 'unknown'
      } catch (err) {
        // No internet says nothing about the key, so it is not marked bad.
        logger.warn(`assistant: could not reach ${label} to check the key`, {
          err: err instanceof Error ? err.message : String(err),
        })
        return 'unknown'
      }
    },

    reconfigure(next) {
      config = next
      keyError = null
      // The client holds the old key.
      anthropic = deps.anthropic ?? null
    },
  }
}
