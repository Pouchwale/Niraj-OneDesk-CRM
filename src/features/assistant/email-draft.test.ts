/**
 * Robi's email drafts (16 Nov 2026): the reply's email block becomes a card
 * with To, Subject and body; a block still being written shows as "writing";
 * Open in email builds a mailto with the customer's address when known.
 */

import { describe, expect, it } from 'vitest'

import { mailtoOf, parseDraft, splitEmailDrafts } from './email-draft'
import { ROBI_SYSTEM_PROMPT, splitSuggestions } from './ai-prompt'

const reply = `Here is a gentle reminder for Amul.
[[EMAIL]]
To: Amul Fed Dairy
Subject: Friendly reminder: invoice INV-1 of ₹3,28,320

Dear Mr Shah,

I hope you are doing well.
Warm regards,
Pragati Patel
Accounts Team
[[/EMAIL]]`

describe('Robi email drafts', () => {
  it('splits a reply into text and an email card', () => {
    const parts = splitEmailDrafts(reply)
    expect(parts.map((p) => p.kind)).toEqual(['text', 'email'])
    const email = parts[1].kind === 'email' ? parts[1].draft : null
    expect(email).toEqual({
      to: 'Amul Fed Dairy',
      subject: 'Friendly reminder: invoice INV-1 of ₹3,28,320',
      body: 'Dear Mr Shah,\n\nI hope you are doing well.\nWarm regards,\nPragati Patel\nAccounts Team',
    })
  })

  it('shows a draft still being written as "writing", and plain replies as text', () => {
    expect(splitEmailDrafts('Sure.\n[[EMAIL]]\nTo: Amul\nSubject: Hi\n\nDear').map((p) => p.kind)).toEqual(['text', 'writing'])
    expect(splitEmailDrafts('Pragati has 9 tasks today.')).toEqual([{ kind: 'text', text: 'Pragati has 9 tasks today.' }])
  })

  it('reads the Subject even with a blank line after To', () => {
    expect(parseDraft('To: Sweet Karam\n\nSubject: Friendly reminder\n\nDear Sir/Madam,')).toEqual({ to: 'Sweet Karam', subject: 'Friendly reminder', body: 'Dear Sir/Madam,' })
  })

  it('builds the mailto with the address, subject and body', () => {
    const draft = parseDraft('To: Amul\nSubject: Payment & thanks\n\nDear Sir,\nThank you.')
    expect(mailtoOf(draft, 'accounts@amul.coop')).toBe('mailto:accounts@amul.coop?subject=Payment%20%26%20thanks&body=Dear%20Sir%2C%0AThank%20you.')
    expect(mailtoOf(draft, null).startsWith('mailto:?subject=')).toBe(true)
  })

  it('keeps the email whole when Robi adds its suggestions line after it', () => {
    const parts = splitEmailDrafts(splitSuggestions(`${reply}
>>> Make it shorter | Write it in Hindi`).text)
    expect(parts.map((p) => p.kind)).toEqual(['text', 'email'])
    expect(splitSuggestions(`${reply}
>>> Make it shorter | Write it in Hindi`).suggestions).toEqual(['Make it shorter', 'Write it in Hindi'])
  })

  it('tells the model the email block and the ChatGPT-style help', () => {
    expect(ROBI_SYSTEM_PROMPT).toContain('[[EMAIL]]')
    expect(ROBI_SYSTEM_PROMPT).toContain('[[/EMAIL]]')
    expect(ROBI_SYSTEM_PROMPT).toMatch(/like ChatGPT/)
    expect(ROBI_SYSTEM_PROMPT).toMatch(/English unless they ask for Hindi or Gujarati/)
  })
})
