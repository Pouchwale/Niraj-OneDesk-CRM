import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { MessageCircle, Mail, AlertTriangle, Info } from 'lucide-react'

import { addFollowup } from '@/lib/followups-api'
import {
  MESSAGE_TEMPLATES, WHATSAPP_PDF_NOTE, renderMessage, suggestTemplate, type TemplateKey,
} from '@/lib/message-templates'
import {
  EMAIL_PROVIDERS, buildEmailUrl, buildWhatsAppUrl, emailProviderName, emailRecipients, getEmailProvider, getSenderOrg,
  normalizePhoneForWhatsApp, openChannel, setEmailProvider, setSenderOrg,
  type EmailProvider,
} from '@/lib/messaging'
import { addDaysISO, formatCurrency, todayISO } from '@/lib/utils'
import type { FollowupEntityType } from '@/lib/types'
import { demoCompanyStore } from '@/lib/demo-companies'
import {
  INVOICE_TABLE_SLOT, copyRich, emailHtml, emailLinkFits, emailText, invoiceTableHtml, invoiceTableText,
  statementForCode, withoutInvoiceTable,
} from '@/lib/customer-statement'
import { buildInvoiceTablePdf, invoicePdfFileName, loadPdfTools, type PdfTools } from '@/lib/customer-statement-pdf'

export interface ReminderTarget {
  entityType: FollowupEntityType
  entityId: string
  customerName: string
  contactPerson?: string | null
  contactNumber?: string | null
  email?: string | null
  amount: number
  dueDate?: string | null
  invoiceDate?: string | null
  paymentTerms?: string | null
  bpCode?: string | null
  daysOverdue?: number
  isSettled?: boolean
  /** The reminder covers the whole customer (21 Nov 2026): logged as one customer follow-up. */
  customerWide?: boolean
  /** Invoices in the amount; the due date is the oldest of them. */
  invoiceCount?: number
  /** Nothing is due yet. */
  notDueYet?: boolean
}

interface SendReminderDialogProps {
  target: ReminderTarget | null
  open: boolean
  onClose: () => void
  coordinatorId: string
  coordinatorName: string
  coordinatorPhone?: string | null
  /** Called after a reminder is logged so the parent can refresh. */
  onSent?: () => void
}

/**
 * Composes a payment-reminder message and hands it to WhatsApp or email.
 *
 * The app never sends anything itself: it opens the channel with the message
 * pre-filled so the coordinator reviews and presses send in their own signed-in
 * session. We cannot observe the send, so the dialog then asks "Did you send
 * it?" and logs the follow-up only on "Yes, sent" (20 Nov 2026). It used to log
 * the moment the channel opened, which ticked Robi's task done and asked for a
 * proof of a message never sent (Krupa, Rudradeo, 20 Nov 2026).
 */
