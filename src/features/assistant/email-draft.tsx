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
 *   Code: BP code, when known
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
import {
  copyRich,
  copyText,
  emailHtml,
  emailLinkFits,
  invoiceTableHtml,
  invoiceTableText,
  splitAtTable,
  statementForCode,
  statementForName,
  withInvoiceTable,
  withoutInvoiceTable,
} from '@/lib/customer-statement'
import { buildEmailUrl, emailProviderName, emailRecipients, getEmailProvider, openChannel } from '@/lib/messaging'

export interface EmailDraft {
  to: string
  /** The customer's BP code, which finds their invoices for the table. */
  code?: string
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
  let code = ''
  let subject = ''
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    const m = /^(to|code|subject)\s*:\s*(.*)$/i.exec(line)
    if (m) {
      const field = m[1].toLowerCase()
      if (field === 'to') to = m[2].trim()
      else if (field === 'code') code = m[2].trim()
      else subject = m[2].trim()
      continue
    }
    // Blank lines between the To and Subject lines are allowed; the body starts at the first other line.
    if (!line) continue
    break
  }
  return { to, ...(code ? { code } : {}), subject, body: lines.slice(i).join('\n').trim() }
}

/** The customer's email address in the CRM, by name (an invoice's Email field), if one is on record. */
export function emailAddressOf(customerName: string): string | null {
  const name = customerName.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!name) return null
  const found = demoCompanyStore
    .getAllCompanies()
    .find((c) => (c.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === name && c.email && /@/.test(c.email))
  return emailRecipients(found?.email).join(',') || null
}

/** The mailto link for a draft: the customer's address when known, the subject and the body. */
export function mailtoOf(draft: EmailDraft, address: string | null): string {
  const q = `subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
  return `mailto:${address ? encodeURIComponent(address).replace(/%40/g, '@') : ''}?${q}`
}

/** The draft with the customer's invoice table above its sign-off (21 Nov 2026), and that table. */
export function draftWithTable(draft: EmailDraft, invoices: Parameters<typeof statementForCode>[1]): { body: string; table: string; html: string; email: string | null } {
  const customer = statementForCode(draft.code, invoices) ?? statementForName(draft.to, invoices)
  const table = customer ? invoiceTableText(customer) : ''
  return { body: withInvoiceTable(draft.body, table), table, html: customer ? invoiceTableHtml(customer) : '', email: customer?.lead.email ?? null }
}

export function EmailDraftCard({ draft }: { draft: EmailDraft }) {
  const [copied, setCopied] = useState(false)
  /** The link just opened, offered again in case the browser blocked the new tab. */
  const [composeUrl, setComposeUrl] = useState<string | null>(null)
  // On by default; a thank-you or a dispatch note may not want it.
  const [includeTable, setIncludeTable] = useState(true)
  const prepared = draftWithTable(draft, demoCompanyStore.getAllCompanies())
  const address = emailRecipients(prepared.email).join(',') || emailAddressOf(draft.to)
  // Gmail unless this person chose another: not every PC has a mail app for a mailto link to open.
  const provider = getEmailProvider()
  const providerName = emailProviderName(provider)
  const body = includeTable ? prepared.body : draft.body
  const table = includeTable ? prepared.table : ''
  const html = includeTable ? prepared.html : ''
  const around = splitAtTable(draft.body)
  const copy = () => {
    const plain = `Subject: ${draft.subject}\n\n${body}`
    if (html ? copyRich(emailHtml(draft.body, html), plain) : copyText(plain)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      toast.error('Could not copy. Select the text and copy it instead.')
    }
  }
  const openEmail = () => {
    // A link can carry only plain text: the formatted email is copied for Ctrl+V.
    if (html && copyRich(emailHtml(draft.body, html), body)) {
      toast.info('The full email with the invoice table is copied.', {
        description: `In the new email, ${address ? '' : "type the customer's address in To, "}click in the message and press Ctrl+V, then send.`,
        duration: 15000,
      })
      const pasteUrl = buildEmailUrl(provider, address ?? '', draft.subject, '')
      setComposeUrl(pasteUrl)
      openChannel(pasteUrl)
      return
    }
    let url = buildEmailUrl(provider, address ?? '', draft.subject, body)
    if (table) {
      const fits = emailLinkFits(provider, url)
      if (!fits) url = buildEmailUrl(provider, address ?? '', draft.subject, withoutInvoiceTable(body, table))
      toast.error('The lined table could not be copied.', {
        description: fits ? 'The email opens with a plain text table instead.' : 'The email opens without the table. Add it before sending.',
        duration: 15000,
      })
    }
    setComposeUrl(url)
    openChannel(url)
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
      <div className="px-3 py-2 text-sm leading-relaxed" data-testid="robi-email-body">
        {html ? (
          <>
            <p className="whitespace-pre-wrap">{around.before}</p>
            <div className="my-2 overflow-x-auto rounded bg-white p-1" data-testid="robi-email-table" dangerouslySetInnerHTML={{ __html: html }} />
            <p className="whitespace-pre-wrap">{around.after}</p>
          </>
        ) : (
          <p className="whitespace-pre-wrap">{draft.body}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copy}>
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={openEmail} data-testid="robi-email-open">
          <Mail className="mr-1 h-3.5 w-3.5" /> Open in {providerName}
        </Button>
        {prepared.table && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIncludeTable((on) => !on)} data-testid="robi-email-table-toggle">
            {includeTable ? 'Remove invoice table' : 'Add invoice table'}
          </Button>
        )}
        {composeUrl && (
          <a
            href={composeUrl}
            target={composeUrl.startsWith('mailto:') ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="self-center text-xs font-medium text-primary underline"
            data-testid="robi-email-link"
          >
            {providerName === 'email' ? 'Email' : providerName} did not open? Click here
          </a>
        )}
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
