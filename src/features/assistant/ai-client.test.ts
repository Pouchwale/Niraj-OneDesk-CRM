import { describe, expect, it } from 'vitest'

import { parseSseEvents } from './ai-client'

describe('parseSseEvents', () => {
  it('reads complete events and keeps the unfinished tail', () => {
    const chunk = 'data: {"type":"text","text":"Hel"}\n\ndata: {"type":"text","text":"lo"}\n\ndata: {"type":"do'
    const { events, rest } = parseSseEvents(chunk)
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
    ])
    expect(rest).toBe('data: {"type":"do')
  })

  it('finishes the tail once the rest arrives', () => {
    const { events, rest } = parseSseEvents('data: {"type":"done","stop_reason":"end_turn","refused":false}\n\n')
    expect(events).toEqual([{ type: 'done', stop_reason: 'end_turn', refused: false }])
    expect(rest).toBe('')
  })

  it('copes with CRLF line endings and skips malformed events', () => {
    const { events } = parseSseEvents('data: {"type":"text","text":"a"}\r\n\r\ndata: not json\r\n\r\n')
    expect(events).toEqual([{ type: 'text', text: 'a' }])
  })

  it('returns nothing for a buffer with no complete event yet', () => {
    expect(parseSseEvents('data: {"type":"text"')).toEqual({ events: [], rest: 'data: {"type":"text"' })
  })
})
