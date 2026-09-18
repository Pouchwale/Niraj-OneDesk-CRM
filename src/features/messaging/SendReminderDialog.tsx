import { useEffect, useMemo, useState } from 'react'
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
  MESSAGE_TEMPLATES, renderMessage, suggestTemplate, type TemplateKey,
} from '@/lib/message-templates'
import {
  EMAIL_PROVIDERS, buildEmailUrl, buildWhatsAppUrl, getEmailProvider, getSenderOrg,
  isValidEmail, normalizePhoneForWhatsApp, openChannel, setEmailProvider, setSenderOrg,
  type EmailProvider,
} from '@/lib/messaging'
import { addDaysISO, formatCurrency, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { FollowupEntityType } from '@/lib/types'

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
 * session. Because we cannot observe the send, the follow-up is logged as
 * "reminder sent" at the moment the channel is opened.
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
      coordinatorName,
      coordinatorPhone,
      senderOrg: org,
    })
  }, [target, templateKey, coordinatorName, coordinatorPhone, org])

  // Reset to a sensible template and the record's own contact details each time
  // the dialog is opened for a different account.
  useEffect(() => {
    if (!open || !target) return
    setTemplateKey(
      suggestTemplate({
        daysOverdue: target.daysOverdue,
        dueDate: target.dueDate,
        isSettled: target.isSettled,
      })
    )
    setPhone(target.contactNumber ?? '')
    setEmail(target.email ?? '')
  }, [open, target])

  // Keep the editable bodies in step with the chosen template.
  useEffect(() => {
    if (!rendered) return
    setSubject(rendered.subject)
    setWhatsappBody(rendered.whatsappBody)
    setEmailBody(rendered.emailBody)
  }, [rendered])

  if (!target) return null

  const normalizedPhone = normalizePhoneForWhatsApp(phone)
  const emailUsable = isValidEmail(email)

  /** Records the outreach so the timeline reflects what the customer received. */
  const logReminder = async (channel: 'whatsapp' | 'email', body: string) => {
    await addFollowup({
      entity_type: target.entityType,
      entity_id: target.entityId,
      coordinator_id: coordinatorId,
      followup_date: new Date().toISOString(),
      mode: channel,
      notes: `Payment reminder sent via ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}:\n\n${body}`,
      customer_response: null,
      status: 'pending',
      committed_date: null,
      committed_amount: null,
      next_reminder_date: addDaysISO(todayISO(), 3),
      proof_attachment_url: null,
    })
  }

  const handleSend = async (channel: 'whatsapp' | 'email') => {
    if (channel === 'whatsapp' && !normalizedPhone) {
      toast.error('Enter a valid mobile number with country code.')
      return
    }
    if (channel === 'email' && !emailUsable) {
      toast.error('Enter a valid email address.')
      return
    }

    setIsSending(true)
    try {
      const url =
        channel === 'whatsapp'
          ? buildWhatsAppUrl(normalizedPhone!, whatsappBody)
          : buildEmailUrl(provider, email, subject, emailBody)

      // Open first: browsers only allow this inside the click gesture.
      openChannel(url)

      setSenderOrg(org)
      await logReminder(channel, channel === 'whatsapp' ? whatsappBody : emailBody)

      toast.success(
        channel === 'whatsapp'
          ? 'WhatsApp opened — press send there. Logged as a follow-up.'
          : 'Mail compose opened — press send there. Logged as a follow-up.'
      )
      onSent?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the message.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              {email && !emailUsable && (
                <p className="flex items-center gap-1 text-xs text-rose-500">
                  <AlertTriangle className="h-3 w-3" /> Not a valid email address
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
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" /> Email
            </Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="min-h-[180px]"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This opens WhatsApp or your mail app with the message ready — you press send there.
              Either way the outreach is logged on the follow-up timeline and a reminder is set for
              three days from now.
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isSending}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => handleSend('email')}
            disabled={isSending || !emailUsable}
            className={cn(!emailUsable && 'opacity-60')}
          >
            <Mail className="mr-2 h-4 w-4" /> Open in email
          </Button>
          <Button
            onClick={() => handleSend('whatsapp')}
            disabled={isSending || !normalizedPhone}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <MessageCircle className="mr-2 h-4 w-4" /> Send on WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
