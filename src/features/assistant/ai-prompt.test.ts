import { describe, expect, it } from 'vitest'

import { HISTORY_TURNS, ROBI_SYSTEM_PROMPT, buildAiRequest, type AiTurn } from './ai-prompt'
import type { AiContext } from './knowledge'

const context: AiContext = {
  today: '2026-09-06',
  user: { name: 'Pragati Patel', role: 'coordinator' },
  scope: 'own accounts only',
  totals: { accounts: 2, outstanding: '₹8,00,000', pastDue: '₹8,00,000', pastNinetyDays: '₹5,50,000' },
  nudges: ['Balaji Print Pack promised ₹2,50,000 by 04 Sept 2026 — that was 2 days ago and it is still open.'],
  customers: [
    { name: 'Balaji Print Pack', bpCode: 'BP-1001', owner: 'Pragati Patel', status: 'critical', outstanding: '₹5,50,000', note: '70 days past due' },
  ],
}

describe('buildAiRequest', () => {
  it('sends the persona, the data as JSON, and the question last', () => {
    const request = buildAiRequest({ question: 'Why is Balaji late?', context, ruleAnswer: null, history: [] })
    expect(request.system).toBe(ROBI_SYSTEM_PROMPT)
    expect(request.context).toContain('DATA CONTEXT (JSON; the only facts you may use)')
    expect(request.context).toContain('"outstanding":"₹5,50,000"')
    expect(request.context).not.toContain('SYSTEM-COMPUTED ANSWER')
    expect(request.messages).toEqual([{ role: 'user', content: 'Why is Balaji late?' }])
  })

  it('adds the rule engine\'s answer as authoritative figures when it had one', () => {
    const request = buildAiRequest({
      question: 'how much does Balaji owe?',
      context,
      ruleAnswer: { intent: 'customer', text: 'Balaji Print Pack owes ₹5,50,000.', facts: [{ label: 'Outstanding', value: '₹5,50,000' }] },
      history: [],
    })
    expect(request.context).toContain('SYSTEM-COMPUTED ANSWER (figures are authoritative)')
    expect(request.context).toContain('Balaji Print Pack owes ₹5,50,000.')
  })

  it('keeps recent turns, starting with the person, and drops empty ones', () => {
    const history: AiTurn[] = [
      { role: 'assistant', text: 'Good morning, Pragati.' },
      { role: 'user', text: 'How much is owed?' },
      { role: 'assistant', text: '   ' },
      { role: 'assistant', text: 'You are chasing ₹8,00,000.' },
    ]
    const request = buildAiRequest({ question: 'and why?', context, ruleAnswer: null, history })
    expect(request.messages).toEqual([
      { role: 'user', content: 'How much is owed?' },
      { role: 'assistant', content: 'You are chasing ₹8,00,000.' },
      { role: 'user', content: 'and why?' },
    ])
  })

  it('caps the history so a long chat does not grow the request without bound', () => {
    const history: AiTurn[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `turn ${i}`,
    }))
    const request = buildAiRequest({ question: 'next?', context, ruleAnswer: null, history })
    expect(request.messages.length).toBeLessThanOrEqual(HISTORY_TURNS + 1)
    expect(request.messages[0].role).toBe('user')
    expect(request.messages[request.messages.length - 1]).toEqual({ role: 'user', content: 'next?' })
  })

  it('tells the model it is read-only and must stay inside the data', () => {
    expect(ROBI_SYSTEM_PROMPT).toContain('You are read-only')
    expect(ROBI_SYSTEM_PROMPT).toContain('Never invent')
    expect(ROBI_SYSTEM_PROMPT).toContain('open the record and log it there themselves')
  })
})
