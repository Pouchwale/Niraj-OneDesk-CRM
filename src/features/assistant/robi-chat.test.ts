/**
 * Robi as a conversation: what was wrong on 1 Oct 2026, pinned down.
 *
 * "Tell the team and notify them that ..." reached nobody (stored in the
 * sender's browser), went out as "and notify them that ...", and any question
 * with "tell me" in it was taken for an order to message somebody.
 */
import { describe, expect, it } from 'vitest'

import type { OverduePayment, UserRole } from '@/lib/types'
import { splitSuggestions } from './ai-prompt'
import { askAssistant, buildAiContext, instructionFrom, isMessageRequest, type SystemSnapshot } from './knowledge'

const TODAY = '2026-10-01'

function snapshot(role: UserRole, overrides: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    role,
    userId: role === 'coordinator' ? 'coord-2' : 'admin-0',
    userName: 'System Administrator',
    today: TODAY,
    companies: [],
    overduePayments: [],
    followups: [],
    commitments: [],
    coordinators: [
      { id: 'coord-1', full_name: 'Pragati Patel', email: '', username: 'pragati' },
      { id: 'coord-2', full_name: 'Diya Prajapati', email: '', username: 'diya' },
      { id: 'coord-5', full_name: 'Krupa Patel', email: '', username: 'krupa' },
    ],
    tasks: [],
    ...overrides,
  }
}

function ageing(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'C0811',
    customer_name: 'AyuLabs Pvt. LTD.',
    balance_due: 354899,
    due_0_30: 354899,
    due_31_60: 0,
    due_61_90: 0,
    due_91_120: 0,
    due_121_plus: 0,
    payment_terms: null,
    contact_person: null,
    contact_number: null,
    email: null,
    coordinator_name: 'Diya',
    sales_person_name: null,
    department: null,
    account_type: null,
    followup_details: null,
    followup_timeline: null,
    assigned_coordinator_id: 'coord-2',
    status: 'overdue',
    extra_fields: {},
    imported_at: TODAY,
    created_at: TODAY,
    updated_at: TODAY,
    ...overrides,
  }
}

const ASKED = 'Tell the team and notify them that Each day, Robi AI will assign you your tasks and help you get them done. Please check it every morning, complete your assigned tasks by end of day'

describe('a message to the team', () => {
  it('drafts it for every coordinator, worded as the leader meant it, without sending', () => {
    const answer = askAssistant(ASKED, snapshot('admin'))
    expect(answer.intent).toBe('remind')
    expect(answer.action?.recipients.map((r) => r.id)).toEqual(['coord-1', 'coord-2', 'coord-5'])
    expect(answer.action?.message).toBe(
      'Each day, Robi AI will assign you your tasks and help you get them done. Please check it every morning, complete your assigned tasks by end of day'
    )
    // Nothing is claimed: the widget shows Send, and only Send sends.
    expect(answer.text).not.toMatch(/\bsent\b/i)
    expect(answer.text).toContain('press Send')
  })

  it('drops a second "and notify / let them know" from the front of the message', () => {
    expect(instructionFrom('tell the team and let them know that targets moved', ['the team'])).toBe('targets moved')
    expect(instructionFrom('tell Pragati and ask her to call Balaji', ['Pragati Patel', 'Pragati'])).toBe('to call Balaji'.replace(/^to /, ''))
  })
})

describe('a question is not an order to message somebody', () => {
  it('reads "tell me ..." and "remind me ..." as questions to Robi', () => {
    expect(isMessageRequest('Can you tell me why AyuLabs is missing?')).toBe(false)
    expect(isMessageRequest('tell me what is due today')).toBe(false)
    expect(isMessageRequest('remind me what I promised Balaji')).toBe(false)
    expect(isMessageRequest('let me know who is behind')).toBe(false)
  })

  it('still reads an instruction as one', () => {
    expect(isMessageRequest('tell Pragati to call Balaji before five')).toBe(true)
    expect(isMessageRequest('please tell the team month end is Friday')).toBe(true)
    expect(isMessageRequest(ASKED)).toBe(true)
  })

  it('answers a coordinator\'s "tell me" instead of refusing to send a message', () => {
    expect(askAssistant('tell me what is due today', snapshot('coordinator')).intent).not.toBe('remind_denied')
  })
})

