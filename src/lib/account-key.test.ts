import { describe, expect, it } from 'vitest'

import { accountKeyOf, invoiceKeyOf, sameInvoice } from './account-key'

/**
 * Two identities, and why they are not the same one.
 *
 * A customer is a BP code; an invoice is a BP code and a number. Active
 * Payments holds a record per invoice, so getting this wrong does not produce
 * an error — it silently merges two debts into one, or splits one into two,
 * and the totals stay plausible either way.
 */

describe('the customer key', () => {
  it('is the BP code however it was typed', () => {
    expect(accountKeyOf(' c1 ', 'Alpha')).toBe(accountKeyOf('C1', 'Alpha'))
  })

  it('falls back to the name when the file gives no code', () => {
    expect(accountKeyOf(null, ' Alpha Ltd ')).toBe(accountKeyOf('', 'alpha ltd'))
  })

  it('keeps two customers apart', () => {
    expect(accountKeyOf('C1', 'Alpha')).not.toBe(accountKeyOf('C2', 'Beta'))
  })
})

describe('the invoice key', () => {
  it('separates a customer’s invoices from each other', () => {
    expect(invoiceKeyOf('C1', 'INV-1', 'Alpha')).not.toBe(invoiceKeyOf('C1', 'INV-2', 'Alpha'))
  })

  it('carries the customer, because invoice numbers are reused', () => {
    /*
     * The one that would be a silent data loss. In the live file 26 numbers are
     * shared by different customers - invoice "27" belongs to both C0155 and
     * C0004 - so a key made of the number alone would merge two unrelated
     * debts, and one of them would disappear from the book.
     */
    expect(invoiceKeyOf('C0155', '27', 'One')).not.toBe(invoiceKeyOf('C0004', '27', 'Another'))
  })

  it('is the same invoice however the number was typed', () => {
    expect(invoiceKeyOf('C1', ' inv-1 ', 'Alpha')).toBe(invoiceKeyOf('c1', 'INV-1', 'Alpha'))
  })

  it('falls back to the customer when the file numbers nothing', () => {
    // A one-row-per-customer export must keep behaving as it always did,
    // rather than turning every row into a separate account.
    expect(invoiceKeyOf('C1', null, 'Alpha')).toBe(accountKeyOf('C1', 'Alpha'))
    expect(invoiceKeyOf('C1', '   ', 'Alpha')).toBe(accountKeyOf('C1', 'Alpha'))
  })
})

describe('comparing two rows', () => {
  it('matches the same invoice of the same customer', () => {
    expect(
      sameInvoice(
        { sap_bp_code: 'C1', invoice_no: 'INV-1', name: 'Alpha' },
        { sap_bp_code: 'c1', invoice_no: 'inv-1', name: 'Alpha Ltd' }
      )
    ).toBe(true)
  })

  it('does not match two invoices of one customer', () => {
    expect(
      sameInvoice(
        { sap_bp_code: 'C1', invoice_no: 'INV-1', name: 'Alpha' },
        { sap_bp_code: 'C1', invoice_no: 'INV-2', name: 'Alpha' }
      )
    ).toBe(false)
  })
})
