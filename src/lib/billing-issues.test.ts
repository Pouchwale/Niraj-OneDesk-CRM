import { beforeEach, describe, expect, it } from 'vitest'

import { billingIssueScore, billingIssuesFromSheet, billingScores, nextBillingSrNo, pickDate, resolveResponsible, sheetDateCandidates } from './billing-issues'
import { demoCompanyStore } from './demo-companies'
import type { BillingIssue } from './types'

function issue(overrides: Partial<BillingIssue> = {}): BillingIssue {
  return {
    id: 'b-1',
    sr_no: 0,
    date: '2026-11-03',
    responsible_1: 'coord-1',
    responsible_2: null,
    responsible_3: null,
    customer_name: 'Midas',
    issue: 'Wrong rate on invoice',
    issue_date: null,
    solution: null,
    solution_date: null,
    invoice_no: null,
    cn_no: null,
    dn_no: null,
    account_remarks: null,
    coordinator_remarks: null,
    created_at: '2026-11-03T10:00:00Z',
    created_by: 'coord-1',
    updated_at: '2026-11-03T10:00:00Z',
    updated_by: 'coord-1',
    ...overrides,
  }
}

describe('billingIssueScore', () => {
  it('follows the stepped scale', () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 40].map(billingIssueScore)).toEqual([100, 50, 0, -25, -25, -50, -50, -100, -100])
  })
})

describe('billingScores', () => {
  it('counts Responsible Person 1 only, inside the period, and scores everyone listed', () => {
    const issues = [
      issue({ id: '1', responsible_1: 'coord-1' }),
      issue({ id: '2', responsible_1: 'coord-1', responsible_2: 'coord-2' }),
      issue({ id: '3', responsible_1: 'coord-1', date: '2026-10-31' }),
      issue({ id: '4', responsible_1: 'Billing' }),
    ]
    expect(billingScores(issues, ['coord-1', 'coord-2', 'coord-3'], '2026-11-01', '2026-11-30')).toEqual([
      { coordinatorId: 'coord-1', issues: 2, score: 0 },
      { coordinatorId: 'coord-2', issues: 0, score: 100 },
      { coordinatorId: 'coord-3', issues: 0, score: 100 },
    ])
  })
})

describe('resolveResponsible', () => {
  const people = [
    { id: 'coord-3', full_name: 'Devyani Vaghela' },
    { id: 'coord-4', full_name: 'Pragati Patel' },
    { id: 'coord-9', full_name: 'Pragati Shah' },
  ]

  it('matches a full or first name to the user, any case', () => {
    expect(resolveResponsible('Devyani Vaghela', people)).toBe('coord-3')
    expect(resolveResponsible(' devyani ', people)).toBe('coord-3')
  })

  it('keeps departments and unclear first names as written', () => {
    expect(resolveResponsible('Production side', people)).toBe('Production side')
    expect(resolveResponsible('Pragati', people)).toBe('Pragati')
    expect(resolveResponsible('', people)).toBeNull()
  })
})

describe('saving a billing issue', () => {
  beforeEach(() => {
    demoCompanyStore.billingIssues = []
  })

  it('numbers new issues in order and keeps the number and author on edit', () => {
    demoCompanyStore.saveBillingIssue(issue({ id: 'a' }))
    demoCompanyStore.saveBillingIssue(issue({ id: 'b' }))
    demoCompanyStore.saveBillingIssue(issue({ id: 'a', sr_no: 99, issue: 'Edited', created_by: 'someone-else' }))

    const byId = Object.fromEntries(demoCompanyStore.getBillingIssues().map((i) => [i.id, i]))
    expect(byId.a).toMatchObject({ sr_no: 1, issue: 'Edited', created_by: 'coord-1' })
    expect(byId.b.sr_no).toBe(2)
    expect(nextBillingSrNo(demoCompanyStore.getBillingIssues())).toBe(3)
  })
})

describe('the old sheet', () => {
  const people = [
    { id: 'coord-3', full_name: 'Devyani Vaghela' },
    { id: 'disha-a', full_name: 'Disha Acharya' },
    { id: 'disha-c', full_name: 'Disha Chaudhary' },
  ]

  it('matches "Disha A" and "Disha c" by the start of the surname', () => {
    expect(resolveResponsible('Disha A', people)).toBe('disha-a')
    expect(resolveResponsible('Disha c', people)).toBe('disha-c')
  })

  it('reads text as MM/DD/YYYY (DD/MM when the first part is over 12) and offers both ways for an Excel date', () => {
    expect(sheetDateCandidates('07/24/2026')).toEqual(['2026-07-24'])
    expect(sheetDateCandidates('22/05/2026')).toEqual(['2026-05-22'])
    expect(sheetDateCandidates(46298)).toEqual(['2026-10-03', '2026-03-10'])
    expect(sheetDateCandidates(46067)).toEqual(['2026-02-14'])
    expect(sheetDateCandidates('')).toEqual([])
  })

  it('picks the reading nearest the anchor, and not one after today', () => {
    expect(pickDate(['2026-10-03', '2026-03-10'], '2026-03-01', '2026-11-05')).toBe('2026-03-10')
    expect(pickDate(['2026-11-08', '2026-08-11'], '2026-11-01', '2026-11-05')).toBe('2026-08-11')
  })

  it('reads a swapped Date by its neighbours, and drops "None" and "-"', () => {
    const row = (sr: number, date: unknown, extra: Record<string, unknown> = {}) => ({
      'Sr. No': sr,
      Date: date,
      'Responsible Person 1': 'Devyani Vaghela',
      'Responsible Person 2': 'None',
      'Customer Name': 'Gulab',
      Issue: 'Wrong FG code',
      ...extra,
    })
    const { issues, reread } = billingIssuesFromSheet(
      [row(1, 46067), row(2, 46077), row(3, 46298, { 'Customer Name': '-' }), row(4, '03/31/2026'), {}],
      people,
      '2026-11-05T00:00:00Z',
      '2026-11-05'
    )
    expect(issues.map((i) => i.date)).toEqual(['2026-02-14', '2026-02-24', '2026-03-10', '2026-03-31'])
    expect(issues[0]).toMatchObject({ responsible_1: 'coord-3', responsible_2: null, created_by: null, sr_no: 1 })
    expect(issues[2].customer_name).toBe('-')
    expect(reread).toBe(1)
  })
})
