import { describe, it, expect } from 'vitest'

import {
  buildEmailUrl,
  buildWhatsAppUrl,
  isValidEmail,
  normalizePhoneForWhatsApp,
} from './messaging'
import { renderMessage, renderTemplate, suggestTemplate } from './message-templates'

describe('normalizePhoneForWhatsApp', () => {
  it('keeps a number that already carries a country code', () => {
    expect(normalizePhoneForWhatsApp('+919876543210')).toBe('919876543210')
    expect(normalizePhoneForWhatsApp('+91 98765 43210')).toBe('919876543210')
  })

  it('adds the country code to a bare local number', () => {
    expect(normalizePhoneForWhatsApp('9876543210')).toBe('919876543210')
    expect(normalizePhoneForWhatsApp('98765-43210')).toBe('919876543210')
  })

  it('strips a trunk prefix and the 00 international prefix', () => {
    expect(normalizePhoneForWhatsApp('09876543210')).toBe('919876543210')
    expect(normalizePhoneForWhatsApp('0091 9876543210')).toBe('919876543210')
  })

  it('uses the first number when a cell holds several', () => {
    expect(normalizePhoneForWhatsApp('9876543210, 9123456780')).toBe('919876543210')
    expect(normalizePhoneForWhatsApp('9876543210 / 9123456780')).toBe('919876543210')
  })

  it('honours a different country code', () => {
    expect(normalizePhoneForWhatsApp('2025550143', '1')).toBe('12025550143')
  })

  it('rejects anything that cannot be a phone number', () => {
    expect(normalizePhoneForWhatsApp('')).toBeNull()
    expect(normalizePhoneForWhatsApp(null)).toBeNull()
    expect(normalizePhoneForWhatsApp('N/A')).toBeNull()
    expect(normalizePhoneForWhatsApp('12345')).toBeNull()
    expect(normalizePhoneForWhatsApp('1234567890123456789')).toBeNull()
  })
})

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('accounts@customer.com')).toBe(true)
    expect(isValidEmail(' finance@sub.domain.co.in ')).toBe(true)
  })

  it('rejects malformed ones', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing@domain')).toBe(false)
  })
})

describe('channel URLs', () => {
  it('builds a wa.me link with the message encoded', () => {
    const url = buildWhatsAppUrl('919876543210', 'Hello Priya & team, ₹1,000 due')
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true)
    // The ampersand must be escaped or it would truncate the message.
    expect(url).not.toContain('& team')
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hello Priya & team, ₹1,000 due')
  })

  it('builds provider-specific compose links', () => {
    const gmail = buildEmailUrl('gmail', 'a@b.com', 'Subject line', 'Body text')
    expect(gmail).toContain('mail.google.com')
    expect(gmail).toContain('su=Subject%20line')

    const outlook = buildEmailUrl('outlook', 'a@b.com', 'Subject line', 'Body text')
    expect(outlook).toContain('outlook.office.com')
    expect(outlook).toContain('subject=Subject%20line')

    const fallback = buildEmailUrl('default', 'a@b.com', 'Subject line', 'Body text')
    expect(fallback.startsWith('mailto:')).toBe(true)
    expect(fallback).toContain('subject=Subject%20line')
  })
})

describe('renderTemplate', () => {
  it('substitutes known placeholders and tolerates whitespace', () => {
    expect(renderTemplate('Hi {{name}} and {{ other }}', { name: 'A', other: 'B' })).toBe('Hi A and B')
  })

  it('leaves unknown placeholders untouched rather than blanking them', () => {
    expect(renderTemplate('Hi {{name}} {{unknown}}', { name: 'A' })).toBe('Hi A {{unknown}}')
  })

  it('drops an optional segment when its data is missing', () => {
    const template = 'Please pay.[[ Call me on {{coordinator_phone}}.]]'

    expect(renderTemplate(template, { coordinator_phone: '+919876543210' })).toBe(
      'Please pay. Call me on +919876543210.'
    )
    expect(renderTemplate(template, { coordinator_phone: '' })).toBe('Please pay.')
  })
})

describe('suggestTemplate', () => {
  it('escalates as the account ages', () => {
    expect(suggestTemplate({ daysOverdue: 0, dueDate: '2026-06-15' })).toBe('due_today')
    expect(suggestTemplate({ daysOverdue: 10 })).toBe('overdue_reminder')
    expect(suggestTemplate({ daysOverdue: 90 })).toBe('final_notice')
  })

  it('defaults to a gentle nudge before the due date', () => {
    expect(suggestTemplate({})).toBe('gentle_reminder')
  })

  it('thanks the customer once settled', () => {
    expect(suggestTemplate({ daysOverdue: 90, isSettled: true })).toBe('payment_thanks')
  })
})

describe('renderMessage', () => {
  const context = {
    customerName: 'Balaji Print Pack',
    contactPerson: 'Rajiv Mehra',
    amount: 250000,
    dueDate: '2026-08-31',
    paymentTerms: '60 days',
    daysOverdue: 12,
    coordinatorName: 'Priya Sharma',
    coordinatorPhone: '+919876543210',
  }

  it('fills the customer details into both channels', () => {
    const message = renderMessage('overdue_reminder', context)

    expect(message.subject).toContain('₹2,50,000')
    expect(message.emailBody).toContain('Rajiv Mehra')
    expect(message.emailBody).toContain('Balaji Print Pack')
    expect(message.emailBody).toContain('12 days overdue')
    expect(message.whatsappBody).toContain('Priya Sharma')
    expect(message.whatsappBody).toContain('₹2,50,000')
  })

  it('leaves no placeholder unresolved', () => {
    for (const key of ['gentle_reminder', 'due_today', 'overdue_reminder', 'final_notice', 'payment_thanks'] as const) {
      const message = renderMessage(key, context)
      expect(message.subject).not.toContain('{{')
      expect(message.emailBody).not.toContain('{{')
      expect(message.whatsappBody).not.toContain('{{')
    }
  })

  it('addresses the business when no contact person is known', () => {
    const message = renderMessage('gentle_reminder', { ...context, contactPerson: null })
    expect(message.emailBody).toContain('Dear Balaji Print Pack')
  })

  it('appends the organisation to the sign-off only when provided', () => {
    const withOrg = renderMessage('gentle_reminder', { ...context, senderOrg: 'GP3 Industries' })
    const withoutOrg = renderMessage('gentle_reminder', { ...context, senderOrg: '  ' })

    expect(withOrg.emailBody).toContain('Priya Sharma\nGP3 Industries')
    expect(withoutOrg.emailBody).toContain('Priya Sharma')
    expect(withoutOrg.emailBody).not.toContain('GP3 Industries')
  })

  it('omits the "call me" offer when no coordinator phone is known', () => {
    const withPhone = renderMessage('final_notice', context)
    const withoutPhone = renderMessage('final_notice', { ...context, coordinatorPhone: null })

    expect(withPhone.whatsappBody).toContain('+919876543210')
    expect(withoutPhone.whatsappBody).not.toContain('reach me on')
    expect(withoutPhone.whatsappBody).not.toContain('{{')
    expect(withoutPhone.emailBody).not.toContain('call me on')
  })

  it('falls back gracefully when dates and terms are missing', () => {
    const message = renderMessage('gentle_reminder', {
      customerName: 'Nova Mills',
      amount: 1000,
      coordinatorName: 'Priya Sharma',
    })

    expect(message.emailBody).toContain('the agreed date')
    expect(message.emailBody).toContain('the agreed credit period')
  })
})
