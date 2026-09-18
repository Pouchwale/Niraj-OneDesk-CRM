import { describe, expect, it } from 'vitest'

import { createLogger } from './logger'

function capture(options: Parameters<typeof createLogger>[0] = {}) {
  const lines: string[] = []
  const logger = createLogger({ ...options, write: (line) => lines.push(line) })
  return { logger, lines }
}

describe('createLogger', () => {
  it('writes one JSON object per line, with the level and message', () => {
    const { logger, lines } = capture({ json: true, level: 'debug' })
    logger.info('request', { status: 200 })

    const parsed = JSON.parse(lines[0]) as Record<string, unknown>
    expect(parsed).toMatchObject({ level: 'info', message: 'request', status: 200 })
    expect(Date.parse(parsed.time as string)).not.toBeNaN()
  })

  it('says nothing below the configured level', () => {
    const { logger, lines } = capture({ json: true, level: 'warn' })
    logger.debug('quiet')
    logger.info('also quiet')
    logger.warn('loud')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('loud')
  })

  it('never writes down a secret, whatever it is called', () => {
    const { logger, lines } = capture({ json: true })
    logger.info('starting', {
      GROQ_API_KEY: 'gsk_real_key',
      authorization: 'Bearer abc',
      apiToken: 'xyz',
      path: 'C:/books/ageing.xlsx',
    })

    expect(lines[0]).not.toContain('gsk_real_key')
    expect(lines[0]).not.toContain('Bearer abc')
    expect(lines[0]).not.toContain('xyz')
    // Everything else is still there to be useful.
    expect(lines[0]).toContain('ageing.xlsx')
  })

  it('stamps a child logger\'s fields onto every line it writes', () => {
    const { logger, lines } = capture({ json: true })
    const scoped = logger.child({ requestId: 'req-1' })
    scoped.error('failed')
    scoped.warn('slow')

    expect(lines.every((line) => line.includes('req-1'))).toBe(true)
  })

  it('writes something a person can read when not in production', () => {
    const { logger, lines } = capture({ json: false })
    logger.info('listening', { port: 8080 })
    expect(lines[0]).toBe('info  listening port=8080')
  })
})