describe('Robi can say why a customer is not in the lists', () => {
  it('names who set it aside, when and why', () => {
    const snap = snapshot('admin', {
      overduePayments: [
        ageing({ id: 'ovd-ayu', no_followup_at: '2026-09-18T12:12:07.662Z', no_followup_by: 'coord-5', no_followup_note: 'Diya Customer' }),
      ],
    })
    const context = buildAiContext('why is ayulabs not in our CRM?', snap)
    expect(context.setAside).toEqual([
      {
        customer: 'AyuLabs Pvt. LTD.',
        bpCode: 'C0811',
        reason: 'marked No follow-up',
        by: 'Krupa Patel',
        on: '2026-09-18',
        note: 'Diya Customer',
        amount: '₹3,54,899',
      },
    ])
    expect(context.setAsideCount).toBe(1)
  })

  it('does not call a set-aside customer "settled, ₹0" in its summary', () => {
    const snap = snapshot('admin', {
      overduePayments: [
        ageing({ id: 'ovd-ideas', bp_code: 'C0820', customer_name: 'Ideas Graphics', balance_due: 59000, due_0_30: 59000, no_followup_at: '2026-09-17T10:00:00.000Z', no_followup_by: 'coord-2', no_followup_note: 'due to this Machinery vendor.' }),
      ],
    })
    const customer = buildAiContext('why is Ideas Graphics not showing in overdue payments?', snap).customer
    expect(customer?.status).toContain('set aside - marked No follow-up by Diya Prajapati')
    expect(customer?.status).toContain('due to this Machinery vendor.')
    expect(customer?.status).not.toBe('settled')
    expect(customer?.outstanding).toBe('₹59,000')
  })

  it('says when the Excel file no longer carries it', () => {
    const snap = snapshot('admin', {
      overduePayments: [ageing({ id: 'ovd-axir', bp_code: 'C1117', customer_name: 'Axir Life Science', balance_due: 0, status: 'settled', updated_at: '2026-10-01T06:04:03.343Z' })],
    })
    expect(buildAiContext('where is Axir Life Science?', snap).goneFromExcel).toEqual([
      { customer: 'Axir Life Science', bpCode: 'C1117', lastChanged: '2026-10-01' },
    ])
  })

  it('lists the coordinator names nobody in the CRM answers to, for the leader', () => {
    const snap = snapshot('admin', {
      overduePayments: [ageing({ id: 'o1', assigned_coordinator_id: null, coordinator_name: 'other', balance_due: 15000000 })],
    })
    expect(buildAiContext('how much is under unknown names?', snap).unknownCoordinatorNames).toEqual([
      { name: 'other', accounts: 1, amount: '₹1,50,00,000' },
    ])
  })
})

describe('a question about one coordinator', () => {
  it('carries her own plan and only her own accounts', () => {
    const snap = snapshot('admin', {
      overduePayments: [
        ageing({ id: 'mine', customer_name: 'Otsuka Pharmaceutical', bp_code: 'C0500', assigned_coordinator_id: 'coord-2' }),
        ageing({ id: 'not-mine', customer_name: 'Flexo Art', bp_code: 'C0600', assigned_coordinator_id: null }),
      ],
      teamPlans: {
        'coord-2': {
          done: 0, total: 1, open: 1, carriedOver: 0, oldestCarried: null, date: TODAY,
          items: [{ account: 'Otsuka Pharmaceutical', status: 'open', nudge: 'Otsuka is critical for ₹88,500' }],
        },
      },
    })
    const block = buildAiContext('what should Diya do first today?', snap).coordinator
    expect(block?.name).toBe('Diya Prajapati')
    expect(block?.planToday.map((i) => i.account)).toEqual(['Otsuka Pharmaceutical'])
    expect(block?.accounts.map((a) => a.name)).toEqual(['Otsuka Pharmaceutical'])
  })
})

describe('suggestions at the end of a reply', () => {
  it('are taken off the text and offered as buttons', () => {
    const { text, suggestions } = splitSuggestions(
      'AyuLabs was set aside by Krupa on 18 Sept.\n>>> Who else did Krupa set aside? | Tell Diya to call AyuLabs today'
    )
    expect(text).toBe('AyuLabs was set aside by Krupa on 18 Sept.')
    expect(suggestions).toEqual(['Who else did Krupa set aside?', 'Tell Diya to call AyuLabs today'])
  })

  it('never show half a suggestion line while the reply is still arriving', () => {
    expect(splitSuggestions('Here is the answer.\n>>> Who el').text).toBe('Here is the answer.')
    expect(splitSuggestions('No suggestions here.').suggestions).toEqual([])
  })
})
