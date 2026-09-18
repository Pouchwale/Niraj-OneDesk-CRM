import { describe, expect, it } from 'vitest'
import { deskFor, fieldsOf } from './desk-layouts'
import { getRoster } from '@/features/auth/AuthContext'
import type { Profile } from '@/lib/types'

const byName = (name: string): Profile => {
  const found = getRoster().find((p) => p.full_name === name)
  if (!found) throw new Error(`No profile called ${name}`)
  return found
}

const fieldNames = (profile: Profile) => fieldsOf(deskFor(profile)).map((f) => f.name)

describe('who is asked for what', () => {
  it('gives every GP3 coordinator the order desk and Konica blocks', () => {
    for (const profile of getRoster().filter((p) => p.module === 'GP3')) {
      const names = fieldNames(profile)
      expect(names, profile.full_name).toContain('business_partners')
      expect(names, profile.full_name).toContain('konica_value')
      expect(names, profile.full_name).toContain('digital_quotations_converted')
    }
  })

  it('never shows a GP3 coordinator a Pouchwale desk field', () => {
    const names = fieldNames(byName('Pragati Patel'))
    expect(names).not.toContain('rfd_followup_calls')
    expect(names).not.toContain('production_planning')
  })

  it('puts Vishva on artworks', () => {
    const layout = deskFor(byName('Vishva Vyas'))
    expect(layout.name).toBe('Artworks @ Pouchwale')
    expect(fieldsOf(layout).map((f) => f.name)).toEqual([
      'business_partners',
      'item_masters',
      'calls_made',
      'so_po_cross_checks',
      'errors',
      'extraordinary_work',
    ])
  })

  it('puts Krina on orders', () => {
    const names = fieldNames(byName('Krina Shah'))
    expect(deskFor(byName('Krina Shah')).name).toBe('Orders @ Pouchwale')
    expect(names).toContain('payment_confirmations')
    expect(names).toContain('production_orders')
    expect(names).toContain('orders_without_payment_confirmation')
    expect(names).toContain('so_po_cross_checks')
    // Her sheet has the payment-chasing columns too.
    expect(names).toContain('overdue_calls')
  })

  it('puts Disha Acharya on updates, not the GP3 Disha', () => {
    const acharya = deskFor(byName('Disha Acharya'))
    expect(acharya.name).toBe('Updates @ Pouchwale')
    expect(fieldsOf(acharya).map((f) => f.name)).toContain('address_confirmations')

    // Same first name, different team, different form entirely.
    const chaudhari = deskFor(byName('Disha Chaudhari'))
    expect(chaudhari.name).toBe('Team GP3')
    expect(fieldsOf(chaudhari).map((f) => f.name)).not.toContain('address_confirmations')
  })

  it('puts Avani on dispatch', () => {
    const names = fieldNames(byName('Avani Patel'))
    expect(deskFor(byName('Avani Patel')).name).toBe('Dispatch @ Pouchwale')
    expect(names).toContain('rfd_followup_emails')
    expect(names).toContain('rfd_followup_calls')
    expect(names).toContain('complaints_received')
    expect(names).toContain('complaints_resolved')
  })

  it('does not ask a dispatch desk for sales figures it cannot know', () => {
    const names = fieldNames(byName('Avani Patel'))
    expect(names).not.toContain('quotations_given')
    expect(names).not.toContain('sales_amount')
    expect(names).not.toContain('fresh_leads')
  })

  it('falls back to the shared layout for a Pouchwale coordinator with no desk', () => {
    // Aniketa has no desk defined in the sheets supplied so far.
    const layout = deskFor(byName('Aniketa Jadav'))
    expect(layout.id).toBe('default')
    expect(fieldsOf(layout).map((f) => f.name)).toContain('payment_calls')
  })

  it('gives the leader and the administrator no coordinator form', () => {
    for (const name of ['Niki Patel', 'System Administrator']) {
      expect(deskFor(byName(name)).id).toBe('default')
    }
  })

  it('never repeats a field name inside one layout', () => {
    // A duplicate would make two inputs write to the same value.
    for (const profile of getRoster()) {
      const names = fieldNames(profile)
      expect(new Set(names).size, profile.full_name).toBe(names.length)
    }
  })
})

describe('desks assigned from the admin panel', () => {
  const pouchwale = (desk: Profile['desk']): Profile => ({
    id: 'user-new',
    email: 'new@gp3.com',
    full_name: 'New Person',
    role: 'coordinator',
    module: 'Pouchwale',
    desk,
    relation_manager_name: 'New Person',
    created_at: '',
    updated_at: '',
  })

  it('seats a newly created coordinator by the desk on her profile, not her id', () => {
    // Desks were keyed to the four seeded ids, so anyone added later always
    // got the generic form no matter what the administrator intended.
    expect(deskFor(pouchwale('dispatch')).name).toBe('Dispatch @ Pouchwale')
    expect(deskFor(pouchwale('artworks')).name).toBe('Artworks @ Pouchwale')
  })

  it('gives the shared form to a Pouchwale coordinator with no desk yet', () => {
    expect(deskFor(pouchwale(null)).id).toBe('default')
  })

  it('still seats the seeded four with no desk saved on an old roster', () => {
    const legacy = { ...byName('Krina Shah'), desk: undefined }
    expect(deskFor(legacy).name).toBe('Orders @ Pouchwale')
  })

  it('ignores a desk on a GP3 coordinator', () => {
    expect(deskFor({ ...pouchwale('orders'), module: 'GP3' }).name).toBe('Team GP3')
  })
})
