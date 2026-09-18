import { describe, expect, it } from 'vitest'
import { formatCurrency, parseCurrency, parseCurrencyStrict } from './utils'

describe('parseCurrencyStrict', () => {
  it('reads plain, Indian-formatted and suffixed amounts', () => {
    expect(parseCurrencyStrict('550000')).toBe(550000)
    expect(parseCurrencyStrict('₹ 1,20,500')).toBe(120500)
    expect(parseCurrencyStrict('1.8L')).toBe(180000)
    expect(parseCurrencyStrict('2.5 cr')).toBe(25000000)
    expect(parseCurrencyStrict('50k')).toBe(50000)
    expect(parseCurrencyStrict(275000)).toBe(275000)
  })

  it('refuses a blank cell rather than calling it zero', () => {
    expect(parseCurrencyStrict('')).toBeNull()
    expect(parseCurrencyStrict('   ')).toBeNull()
    expect(parseCurrencyStrict(null)).toBeNull()
    expect(parseCurrencyStrict(undefined)).toBeNull()
  })

  it('refuses text and half-numbers', () => {
    expect(parseCurrencyStrict('abc')).toBeNull()
    expect(parseCurrencyStrict('12abc')).toBeNull()
    expect(parseCurrencyStrict('N/A')).toBeNull()
    expect(parseCurrencyStrict(NaN)).toBeNull()
  })

  it('keeps zero and negatives as numbers so the caller can judge them', () => {
    expect(parseCurrencyStrict('0')).toBe(0)
    expect(parseCurrencyStrict('-5000')).toBe(-5000)
  })
})

describe('parseCurrency (lenient)', () => {
  it('still answers 0 for the unreadable, for callers that want a number no matter what', () => {
    expect(parseCurrency('')).toBe(0)
    expect(parseCurrency('abc')).toBe(0)
    expect(parseCurrency('₹ 1,20,500')).toBe(120500)
  })
})

describe('formatCurrency', () => {
  it('shows whole rupees, the way every screen reads money', () => {
    expect(formatCurrency(120500)).toBe('₹1,20,500')
    expect(formatCurrency(4419)).toBe('₹4,419')
    expect(formatCurrency(0)).toBe('₹0')
  })

  it('never prints a real balance as nothing', () => {
    /*
     * A part-payment leaves paise behind - the live file has ten invoices at 8
     * to 48 paise - and rounding those to "₹0" put rows on screen that read as
     * settled while still showing "33 days overdue" in red. Whatever the policy
     * on chasing them, the screen must not say the money is gone.
     */
    expect(formatCurrency(0.48)).toBe('₹0.48')
    expect(formatCurrency(0.08)).toBe('₹0.08')
    expect(formatCurrency(-0.17)).toBe('-₹0.17')
  })

  it('still rounds anything that survives rounding', () => {
    expect(formatCurrency(0.5)).toBe('₹1')
    expect(formatCurrency(1.4)).toBe('₹1')
  })

  it('shortens large figures when asked', () => {
    expect(formatCurrency(14840075, true)).toBe('₹1.5Cr')
    expect(formatCurrency(120500, true)).toBe('₹1.2L')
  })
})