export function SendReminderDialog({
  target, open, onClose, coordinatorId, coordinatorName, coordinatorPhone, onSent,
}: SendReminderDialogProps) {
  const [templateKey, setTemplateKey] = useState<TemplateKey>('gentle_reminder')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [whatsappBody, setWhatsappBody] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [provider, setProvider] = useState<EmailProvider>(getEmailProvider())
  const [org, setOrg] = useState(getSenderOrg())
  const [isSending, setIsSending] = useState(false)
  /** The channel just opened, waiting for "Did you send it?"; nothing is logged until "Yes, sent". */
  const [opened, setOpened] = useState<'whatsapp' | 'email' | null>(null)
  /** The whole formatted email is on the clipboard, waiting for Ctrl+V. */
  const [tableToPaste, setTableToPaste] = useState(false)
  /** The invoice PDF just downloaded for the WhatsApp chat. */
  const [pdfName, setPdfName] = useState<string | null>(null)
  /** The link just opened, offered again in case the browser blocked the new tab. */
  const [composeUrl, setComposeUrl] = useState<string | null>(null)
  const pdfTools = useRef<PdfTools | null>(null)
  // The form is long, so what to do next is brought into view once the channel opens.
  const confirmBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (opened) confirmBox.current?.scrollIntoView({ block: 'start' })
  }, [opened])

  // The customer's open invoices, for the table in the email (21 Nov 2026).
  const statement = useMemo(
    () => (open && target && !target.isSettled ? statementForCode(target.bpCode, demoCompanyStore.getAllCompanies()) : null),
    [open, target?.bpCode, target?.isSettled]
  )
  const invoiceTable = useMemo(() => (statement ? invoiceTableText(statement) : ''), [statement])
  const invoiceHtml = useMemo(() => (statement ? invoiceTableHtml(statement) : ''), [statement])
  const hasTable = Boolean(statement) && templateKey !== 'payment_thanks'

  // Ready before the click: a download and a new tab must both happen inside it.
  useEffect(() => {
    if (!open || !hasTable || pdfTools.current) return
    loadPdfTools().then((tools) => { pdfTools.current = tools }).catch(() => undefined)
  }, [open, hasTable])
  // The ageing sheet and the invoices can disagree; a coordinator should see that before a customer does.
  const amountDiffers =
    Boolean(statement && target) &&
    Math.abs((target?.amount ?? 0) - (statement?.overdue ?? 0)) > 1 &&
    Math.abs((target?.amount ?? 0) - (statement?.outstanding ?? 0)) > 1

  // The page rebuilds the target on every render: only a real change may reset what is being typed.
  const targetKey = JSON.stringify(target ?? null)

  const rendered = useMemo(() => {
    if (!target) return null
    return renderMessage(templateKey, {
      customerName: target.customerName,
      contactPerson: target.contactPerson,
      amount: target.amount,
      dueDate: target.dueDate,
      invoiceDate: target.invoiceDate,
      paymentTerms: target.paymentTerms,
      bpCode: target.bpCode,
      daysOverdue: target.daysOverdue,
      invoiceCount: target.invoiceCount,
      invoiceTable: hasTable ? INVOICE_TABLE_SLOT : null,
      coordinatorName,
      coordinatorPhone,
      senderOrg: org,
    })
  }, [targetKey, templateKey, coordinatorName, coordinatorPhone, org, hasTable])

  // Reset to a sensible template and the record's own contact details each time
  // the dialog is opened for a different account.
  useEffect(() => {
    if (!open || !target) return
    setTemplateKey(
      suggestTemplate({
        daysOverdue: target.daysOverdue,
        dueDate: target.dueDate,
        isSettled: target.isSettled,
        notDueYet: target.notDueYet,
      })
    )
    setPhone(target.contactNumber ?? '')
    setEmail(emailRecipients(target.email).join(', '))
  }, [open, targetKey])

  // A new opening, or another customer, starts without a pending "Did you send it?". Keyed on the
  // customer, not the target object, which the page rebuilds on every render (it did when WhatsApp opened).
  useEffect(() => {
    setOpened(null)
    setTableToPaste(false)
    setPdfName(null)
    setComposeUrl(null)
  }, [open, target?.entityType, target?.entityId])

  // Keep the editable bodies in step with the chosen template.
  useEffect(() => {
    if (!rendered) return
    setSubject(rendered.subject)
    setWhatsappBody(rendered.whatsappBody)
    setEmailBody(rendered.emailBody)
  }, [rendered])

  if (!target) return null

  const normalizedPhone = normalizePhoneForWhatsApp(phone)
  // The button stays clickable without an address: most customers have none saved, and it can be typed in the email.
  const recipients = emailRecipients(email)
  const emailTo = recipients.join(',')
  const providerName = emailProviderName(provider)

  /** Records the outreach so the timeline reflects what the customer received. */
  const logReminder = async (channel: 'whatsapp' | 'email', body: string) => {
    await addFollowup({
      entity_type: target.entityType,
      entity_id: target.entityId,
      coordinator_id: coordinatorId,
      followup_date: new Date().toISOString(),
      mode: channel,
      notes: `Payment reminder sent via ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}:\n\n${body.replace(INVOICE_TABLE_SLOT, `[Invoice table: ${statement?.invoices.length ?? 0} open invoices]`)}`,
      customer_response: null,
      status: 'pending',
      committed_date: null,
      committed_amount: null,
      next_reminder_date: addDaysISO(todayISO(), 3),
      proof_attachment_url: null,
      ...(target.customerWide ? { customer_wide: true } : {}),
    })
  }

  const handleSend = async (channel: 'whatsapp' | 'email') => {
    if (channel === 'whatsapp' && !normalizedPhone) {
      toast.error('Enter a valid mobile number with country code.')
      return
    }

    setIsSending(true)
    try {
      let url =
        channel === 'whatsapp'
          ? buildWhatsAppUrl(normalizedPhone!, whatsappBody)
          : buildEmailUrl(provider, emailTo, subject, emailBody)
      /*
       * A link can carry only plain text, so the lined table cannot go in it.
       * The whole formatted email is copied and a new email opens to paste it into.
       */
      let pasteTable = false
      if (channel === 'email' && hasTable) {
        const plain = emailText(emailBody, invoiceTable)
        pasteTable = copyRich(emailHtml(emailBody, invoiceHtml), plain)
        if (pasteTable) {
          url = buildEmailUrl(provider, emailTo, subject, '')
        } else {
          url = buildEmailUrl(provider, emailTo, subject, plain)
          const fits = emailLinkFits(provider, url)
          if (!fits) url = buildEmailUrl(provider, emailTo, subject, withoutInvoiceTable(plain, invoiceTable))
          toast.error('The lined table could not be copied.', {
            description: fits
              ? 'The email opens with a plain text table instead.'
              : 'The email opens without the table. Add it before sending.',
            duration: 15000,
          })
        }
      }
      setTableToPaste(pasteTable)

      // A WhatsApp link cannot carry a file: the lined PDF is downloaded for attaching.
      let savedPdf: string | null = null
      if (channel === 'whatsapp' && hasTable && statement) {
        try {
          const tools = pdfTools.current ?? (await loadPdfTools())
          const name = invoicePdfFileName(statement)
          buildInvoiceTablePdf(statement, tools).save(name)
          savedPdf = name
        } catch {
          url = buildWhatsAppUrl(normalizedPhone!, whatsappBody.replace(`\n\n${WHATSAPP_PDF_NOTE}`, ''))
          toast.error('The invoice PDF could not be made.', {
            description: 'WhatsApp opens without mentioning a PDF.',
            duration: 15000,
          })
        }
      }
      setPdfName(savedPdf)

      // Open first: browsers only allow this inside the click gesture.
      setComposeUrl(url)
      openChannel(url)

      setSenderOrg(org)
      setOpened(channel)
      toast.info(
        channel === 'whatsapp'
          ? savedPdf
            ? 'PDF downloaded and WhatsApp opened: attach the PDF, send, then come back and say if you sent it.'
            : 'WhatsApp opened: press send there, then come back and say if you sent it.'
          : pasteTable
            ? `Email opened: ${recipients.length ? '' : "type the customer's address in To, "}click in the message, press Ctrl+V, send it, then come back and say if you sent it.`
            : 'Mail compose opened: press send there, then come back and say if you sent it.'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the message.')
    } finally {
      setIsSending(false)
    }
  }

  /** "Yes, sent": only now is the reminder a follow-up (and can tick Robi's task). */
  const confirmSent = async () => {
    if (!opened) return
    setIsSending(true)
    try {
      await logReminder(opened, opened === 'whatsapp' ? whatsappBody : emailBody)
      toast.success('Reminder logged as a follow-up.', { description: 'Next reminder in three days.' })
      setOpened(null)
      onSent?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not log the reminder.')
    } finally {
      setIsSending(false)
    }
  }

  const notSent = () => {
    setOpened(null)
    toast('Nothing logged.', { description: 'Send it again when you are ready, or close this.' })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        {/* Only the form scrolls, so the send buttons are always on screen. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1" data-testid="reminder-scroll">
        <DialogHeader>
          <DialogTitle>Send payment reminder</DialogTitle>
          <DialogDescription>
            {target.customerName} · {formatCurrency(target.amount)}
          </DialogDescription>
          {/* Kept outside DialogDescription, which renders a <p> and cannot
              legally contain the Badge's <div>. */}
          {target.daysOverdue && target.daysOverdue > 0 ? (
            <div className="pt-1">
              <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-500">
                {target.daysOverdue} days overdue
              </Badge>
            </div>
          ) : null}
        </DialogHeader>

        {opened && (
          <div ref={confirmBox} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid="reminder-confirm">
            <p className="text-sm font-medium">
              Did you send the {opened === 'whatsapp' ? 'WhatsApp message' : 'email'} to {target.customerName}?
            </p>
            {opened === 'whatsapp' && pdfName && (
              <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm font-medium text-amber-800 dark:text-amber-300" data-testid="reminder-attach-pdf">
                The invoice PDF is downloaded as {pdfName}. In the WhatsApp chat, attach it with the paperclip or drag it in from Downloads, then send.
              </p>
            )}
            {opened === 'email' && tableToPaste && (
              <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm font-medium text-amber-800 dark:text-amber-300" data-testid="reminder-paste-table">
                The full email with the invoice table is copied. In the new email, click in the message and press Ctrl+V, then send.
              </p>
            )}
            {composeUrl && (
              <a
                href={composeUrl}
                target={composeUrl.startsWith('mailto:') ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="inline-block text-sm font-medium text-primary underline"
                data-testid="reminder-open-link"
              >
                {opened === 'whatsapp' ? 'WhatsApp' : providerName === 'email' ? 'Email' : providerName} did not open? Click here
              </a>
            )}
            <p className="text-xs text-muted-foreground">Only a sent reminder is logged as a follow-up and counts for Robi's task.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={notSent} disabled={isSending} data-testid="reminder-not-sent">
                Not sent
              </Button>
              <Button onClick={() => void confirmSent()} disabled={isSending} data-testid="reminder-sent">
                Yes, sent: log it
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={templateKey} onValueChange={(v) => setTemplateKey(v as TemplateKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESSAGE_TEMPLATES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {MESSAGE_TEMPLATES.find((t) => t.key === templateKey)?.description}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Mobile number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
              {phone && !normalizedPhone && (
                <p className="flex items-center gap-1 text-xs text-rose-500">
                  <AlertTriangle className="h-3 w-3" /> Not a usable WhatsApp number
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accounts@customer.com"
              />
              {recipients.length === 0 && (
                <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400" data-testid="reminder-no-email">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {email.trim() ? 'Not a valid email address.' : 'No email saved for this customer.'} Type it here, or in {providerName} after it opens.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Open email in</Label>
              <Select
                value={provider}
                onValueChange={(v) => {
                  const next = v as EmailProvider
                  setProvider(next)
                  setEmailProvider(next)
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMAIL_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {EMAIL_PROVIDERS.find((p) => p.value === provider)?.hint}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Sign off as (optional)</Label>
              <Input
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="Your company name"
              />
              <p className="text-xs text-muted-foreground">
                Added under your name. Saved for next time.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-500" /> WhatsApp message
            </Label>
            <Textarea
              value={whatsappBody}
              onChange={(e) => setWhatsappBody(e.target.value)}
              className="min-h-[120px] font-normal"
            />
            {statement && hasTable && (
              <p className="text-xs text-muted-foreground" data-testid="reminder-pdf-note">
                Send on WhatsApp also downloads the lined table of {statement.invoices.length} open invoice{statement.invoices.length === 1 ? '' : 's'} as a PDF to attach in the chat.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" /> Email
            </Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="min-h-[260px]"
              data-testid="reminder-email-body"
            />
            {statement && hasTable && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground" data-testid="reminder-table-note">
                  This table of {statement.invoices.length} open invoice{statement.invoices.length === 1 ? '' : 's'} goes in the email where it says {INVOICE_TABLE_SLOT}.
                </p>
                <div
                  className="max-h-72 overflow-auto rounded border border-border bg-white p-2"
                  data-testid="reminder-table-preview"
                  dangerouslySetInnerHTML={{ __html: invoiceHtml }}
                />
              </div>
            )}
            {amountDiffers && statement && (
              <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400" data-testid="reminder-amount-differs">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                The message says {formatCurrency(target.amount)}, but the invoices show {formatCurrency(statement.overdue)} overdue of {formatCurrency(statement.outstanding)} outstanding. Check before sending.
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This opens WhatsApp or your mail app with the message ready — you press send there.
              Then say whether you sent it: only a sent reminder is logged on the follow-up timeline
              (with a reminder three days from now) and counts for Robi's task.
            </span>
          </div>
        </div>

        </div>

        {!opened && (
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end" data-testid="reminder-actions">
          <Button variant="ghost" onClick={onClose} disabled={isSending}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => handleSend('email')}
            disabled={isSending}
          >
            <Mail className="mr-2 h-4 w-4" /> Open in {providerName}
          </Button>
          <Button
            onClick={() => handleSend('whatsapp')}
            disabled={isSending || !normalizedPhone}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <MessageCircle className="mr-2 h-4 w-4" /> Send on WhatsApp
          </Button>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
