import { beforeEach, describe, expect, it } from 'vitest'

import {
  customerAttention,
  customerInvoiceIds,
  customerOfInvoice,
  customerReminderAmount,
  daysPastDue,
  groupCustomers,
  invoiceValue,
} from './customer-accounts'
import { customerStillOpen } from './customer-open'
import { demoCompanyStore } from './demo-companies'
import { addFollowup, editFollowup, getFollowupCommitments, getFollowupsForInvoices } from './followups-api'
import { renderMessage, suggestTemplate } from './message-templates'
import type { Company, Followup } from './types'
import { addDaysISO, todayISO } from './utils'

const TODAY = '2026-11-21'
const invoice = (id: string, balance: number, due: string | null, o: Partial<Company> = {}): Company =>
  ({
    id,
    sap_bp_code: 'C0001',
    name: 'Mine Ltd',
    invoice_no: id,
    total_amount: balance,
    due_date: due,
    invoice_date: '2026-10-01',
    status: 'current',
    assigned_coordinator_id: 'coord-1',
    extra_fields: { 'Invoice Total': String(balance) },
    no_followup_at: null,
    bankrupt_declared_at: null,
    ...o,
  }) as Company

describe('the customer figures', () => {
  it('splits the money exactly on the day lines', () => {
    const [c] = groupCustomers(
      [
        invoice('yesterday', 100.1, '2026-11-20', { extra_fields: { 'Invoice Total': '1,000.10' } }),
        invoice('today', 200.2, '2026-11-21'),
        invoice('plus7', 300.3, '2026-11-28'),
        invoice('plus8', 400.4, '2026-11-29'),
        invoice('nodate', 50, null),
      ],
      TODAY
    )
    expect(c.invoices).toHaveLength(5)
    expect(c.totalAmount).toBe(1951)
    expect(c.outstanding).toBe(1051)
    expect(c.overdue).toBe(100.1)
    expect(c.overdueIn7Days).toBe(500.5)
    expect([c.overdueInvoices, c.overdueIn7DaysInvoices]).toEqual([1, 2])
    expect(c.oldestDueDate).toBe('2026-11-20')
    expect(c.maxDaysOverdue).toBe(1)
    expect(c.lead.id).toBe('plus8')
  })

  it('keeps customers apart by code, in the order they first appear, oldest invoice first', () => {
    const rows = groupCustomers(
      [
        invoice('b2', 1, '2026-12-01', { sap_bp_code: 'c0002 ', name: 'B' }),
        invoice('a', 1, '2026-12-01'),
        invoice('b1', 1, '2026-11-01', { sap_bp_code: 'C0002', name: 'B' }),
        invoice('none', 1, '2026-11-01', { sap_bp_code: null, name: 'No code' }),
      ],
      TODAY
    )
    expect(rows.map((c) => c.code)).toEqual(['C0002', 'C0001', null])
    expect(rows[0].invoices.map((i) => i.id)).toEqual(['b1', 'b2'])
  })

  it('reads the full value from the file, or the balance when the file gave none', () => {
    expect(invoiceValue(invoice('x', 40, null, { extra_fields: { 'Invoice Total': '100' } }))).toBe(100)
    expect(invoiceValue(invoice('x', 40, null, { extra_fields: {} }))).toBe(40)
  })

  it('counts days past due only once the date has passed', () => {
    expect(daysPastDue('2026-11-21', TODAY)).toBe(0)
    expect(daysPastDue('2026-11-22', TODAY)).toBe(0)
    expect(daysPastDue('2026-10-22', TODAY)).toBe(30)
  })

  it('asks a reminder for the overdue money, or all of it when nothing is overdue', () => {
    const [late] = groupCustomers([invoice('a', 10, '2026-11-01'), invoice('b', 90, '2026-12-01')], TODAY)
    expect(customerReminderAmount(late)).toBe(10)
    const [early] = groupCustomers([invoice('b', 90, '2026-12-01')], TODAY)
    expect(customerReminderAmount(early)).toBe(90)
  })

  it('takes the most urgent invoice as the customer attention', () => {
    const [c] = groupCustomers(
      [invoice('soon', 5000, '2026-11-23', { status: 'upcoming' }), invoice('old', 5000, '2026-08-01', { status: 'critical' })],
      TODAY
    )
    expect(customerAttention(c, TODAY)?.reason).toBe('critical')
  })
})

