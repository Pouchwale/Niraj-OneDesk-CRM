import { formatCurrency, formatDate } from './utils'

export type TemplateKey =
  | 'gentle_reminder'
  | 'due_today'
  | 'overdue_reminder'
  | 'final_notice'
  | 'payment_thanks'

export interface MessageContext {
  customerName: string
  contactPerson?: string | null
  amount: number
  dueDate?: string | null
  invoiceDate?: string | null
  paymentTerms?: string | null
  bpCode?: string | null
  /** Positive once the due date has passed. */
  daysOverdue?: number
  coordinatorName: string
  coordinatorPhone?: string | null
  /** Optional organisation name for the sign-off; omitted when blank. */
  senderOrg?: string | null
}

export interface MessageTemplate {
  key: TemplateKey
  label: string
  description: string
  subject: string
  /** Longer, more formal - used for email. */
  emailBody: string
  /** Shorter and chattier - used for WhatsApp. */
  whatsappBody: string
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'gentle_reminder',
    label: 'Gentle reminder (before due)',
    description: 'Courtesy note a few days ahead of the due date.',
    subject: 'Payment reminder - {{amount}} due on {{due_date}}',
    emailBody: `Dear {{greeting_name}},

Trust you are doing well.

This is a gentle reminder that a payment of {{amount}} against {{customer_name}} is due on {{due_date}} as per the agreed terms of {{payment_terms}}.

If the payment has already been processed, kindly share the transaction reference so we can update our records.

Thank you for your continued business.

Warm regards,
{{signature}}`,
    whatsappBody: `Hello {{greeting_name}}, this is {{coordinator_name}}.

A friendly reminder that {{amount}} is due on {{due_date}}.

If it has already been processed, please share the payment reference. Thank you!`,
  },
  {
    key: 'due_today',
    label: 'Due today',
    description: 'Payment falls due today.',
    subject: 'Payment of {{amount}} is due today',
    emailBody: `Dear {{greeting_name}},

This is a reminder that the payment of {{amount}} against {{customer_name}} falls due today, {{due_date}}.

We would appreciate it if the transfer could be released today. Please share the UTR or transaction reference once processed.

Do let me know if anything is pending from our side.

Warm regards,
{{signature}}`,
    whatsappBody: `Hello {{greeting_name}}, this is {{coordinator_name}}.

The payment of {{amount}} is due today ({{due_date}}). Could you please confirm if it is being released today?

Kindly share the UTR once done. Thank you!`,
  },
  {
    key: 'overdue_reminder',
    label: 'Overdue follow-up',
    description: 'Due date has passed and the amount is still open.',
    subject: 'Overdue payment - {{amount}} pending since {{due_date}}',
    emailBody: `Dear {{greeting_name}},

Our records show that a payment of {{amount}} against {{customer_name}} was due on {{due_date}} and remains outstanding ({{days_overdue}} days overdue).

We request you to arrange the release at the earliest, or let us know an expected payment date so we can update our records accordingly.

If there is any discrepancy in the invoice or documentation, please let me know and I will get it resolved on priority.

Warm regards,
{{signature}}`,
    whatsappBody: `Hello {{greeting_name}}, this is {{coordinator_name}}.

Following up on {{amount}} which was due on {{due_date}} and is now {{days_overdue}} days overdue.

Could you please share an expected payment date? Happy to help if anything is pending from our end.`,
  },
  {
    key: 'final_notice',
    label: 'Final notice (escalation)',
    description: 'Long overdue; signals escalation.',
    subject: 'Urgent: {{amount}} overdue by {{days_overdue}} days',
    emailBody: `Dear {{greeting_name}},

Despite our earlier reminders, the payment of {{amount}} against {{customer_name}} remains unpaid and is now {{days_overdue}} days past the due date of {{due_date}}.

We request you to treat this as urgent and confirm the payment date by return. In the absence of a response, we will have to escalate this internally for further action.

We value our association and would prefer to resolve this amicably.[[ Please do call me on {{coordinator_phone}} if you would like to discuss.]]

Regards,
{{signature}}`,
    whatsappBody: `Hello {{greeting_name}}, this is {{coordinator_name}}.

The payment of {{amount}} is now {{days_overdue}} days overdue despite earlier reminders.

Kindly confirm a payment date today so I can avoid escalating this internally.[[ You can reach me on {{coordinator_phone}}.]]`,
  },
  {
    key: 'payment_thanks',
    label: 'Thank you (payment received)',
    description: 'Acknowledge a payment that has landed.',
    subject: 'Payment received - thank you',
    emailBody: `Dear {{greeting_name}},

We confirm receipt of {{amount}} against {{customer_name}}. Thank you for the prompt settlement.

Please do reach out if you need any supporting documentation for your records.

Warm regards,
{{signature}}`,
    whatsappBody: `Hello {{greeting_name}}, this is {{coordinator_name}}.

We have received {{amount}}. Thank you for the prompt payment!

Let me know if you need any documents for your records.`,
  },
]

