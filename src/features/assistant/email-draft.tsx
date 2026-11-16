/**
 * Robi's email drafts (16 Nov 2026, the user's request): Robi writes a
 * customer email as a block the chat turns into a card, with the Subject and
 * body, Copy, and "Open in email", which starts a new email to the customer's
 * address in the coordinator's own mail app (they still press Send there).
 *
 * The model is asked (ai-prompt.ts) to wrap a draft like this:
 *
 *   [[EMAIL]]
 *   To: Customer name
 *   Subject: ...
 *
 *   Dear ...,
 *   ...
 *   [[/EMAIL]]
 *
 * A "Draft email with Robi" button on a customer asks Robi through askRobi().
 */

import { useState } from 'react'
import { Check, Copy, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { demoCompanyStore } from '@/lib/demo-companies'

export interface EmailDraft {
  to: string
  subject: string
  body: string
}

export type DraftPart = { kind: 'text'; text: string } | { kind: 'email'; draft: EmailDraft } | { kind: 'writing' }

// No '>>>' in the markers: that starts Robi's suggestions line (splitSuggestions).
const OPEN = '[[EMAIL]]'
const CLOSE = '[[/EMAIL]]'

/** The reply split into plain text and email drafts; a draft still being written shows as "writing". */
export function splitEmailDrafts(text: string): DraftPart[] {
  const parts: DraftPart[] = []
  let rest = text
  while (rest.length) {
    const at = rest.indexOf(OPEN)
    if (at === -1) {
      parts.push({ kind: 'text', text: rest })
      break
    }
    if (at > 0) parts.push({ kind: 'text', text: rest.slice(0, at) })
    const end = rest.indexOf(CLOSE, at + OPEN.length)
    if (end === -1) {
      parts.push({ kind: 'writing' })
      break
    }
    parts.push({ kind: 'email', draft: parseDraft(rest.slice(at + OPEN.length, end)) })
    rest = rest.slice(end + CLOSE.length)
  }
  return parts.filter((p) => p.kind !== 'text' || p.text.trim())
}

export function parseDraft(block: string): EmailDraft {
  const lines = block.replace(/\r\n/g, '\n').replace(/^\n+/, '').split('\n')
  let to = ''
  let subject = ''
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    const m = /^(to|subject)\s*:\s*(.*)$/i.exec(line)
    if (m) {
      if (m[1].toLowerCase() === 'to') to = m[2].trim()
      else subject = m[2].trim()
      continue
    }
    // Blank lines between the To and Subject lines are allowed; the body starts at the first other line.
    if (!line) continue
    break
  }
  return { to, subject, body: lines.slice(i).join('\n').trim() }
}

/** The customer's email address in the CRM, by name (an invoice's Email field), if one is on record. */
export function emailAddressOf(customerName: string): string | null {
  const name = customerName.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!name) return null
  const found = demoCompanyStore
    .getAllCompanies()
    .find((c) => (c.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === name && c.email && /@/.test(c.email))
  return found?.email?.trim() ?? null
}

/** The mailto link for a draft: the customer's address when known, the subject and the body. */
export function mailtoOf(draft: EmailDraft, address: string | null): string {
  const q = `subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
  return `mailto:${address ? encodeURIComponent(address).replace(/%40/g, '@') : ''}?${q}`
}

export function EmailDraftCard({ draft }: { draft: EmailDraft }) {
  const [copied, setCopied] = useState(false)
  const address = emailAddressOf(draft.to)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy. Select the text and copy it instead.')
    }
  }
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-muted/30 text-foreground" data-testid="robi-email">
      <div className="space-y-0.5 border-b border-border/70 px-3 py-2 text-xs">
        <p>
          <span className="text-muted-foreground">To: </span>
          <span className="font-medium">{draft.to || '—'}</span>
          {address ? <span className="text-muted-foreground"> · {address}</span> : <span className="text-muted-foreground"> · no email on record</span>}
        </p>
        <p>
          <span className="text-muted-foreground">Subject: </span>
          <span className="font-medium" data-testid="robi-email-subject">{draft.subject || '—'}</span>
        </p>
      </div>
      <p className="whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed" data-testid="robi-email-body">
        {draft.body}
      </p>
      <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void copy()}>
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" className="h-7 text-xs" asChild>
          <a href={mailtoOf(draft, address)} data-testid="robi-email-open">
            <Mail className="mr-1 h-3.5 w-3.5" /> Open in email
          </a>
        </Button>
      </div>
    </div>
  )
}

/** An assistant message: its text, with any email drafts shown as cards. */
export function AssistantText({ text }: { text: string }) {
  const parts = splitEmailDrafts(text)
  return (
    <>
      {parts.map((part, i) =>
        part.kind === 'email' ? (
          <EmailDraftCard key={i} draft={part.draft} />
        ) : part.kind === 'writing' ? (
          <p key={i} className="my-1 text-xs italic opacity-75">Writing the email…</p>
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {part.text.trim()}
          </span>
        )
      )}
    </>
  )
}

/** Opens Robi's chat and asks this question there (used by the "Draft email with Robi" buttons). */
export const ROBI_ASK_EVENT = 'robi:ask'
export function askRobi(question: string) {
  window.dispatchEvent(new CustomEvent(ROBI_ASK_EVENT, { detail: { question } }))
}
