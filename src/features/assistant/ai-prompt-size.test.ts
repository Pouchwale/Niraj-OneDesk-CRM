/**
 * Robi's system prompt (persona + CRM guide) must fit what the server accepts.
 * It outgrew the old 20,000 limit unnoticed and every AI answer was refused
 * (found 16 Nov 2026); this keeps that from happening again as the guide grows.
 */

import { describe, expect, it } from 'vitest'

import { MAX_SYSTEM_CHARS } from '../../../server/modules/ai/routes'
import { buildAiRequest } from './ai-prompt'

describe('Robi’s AI request', () => {
  it('fits the server’s limit on the system prompt, with room to grow', () => {
    const request = buildAiRequest({ question: 'hi', context: {} as never, ruleAnswer: null, history: [] })
    expect(request.system.length).toBeLessThan(MAX_SYSTEM_CHARS * 0.8)
  })
})