export function getTemplate(key: TemplateKey): MessageTemplate {
  return MESSAGE_TEMPLATES.find((t) => t.key === key) ?? MESSAGE_TEMPLATES[0]
}

/**
 * Picks the template that matches where the account currently stands, so the
 * coordinator starts from the right tone instead of choosing every time.
 */
export function suggestTemplate(context: {
  daysOverdue?: number
  dueDate?: string | null
  isSettled?: boolean
}): TemplateKey {
  if (context.isSettled) return 'payment_thanks'

  const overdue = context.daysOverdue ?? 0
  if (overdue > 60) return 'final_notice'
  if (overdue > 0) return 'overdue_reminder'
  if (overdue === 0 && context.dueDate) return 'due_today'
  return 'gentle_reminder'
}

function buildVariables(context: MessageContext): Record<string, string> {
  const signature = context.senderOrg?.trim()
    ? `${context.coordinatorName}\n${context.senderOrg.trim()}`
    : context.coordinatorName

  return {
    // Address a named person when we have one; fall back to the business.
    greeting_name: context.contactPerson?.trim() || context.customerName,
    customer_name: context.customerName,
    amount: formatCurrency(context.amount),
    due_date: context.dueDate ? formatDate(context.dueDate) : 'the agreed date',
    invoice_date: context.invoiceDate ? formatDate(context.invoiceDate) : '-',
    payment_terms: context.paymentTerms?.trim() || 'the agreed credit period',
    bp_code: context.bpCode ?? '-',
    days_overdue: String(Math.max(0, context.daysOverdue ?? 0)),
    coordinator_name: context.coordinatorName,
    coordinator_phone: context.coordinatorPhone?.trim() ?? '',
    signature,
  }
}

/**
 * Substitutes `{{placeholder}}` tokens.
 *
 * Text wrapped in `[[ ... ]]` is an optional segment: if any placeholder inside
 * it resolves to an empty value the whole segment is dropped, so a template can
 * offer "call me on {{coordinator_phone}}" without producing a dangling
 * sentence when no phone number is on file. Unknown tokens are left untouched
 * so a typo is visible rather than silently blanked.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  const substitute = (text: string) =>
    text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
    )

  const withoutEmptySegments = template.replace(
    /\[\[([\s\S]*?)\]\]/g,
    (_match, segment: string) => {
      const names = [...segment.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1])
      const hasBlank = names.some(
        (name) =>
          Object.prototype.hasOwnProperty.call(variables, name) && variables[name].trim() === ''
      )
      return hasBlank ? '' : segment
    }
  )

  return substitute(withoutEmptySegments)
}

export interface RenderedMessage {
  subject: string
  emailBody: string
  whatsappBody: string
}

export function renderMessage(key: TemplateKey, context: MessageContext): RenderedMessage {
  const template = getTemplate(key)
  const variables = buildVariables(context)

  return {
    subject: renderTemplate(template.subject, variables),
    emailBody: renderTemplate(template.emailBody, variables),
    whatsappBody: renderTemplate(template.whatsappBody, variables),
  }
}
