import { describe, expect, it } from 'vitest'
import { askAssistant, instructionFrom, type SystemSnapshot } from './knowledge'
import type { Company, Followup, OverduePayment, UserRole } from '@/lib/types'
import { toLocalISODate } from '@/lib/utils'

const TODAY = '2026-09-03'

function day(offset: number): string {
  const date = new Date(`${TODAY}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return toLocalISODate(date)
}

function company(overrides: Partial<Company> & { id: string }): Company {
  return {
    sap_bp_code: 'BP-1001',
    name: 'Balaji Print Pack',
    invoice_no: `INV/${overrides.id}`,
    contact_person: null,
    contact_number: '',
    email: null,
    payment_terms: '30 days',
    total_amount: 118000,
    invoice_date: day(-60),
    due_date: day(-30),
    status: 'overdue',
    assigned_coordinator_id: 'coord-1',
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: day(-60),
    updated_at: day(-60),
    ...overrides,
  } as Company
}

function ageing(overrides: Partial<OverduePayment> & { id: string }): OverduePayment {
  return {
    bp_code: 'BP-3001',
    customer_name: 'Meridian Foods',
    balance_due: 420000,
    due_0_30: 0,
    due_31_60: 120000,
    due_61_90: 0,
    due_91_120: 300000,
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
    status: 'critical',
    extra_fields: {},
    imported_at: day(-5),
    created_at: day(-5),
    updated_at: day(-5),
    ...overrides,
  }
}

function snapshot(role: UserRole, overrides: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    role,
    userId: role === 'coordinator' ? 'coord-1' : 'admin-1',
    userName: 'Tester',
    today: TODAY,
    companies: [],
    overduePayments: [],
    followups: [],
    commitments: [],
    coordinators: [
      { id: 'coord-1', full_name: 'Pragati Patel', email: 'pragati@gp3.com', username: 'pragati' },
      { id: 'coord-2', full_name: 'Diya Prajapati', email: 'diya@gp3.com', username: 'diya' },
    ],
    tasks: [],
    ...overrides,
  }
}

const factValue = (answer: ReturnType<typeof askAssistant>, label: string) =>
  answer.facts?.find((f) => f.label === label)?.value

describe('asking about a customer', () => {
  const base = { companies: [company({ id: 'c1' })] }

  it('answers by name', () => {
    const answer = askAssistant('how much does Balaji owe?', snapshot('coordinator', base))
    expect(answer.intent).toBe('customer')
    expect(answer.text).toContain('₹1,18,000')
  })

  it('answers by BP code', () => {
    const answer = askAssistant('BP-1001 status', snapshot('coordinator', base))
    expect(answer.intent).toBe('customer')
    expect(answer.text).toContain('Balaji Print Pack')
  })

  it('surfaces an outstanding promise', () => {
    const answer = askAssistant(
      'balaji',
      snapshot('coordinator', {
        ...base,
        commitments: [
          { bp_code: 'BP-1001', amount: 118000, committed_date: day(-2), coordinator_id: 'coord-1' },
        ],
      })
    )
    expect(factValue(answer, 'Promise')).toContain('already past')
  })

  it('is not fooled by a generic word two customers share', () => {
    // "Foods" alone must not resolve to Meridian.
    const answer = askAssistant(
      'foods',
      snapshot('admin', { overduePayments: [ageing({ id: 'o1' })] })
    )
    expect(answer.intent).not.toBe('customer')
  })

  it('tells an admin who owns the account', () => {
    const answer = askAssistant('balaji', snapshot('admin', base))
    expect(factValue(answer, 'Owned by')).toBe('Pragati Patel')
  })
})

describe('scoping answers to the person asking', () => {
  const twoBooks = {
    companies: [
      company({ id: 'c1' }),
      company({ id: 'c2', sap_bp_code: 'BP-2', name: 'Other Co', total_amount: 590000, assigned_coordinator_id: 'coord-2' }),
    ],
  }

  it('gives a coordinator only their own book', () => {
    const answer = askAssistant('how much is outstanding?', snapshot('coordinator', twoBooks))
    expect(answer.text).toContain('₹1,18,000')
    expect(answer.text).toContain('You are chasing')
  })

  it('gives an admin the whole book', () => {
    const answer = askAssistant('how much is outstanding?', snapshot('admin', twoBooks))
    expect(answer.text).toContain('₹7,08,000')
    expect(answer.text).toContain('The company is owed')
  })

  it('will not reveal a colleague\'s customer to a coordinator', () => {
    const answer = askAssistant('tell me about Other Co', snapshot('coordinator', twoBooks))
    expect(answer.intent).not.toBe('customer')
  })
})

describe('ageing', () => {
  it('reports only the portion past 90 days', () => {
    const answer = askAssistant(
      'what is past 90 days?',
      snapshot('admin', { overduePayments: [ageing({ id: 'o1' })] })
    )
    // 3,00,000 in the 91-120 bucket, not the 4,20,000 balance.
    expect(answer.text).toContain('₹3,00,000')
    expect(answer.text).not.toContain('4,20,000')
    expect(answer.intent).toBe('ageing')
  })

  it('says so when nothing is that old', () => {
    const answer = askAssistant('anything critical?', snapshot('admin'))
    expect(answer.text).toContain('Nothing')
  })
})

describe('promises', () => {
  it('lists the ones that came due without payment', () => {
    const answer = askAssistant(
      'who broke a promise?',
      snapshot('admin', {
        companies: [company({ id: 'c1' })],
        commitments: [
          { bp_code: 'BP-1001', amount: 118000, committed_date: day(-2), coordinator_id: 'coord-1' },
        ],
      })
    )
    expect(answer.text).toContain('1 promise')
    expect(answer.facts?.[0].label).toBe('Balaji Print Pack')
  })
})


describe('the team', () => {
  it('breaks the book down by coordinator for the admin', () => {
    const answer = askAssistant(
      'how is the team doing?',
      snapshot('admin', {
        companies: [
          company({ id: 'c1' }),
          company({ id: 'c2', sap_bp_code: 'BP-2', name: 'Other Co', total_amount: 236000, assigned_coordinator_id: 'coord-2' }),
        ],
      })
    )
    expect(answer.intent).toBe('team')
    expect(answer.facts?.map((f) => f.label)).toContain('Pragati Patel')
  })

  it('answers about one colleague by name', () => {
    const answer = askAssistant(
      'how is Diya doing?',
      snapshot('admin', {
        companies: [company({ id: 'c2', sap_bp_code: 'BP-2', name: 'Other Co', total_amount: 236000, assigned_coordinator_id: 'coord-2' })],
      })
    )
    expect(answer.intent).toBe('coordinator')
    expect(answer.text).toContain('Diya')
  })
})

describe('honesty', () => {
  it('admits when it does not understand rather than guessing', () => {
    const answer = askAssistant('what is the weather in Mumbai', snapshot('coordinator'))
    expect(answer.intent).toBe('unknown')
    expect(answer.text).toContain('rather say so than guess')
  })

  it('offers what it can do when asked', () => {
    const answer = askAssistant('what can you do?', snapshot('team_leader'))
    expect(answer.intent).toBe('help')
    expect(factValue(answer, 'Try')).toBeTruthy()
  })

  it('treats an empty question as a request for help', () => {
    expect(askAssistant('   ', snapshot('admin')).intent).toBe('help')
  })
})

describe('the team leader messaging a coordinator', () => {
  const ROSTER = [
    { id: 'coord-1', full_name: 'Pragati Patel', email: 'pragati@gp3.com', username: 'pragati', module: 'GP3' },
    { id: 'coord-8', full_name: 'Disha Chaudhari', email: 'disha.chaudhari@gp3.com', module: 'GP3' },
    { id: 'coord-10', full_name: 'Disha Acharya', email: 'disha.acharya@gp3.com', module: 'Pouchwale' },
    { id: 'coord-9', full_name: 'Vishva Vyas', email: 'vishva@gp3.com', module: 'Pouchwale' },
  ]
  const TEAM = snapshot('team_leader', {
    userName: 'Niki Patel',
    companies: [company({ id: 'c1' })],
    coordinators: ROSTER,
  })
  const to = (answer: { action?: { recipients: { id: string }[] } }) =>
    (answer.action?.recipients ?? []).map((r) => r.id)

  it('resolves the coordinator from a first name', () => {
    const answer = askAssistant('remind Pragati to chase Balaji', TEAM)

    expect(answer.intent).toBe('remind')
    expect(answer.action?.kind).toBe('remind')
    expect(to(answer)).toEqual(['coord-1'])
  })

  it('names the customer the message is about', () => {
    const answer = askAssistant('remind Pragati about Balaji Print Pack', TEAM)
    expect(answer.action?.subject).toBe('Balaji Print Pack')
    expect(answer.action?.message).toContain('Balaji Print Pack')
  })

  it('links to the record so the recipient lands on the account', () => {
    const withAgeing = { ...TEAM, overduePayments: [ageing({ id: 'o1', customer_name: 'Meridian Foods' })] }
    const answer = askAssistant('tell Pragati to chase Meridian Foods today', withAgeing)
    expect(answer.action?.link).toBe('/overdue?payment=o1')
  })

  it('sends the leader\'s own words, not a generated line', () => {
    const answer = askAssistant('tell Pragati to call Balaji Print Pack before 5pm today', TEAM)
    expect(answer.action?.message).toBe('call Balaji Print Pack before 5pm today')
  })

  it('falls back to naming the sender when no instruction was given', () => {
    const answer = askAssistant('tell Pragati', TEAM)
    expect(answer.action?.message).toContain('Niki Patel')
  })

  it('still works when no customer is named', () => {
    const answer = askAssistant('remind Pragati please', TEAM)
    expect(to(answer)).toEqual(['coord-1'])
    expect(answer.action?.subject).toBeNull()
  })

  it('refuses a first name two coordinators share', () => {
    // Sending a task to the wrong Disha is worse than asking again.
    const answer = askAssistant('remind Disha about the dispatch', TEAM)
    expect(answer.action).toBeUndefined()
    expect(answer.text).toContain('Name a coordinator in full')
  })

  it('accepts the full name that disambiguates them', () => {
    const answer = askAssistant('remind Disha Acharya about the dispatch', TEAM)
    expect(to(answer)).toEqual(['coord-10'])
  })

  it('does not let a coordinator message a colleague', () => {
    // Spread first so the coordinator role is not overwritten by TEAM's.
    const asCoordinator = { ...TEAM, role: 'coordinator' as const, userId: 'coord-1' }
    const answer = askAssistant('remind Pragati to chase Balaji', asCoordinator)
    expect(answer.action).toBeUndefined()
    expect(answer.intent).toBe('remind_denied')
    expect(answer.text).toContain('team leader')
  })

  it('does not mistake a message for a balance enquiry', () => {
    // "Balaji" is named, but the request is to task somebody.
    const answer = askAssistant('remind Pragati about Balaji', TEAM)
    expect(answer.intent).not.toBe('customer')
  })
})

describe('the team leader messaging everyone at once', () => {
  const ROSTER = [
    { id: 'coord-1', full_name: 'Pragati Patel', email: 'pragati@gp3.com', module: 'GP3' },
    { id: 'coord-8', full_name: 'Disha Chaudhari', email: 'disha.chaudhari@gp3.com', module: 'GP3' },
    { id: 'coord-10', full_name: 'Disha Acharya', email: 'disha.acharya@gp3.com', module: 'Pouchwale' },
    { id: 'coord-9', full_name: 'Vishva Vyas', email: 'vishva@gp3.com', module: 'Pouchwale' },
  ]
  const TEAM = snapshot('team_leader', { userName: 'Niki Patel', coordinators: ROSTER })
  const to = (answer: { action?: { recipients: { id: string }[] } }) =>
    (answer.action?.recipients ?? []).map((r) => r.id).sort()

  it('sends to every coordinator when the whole team is addressed', () => {
    for (const phrasing of [
      'tell everyone to log their daily entries by 6',
      'tell the team to log their daily entries by 6',
      'message all coordinators to log their daily entries by 6',
      'notify everybody to log their daily entries by 6',
    ]) {
      const answer = askAssistant(phrasing, TEAM)
      expect(to(answer)).toEqual(['coord-1', 'coord-10', 'coord-8', 'coord-9'])
      expect(answer.action?.message).toBe('log their daily entries by 6')
      expect(answer.action?.audience).toBe('the team')
    }
  })

  it('sends to one team when one team is named', () => {
    const answer = askAssistant('tell the GP3 team month end closes on Friday', TEAM)
    expect(to(answer)).toEqual(['coord-1', 'coord-8'])
    expect(answer.action?.audience).toBe('the GP3 team')
    expect(answer.action?.message).toBe('month end closes on Friday')
  })

  it('says how many people it went to', () => {
    const answer = askAssistant('tell the team to call their top account today', TEAM)
    expect(answer.text).toContain('4 coordinators')
    expect(answer.facts?.find((f) => f.label === 'Who exactly')?.value).toContain('Vishva Vyas')
  })

  it('will not let a coordinator broadcast', () => {
    const asCoordinator = { ...TEAM, role: 'coordinator' as const, userId: 'coord-1' }
    expect(askAssistant('tell everyone to log their entries', asCoordinator).action).toBeUndefined()
  })
})

describe('instructionFrom', () => {
  it('keeps the instruction and drops the addressing', () => {
    expect(instructionFrom('tell Pragati to call Balaji before five', ['Pragati Patel', 'Pragati', 'Patel'])).toBe(
      'call Balaji before five'
    )
    expect(instructionFrom('please tell the team month end is Friday', ['the team'])).toBe('month end is Friday')
    expect(instructionFrom('let the team know that the target moved', ['the team'])).toBe('the target moved')
    expect(instructionFrom('can you message Vishva: send me the ageing file', ['Vishva Vyas', 'Vishva'])).toBe(
      'send me the ageing file'
    )
  })

  it('passes the words on exactly as they were typed', () => {
    // Stripping the addressing twice would eat the article and reword it.
    expect(
      instructionFrom('tell the Pouchwale team the month end file is due Friday', [
        'the Pouchwale team',
        'Pouchwale team',
        'Pouchwale',
      ])
    ).toBe('the month end file is due Friday')
    expect(instructionFrom('tell the team the target moved to 40 lakh', ['the team'])).toBe(
      'the target moved to 40 lakh'
    )
  })

  it('comes back empty when nothing but the addressing was said', () => {
    expect(instructionFrom('remind Pragati', ['Pragati Patel', 'Pragati', 'Patel'])).toBe('')
    expect(instructionFrom('tell everyone', ['everyone'])).toBe('')
  })
})
