/**
 * Deep links into WhatsApp and the coordinator's mail client.
 *
 * Nothing is sent from the app: each helper produces a URL that opens the
 * channel with the message pre-filled, so the coordinator reviews and presses
 * send in a session they are already signed into.
 */

export type EmailProvider = 'gmail' | 'outlook' | 'default'

export const EMAIL_PROVIDERS: { value: EmailProvider; label: string; hint: string }[] = [
  { value: 'gmail', label: 'Gmail', hint: 'Opens Gmail compose in your browser' },
  { value: 'outlook', label: 'Outlook web', hint: 'Opens Outlook compose in your browser' },
  { value: 'default', label: 'Default mail app', hint: 'Opens Outlook desktop, Mail, etc.' },
]

const EMAIL_PROVIDER_KEY = 'crm.messaging.emailProvider'
const SENDER_ORG_KEY = 'crm.messaging.senderOrg'

/** India, since the CRM is used from there; override per number if needed. */
export const DEFAULT_COUNTRY_CODE = '91'

/**
 * Reduces a phone number to the digits-with-country-code form wa.me needs.
 *
 * Handles the shapes that arrive from spreadsheets: "+91 98765 43210",
 * "098765-43210", "9876543210", "0091 9876543210".
 */
export function normalizePhoneForWhatsApp(
  raw: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  if (!raw) return null

  // Some sheets hold several numbers in one cell; use the first.
  const first = String(raw).split(/[,;/]/)[0]
  let digits = first.replace(/\D/g, '')
  if (!digits) return null

  // 00-prefixed international form.
  if (digits.startsWith('00')) digits = digits.slice(2)

  // Trunk prefix on a local number, e.g. 09876543210.
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  // Bare local number: prepend the country code.
  if (digits.length === 10) digits = `${countryCode}${digits}`

  // Anything outside a plausible E.164 range is more likely a bad cell.
  if (digits.length < 10 || digits.length > 15) return null

  return digits
}

/**
 * The stored form of a phone number: E.164 with the plus, or null.
 *
 * Uploads run every contact number through this so imported and seeded rows
 * look the same; a sheet that held "+91 98765 43210" and one that held
 * 919876543210 both end up as +919876543210.
 */
export function normalizePhoneForStorage(raw: string | null | undefined): string | null {
  const digits = normalizePhoneForWhatsApp(raw)
  return digits ? `+${digits}` : null
}

/** Loose check that an address is usable before we open a compose window. */
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export function buildEmailUrl(
  provider: EmailProvider,
  to: string,
  subject: string,
  body: string
): string {
  const recipient = to.trim()

  switch (provider) {
    case 'gmail':
      return (
        'https://mail.google.com/mail/?view=cm&fs=1' +
        `&to=${encodeURIComponent(recipient)}` +
        `&su=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`
      )
    case 'outlook':
      return (
        'https://outlook.office.com/mail/deeplink/compose' +
        `?to=${encodeURIComponent(recipient)}` +
        `&subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`
      )
    default:
      return (
        `mailto:${encodeURIComponent(recipient)}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`
      )
  }
}

/**
 * Opens a channel in a new tab.
 *
 * `mailto:` is handed to the current window instead: browsers hand it to the OS
 * and a popup tab would be left blank.
 */
export function openChannel(url: string): void {
  if (url.startsWith('mailto:')) {
    window.location.href = url
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/* ===================== Per-user preferences ===================== */

export function getEmailProvider(): EmailProvider {
  try {
    const stored = localStorage.getItem(EMAIL_PROVIDER_KEY)
    if (stored === 'gmail' || stored === 'outlook' || stored === 'default') return stored
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return 'gmail'
}

export function setEmailProvider(provider: EmailProvider): void {
  try {
    localStorage.setItem(EMAIL_PROVIDER_KEY, provider)
  } catch {
    // Preference is a convenience only.
  }
}

/** Organisation name appended to the sign-off; blank means name only. */
export function getSenderOrg(): string {
  try {
    return localStorage.getItem(SENDER_ORG_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setSenderOrg(value: string): void {
  try {
    localStorage.setItem(SENDER_ORG_KEY, value.trim())
  } catch {
    // Ignore.
  }
}