describe('the whole customer behind an invoice', () => {
  const all = [
    invoice('open1', 10, '2026-11-01'),
    invoice('open2', 20, '2026-12-01'),
    invoice('paid', 0, '2026-10-01', { status: 'paid' }),
    invoice('aside', 30, '2026-10-01', { no_followup_at: '2026-11-01T00:00:00Z' } as Partial<Company>),
    invoice('theirs', 40, '2026-12-01', { assigned_coordinator_id: 'coord-2' }),
    invoice('other', 50, '2026-12-01', { sap_bp_code: 'C0002' }),
  ]

  it('holds only open invoices being chased', () => {
    expect(customerOfInvoice(all[0], all, { today: TODAY })?.invoices.map((i) => i.id)).toEqual(['open1', 'open2', 'theirs'])
  })

  it("does not show a coordinator another coordinator's invoice", () => {
    expect(customerOfInvoice(all[0], all, { sameOwnerOnly: true, today: TODAY })?.invoices.map((i) => i.id)).toEqual(['open1', 'open2'])
  })

  it('leaves a paid or set-aside invoice on its own view', () => {
    expect(customerOfInvoice(all[2], all)).toBeNull()
    expect(customerOfInvoice(all[3], all)).toBeNull()
  })

  it('keeps the history of paid and set-aside invoices with the customer', () => {
    expect(customerInvoiceIds(all[0], all)).toEqual(['open1', 'open2', 'paid', 'aside', 'theirs'])
  })

  it('is open while one invoice is', () => {
    expect(customerStillOpen('c0001', all)).toBe(true)
    expect(customerStillOpen('C0001', [all[2], all[3]])).toBe(false)
    expect(customerStillOpen(null, all)).toBe(false)
  })
})

describe('one follow-up for the customer', () => {
  const today = todayISO()
  const base = {
    entity_type: 'company' as const,
    coordinator_id: 'coord-1',
    followup_date: new Date().toISOString(),
    mode: 'call' as const,
    notes: 'Spoke to accounts',
    customer_response: null,
    committed_date: null,
    committed_amount: null,
    next_reminder_date: null,
    proof_attachment_url: null,
  }

  beforeEach(() => {
    demoCompanyStore.replaceAll({ companies: [], followups: [], overduePayments: [] })
    demoCompanyStore.upsertCompany(invoice('w1', 100, addDaysISO(today, -10), { status: 'overdue' }))
    demoCompanyStore.upsertCompany(invoice('w2', 200, addDaysISO(today, 20)))
  })

  it('marked Paid closes no invoice, because only the Excel file does', async () => {
    await addFollowup({ ...base, entity_id: 'w2', status: 'paid', customer_wide: true })
    expect(demoCompanyStore.getCompanyById('w2')?.status).toBe('current')
    expect(demoCompanyStore.getCompanyById('w1')?.status).toBe('overdue')
  })

  it('an old invoice follow-up still behaves as it did', async () => {
    await addFollowup({ ...base, entity_id: 'w1', status: 'paid' })
    expect(demoCompanyStore.getCompanyById('w1')?.status).toBe('paid')
  })

  it('keeps its promise and reminder when the invoice it is filed on is paid and another is open', async () => {
    const yesterday = addDaysISO(today, -1)
    await addFollowup({ ...base, entity_id: 'w2', status: 'pending', customer_wide: true, committed_date: yesterday, committed_amount: 50, next_reminder_date: yesterday })
    demoCompanyStore.settleCompanies(['w2'])
    expect(demoCompanyStore.getOverdueCommitments('coord-1')).toHaveLength(1)
    expect(demoCompanyStore.getFollowupsDue('coord-1')).toHaveLength(1)
    expect(await getFollowupCommitments()).toHaveLength(1)
    demoCompanyStore.settleCompanies(['w1'])
    expect(demoCompanyStore.getOverdueCommitments('coord-1')).toHaveLength(0)
    expect(demoCompanyStore.getFollowupsDue('coord-1')).toHaveLength(0)
    expect(await getFollowupCommitments()).toHaveLength(0)
  })

  it('shows every invoice follow-up together, newest first, and an edit stays on its record', async () => {
    const one = (await addFollowup({ ...base, id: 'fu-one', entity_id: 'w1', status: 'pending' })) as Followup
    await addFollowup({ ...base, id: 'fu-two', entity_id: 'w2', status: 'pending', customer_wide: true })
    expect((await getFollowupsForInvoices(['w1', 'w2'])).map((f) => f.id).sort()).toEqual(['fu-one', 'fu-two'])
    await editFollowup(one.id, { notes: 'Corrected' }, 'coord-1')
    const edited = demoCompanyStore.getAllFollowups().find((f) => f.id === 'fu-one')
    expect(edited).toMatchObject({ entity_id: 'w1', notes: 'Corrected' })
  })
})

describe('a reminder for several invoices', () => {
  const context = { customerName: 'Mine Ltd', amount: 1000, dueDate: '2026-08-05', daysOverdue: 108, coordinatorName: 'Diya' }

  it('says the date is the oldest and the days are the most', () => {
    const body = renderMessage('overdue_reminder', { ...context, invoiceCount: 14 }).whatsappBody
    expect(body).toContain('onwards (14 invoices)')
    expect(body).toContain('up to 108 days overdue')
  })

  it('reads as before for one invoice', () => {
    const body = renderMessage('overdue_reminder', { ...context, invoiceCount: 1 }).whatsappBody
    expect(body).not.toContain('onwards')
    expect(body).toContain('now 108 days overdue')
  })

  it('does not tell a customer it is due today when it is not', () => {
    expect(suggestTemplate({ daysOverdue: 0, dueDate: '2026-12-01', notDueYet: true })).toBe('gentle_reminder')
  })
})
