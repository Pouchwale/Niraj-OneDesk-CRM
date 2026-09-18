import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import type { AiChatEvent, AiChatRequest } from '../../../shared/api'
import { resolveAi } from '../../config'
import { createLogger } from '../../logger'
import { ApiError } from '../../http/errors'
import { createAiService, describeGroqError, readGroqChunk, toGroqMessages } from './service'

const quiet = createLogger({ level: 'error', write: () => undefined })
const body: AiChatRequest = { system: 'Robi', context: '', messages: [{ role: 'user', content: 'Hi' }] }

function sink() {
  const events: AiChatEvent[] = []
  return { events, push: (event: AiChatEvent) => events.push(event) }
}

/** The smallest stand-in for the SDK's message stream. */
function fakeStream(deltas: string[], stopReason = 'end_turn', fail?: Error) {
  const emitter = new EventEmitter()
  return {
    on: (event: string, handler: (text: string) => void) => {
      emitter.on(event, handler)
      return emitter
    },
    abort: () => undefined,
    finalMessage: async () => {
      if (fail) throw fail
      for (const delta of deltas) emitter.emit('text', delta)
      return { stop_reason: stopReason, model: 'claude-opus-5' }
    },
  }
}

const anthropicWith = (stream: unknown) => ({ beta: { messages: { stream: () => stream } } }) as never

function groqStream(chunks: string[], status = 200) {
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return async () => new Response(readable, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('status', () => {
  it('says nothing is configured when there is no key', () => {
    const service = createAiService(resolveAi({}), quiet)
    expect(service.status()).toEqual({ configured: false, provider: null, model: null })
  })

  it('names the provider and model in use, never the key', () => {
    const service = createAiService(resolveAi({ GROQ_API_KEY: 'gsk_secret' }), quiet)
    const status = service.status()
    expect(status).toEqual({ configured: true, provider: 'groq', model: 'openai/gpt-oss-120b' })
    expect(JSON.stringify(status)).not.toContain('gsk_secret')
  })
})

describe('stream, on Anthropic', () => {
  const config = resolveAi({ ANTHROPIC_API_KEY: 'sk-ant-test' })

  it('relays each text delta and then a done event', async () => {
    const out = sink()
    const service = createAiService(config, quiet, { anthropic: anthropicWith(fakeStream(['Hel', 'lo'])) })
    await service.stream(body, out.push, new AbortController().signal)

    expect(out.events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done', stop_reason: 'end_turn', model: 'claude-opus-5', refused: false },
    ])
  })

  it('flags a refusal so the browser can fall back to the rules', async () => {
    const out = sink()
    const service = createAiService(config, quiet, { anthropic: anthropicWith(fakeStream([], 'refusal')) })
    await service.stream(body, out.push, new AbortController().signal)
    expect(out.events.at(-1)).toMatchObject({ type: 'done', refused: true })
  })

  it('turns a failure into one error event rather than throwing at the route', async () => {
    const out = sink()
    const service = createAiService(config, quiet, {
      anthropic: anthropicWith(fakeStream([], 'end_turn', new Error('network down'))),
    })
    await service.stream(body, out.push, new AbortController().signal)
    expect(out.events).toEqual([{ type: 'error', message: 'network down' }])
  })

  it('says nothing at all once the caller has gone away', async () => {
    const controller = new AbortController()
    controller.abort()
    const out = sink()
    const service = createAiService(config, quiet, {
      anthropic: anthropicWith(fakeStream([], 'end_turn', new Error('aborted'))),
    })
    await service.stream(body, out.push, controller.signal)
    expect(out.events).toEqual([])
  })
})

describe('stream, on Groq', () => {
  const config = resolveAi({ GROQ_API_KEY: 'gsk_mock' })

  it('reads the OpenAI-shaped stream and closes with a done event', async () => {
    const out = sink()
    const service = createAiService(config, quiet, {
      fetch: groqStream([
        'data: {"choices":[{"delta":{"content":"Hi "},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{"content":"there!"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]) as never,
    })

    await service.stream(body, out.push, new AbortController().signal)
    expect(out.events).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'text', text: 'there!' },
      { type: 'done', stop_reason: 'end_turn', model: 'openai/gpt-oss-120b', refused: false },
    ])
  })

  it('reassembles an event split across two network chunks', async () => {
    const out = sink()
    const service = createAiService(config, quiet, {
      fetch: groqStream([
        'data: {"choices":[{"delta":{"content":"sp',
        'lit"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
      ]) as never,
    })

    await service.stream(body, out.push, new AbortController().signal)
    expect(out.events[0]).toEqual({ type: 'text', text: 'split' })
  })

  it('explains a rejected key instead of leaving the assistant silent', async () => {
    const out = sink()
    const service = createAiService(config, quiet, {
      fetch: (async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })) as never,
    })

    await service.stream(body, out.push, new AbortController().signal)
    expect(out.events).toEqual([
      { type: 'error', message: 'The Groq API key was rejected. Check GROQ_API_KEY and restart the server.' },
    ])
  })

  it('moves to the next model when the configured one has been retired', async () => {
    const out = sink()
    const seen: string[] = []
    const fakeFetch = vi.fn(async (_url: string, init: { body: string }) => {
      const { model } = JSON.parse(init.body) as { model: string }
      seen.push(model)
      if (model === 'gone-away') {
        return new Response(JSON.stringify({ error: { message: 'The model does not exist' } }), { status: 404 })
      }
      return groqStream(['data: [DONE]\n\n'])()
    })

    const service = createAiService(resolveAi({ GROQ_API_KEY: 'gsk_mock', AI_MODEL: 'gone-away' }), quiet, {
      fetch: fakeFetch as never,
    })
    await service.stream(body, out.push, new AbortController().signal)

    expect(seen).toEqual(['gone-away', 'openai/gpt-oss-120b'])
    expect(out.events.at(-1)).toMatchObject({ type: 'done', model: 'openai/gpt-oss-120b' })
  })
})

describe('with no key at all', () => {
  it('refuses before opening a stream, so the route can answer honestly', async () => {
    const service = createAiService(resolveAi({}), quiet)
    await expect(
      service.stream(body, () => undefined, new AbortController().signal)
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe('helpers', () => {
  it('folds the persona and the data into one system message for Groq', () => {
    expect(toGroqMessages({ system: 'Robi', context: 'DATA', messages: body.messages })).toEqual([
      { role: 'system', content: 'Robi\n\nDATA' },
      { role: 'user', content: 'Hi' },
    ])
    expect(toGroqMessages({ system: 'Robi', context: '  ', messages: body.messages })[0].content).toBe('Robi')
  })

  it('shrugs off a half-arrived chunk instead of breaking the reply', () => {
    expect(readGroqChunk('{"choices":[{"delta":{"content":"a"}}]}')).toEqual({ text: 'a', finishReason: undefined })
    expect(readGroqChunk('{"choices":[{"delta":{},"finish_reason":"length"}]}').finishReason).toBe('length')
    expect(readGroqChunk('{"choices":[{"del')).toEqual({})
  })

  it('names each way a Groq call can fail', () => {
    expect(describeGroqError(401)).toContain('GROQ_API_KEY')
    expect(describeGroqError(429)).toContain('rate-limiting')
    expect(describeGroqError(500, 'upstream exploded')).toBe('upstream exploded')
    expect(describeGroqError(500)).toContain('(500)')
  })
})
