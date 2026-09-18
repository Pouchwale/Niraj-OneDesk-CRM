import { describe, it, expect, beforeEach } from 'vitest'

import { demoCompanyStore } from './demo-companies'
import {
  addFollowup,
  collapseToLatestPerAccount,
  editFollowup,
  filterHistoryRows,
  getFollowupHistory,
  getFollowupSummaryByCompany,
  getOverdueCommitments,
  summariseHistory,
} from './followups-api'
import { getCompanyById } from './companies-api'
import { getNotifications } from './notifications'
import { todayISO, addDaysISO } from './utils'
import type { Company, Followup } from './types'

const COORD = 'coord-1'

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: `comp-test-${Math.random().toString(36).slice(2, 8)}`,
    sap_bp_code: `BP-${Math.floor(Math.random() * 100000)}`,
    name: 'Test Traders',
    contact_person: 'Test Person',
    contact_number: '9000000000',
    email: null,
    payment_terms: '30 days',
    total_amount: 100000,
    invoice_date: addDaysISO(todayISO(), -40),
    due_date: addDaysISO(todayISO(), -10),
    status: 'overdue',
    assigned_coordinator_id: COORD,
    module: null,
    remarks: null,
    extra_fields: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function followupPayload(companyId: string, overrides: Partial<Followup> = {}) {
  return {
    entity_type: 'company' as const,
    entity_id: companyId,
    coordinator_id: COORD,
    followup_date: new Date().toISOString(),
    mode: 'call' as const,
    notes: 'Called the customer.',
    customer_response: null,
    status: 'pending' as const,
    committed_date: null,
    committed_amount: null,
    next_reminder_date: null,
    proof_attachment_url: null,
    ...overrides,
  }
}

// The demo store is a module singleton, so each test starts from a clean slate.
beforeEach(() => {
  demoCompanyStore.companies = []
  demoCompanyStore.followups = []
})

describe('addFollowup', () => {
  it('persists the follow-up against the company', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())

    await addFollowup(followupPayload(company.id, { notes: 'Spoke to accounts.' }))

    const stored = demoCompanyStore.getFollowupsForCompany(company.id)
    expect(stored).toHaveLength(1)
    expect(stored[0].notes).toBe('Spoke to accounts.')
    expect(stored[0].followup_date).toBeTruthy()
  })

  it('settles the company when the follow-up is marked paid', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany({ status: 'overdue' }))

    await addFollowup(followupPayload(company.id, { status: 'paid' }))

    expect((await getCompanyById(company.id))?.status).toBe('paid')
  })

  it('leaves the status driven by the due date for any other outcome', async () => {
    // 90 days past due, so it should settle at "critical" rather than stay "current".
    const company = demoCompanyStore.upsertCompany(
      makeCompany({ status: 'current', due_date: addDaysISO(todayISO(), -90) })
    )

    await addFollowup(followupPayload(company.id, { status: 'no_response' }))

    expect((await getCompanyById(company.id))?.status).toBe('critical')
  })
})

describe('getFollowupSummaryByCompany', () => {
  it('rolls up last contact and the soonest outstanding commitment', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())

    await addFollowup(
      followupPayload(company.id, {
        followup_date: '2026-01-01T10:00:00.000Z',
        committed_date: '2026-03-01',
        committed_amount: 50000,
        status: 'committed',
      })
    )
    await addFollowup(
      followupPayload(company.id, {
        followup_date: '2026-02-01T10:00:00.000Z',
        committed_date: '2026-02-10',
        committed_amount: 25000,
        status: 'committed',
      })
    )

    const summary = (await getFollowupSummaryByCompany(COORD)).get(company.id)

    expect(summary?.totalFollowups).toBe(2)
    expect(summary?.lastFollowupDate).toBe('2026-02-01T10:00:00.000Z')
    // Soonest commitment wins, not the most recently logged one.
    expect(summary?.nextCommittedDate).toBe('2026-02-10')
    expect(summary?.nextCommittedAmount).toBe(25000)
  })

  it('ignores commitments on follow-ups already marked paid', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())
    await addFollowup(
      followupPayload(company.id, { committed_date: '2026-02-10', status: 'paid' })
    )

    const summary = (await getFollowupSummaryByCompany(COORD)).get(company.id)
    expect(summary?.nextCommittedDate).toBeNull()
  })
})

describe('getOverdueCommitments', () => {
  it('returns only unpaid commitments whose promised date has passed', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())

    await addFollowup(
      followupPayload(company.id, {
        committed_date: addDaysISO(todayISO(), -5),
        status: 'committed',
      })
    )
    await addFollowup(
      followupPayload(company.id, {
        committed_date: addDaysISO(todayISO(), 5),
        status: 'committed',
      })
    )

    const broken = await getOverdueCommitments(COORD)
    expect(broken).toHaveLength(1)
    expect(broken[0].committed_date).toBe(addDaysISO(todayISO(), -5))
  })
})

describe('getNotifications', () => {
  const dueIn = (days: number, name: string) =>
    demoCompanyStore.upsertCompany(makeCompany({ name, due_date: addDaysISO(todayISO(), days) }))

  it('warns three days out and again on the day', async () => {
    dueIn(3, 'Three Days Co')
    dueIn(0, 'Due Today Co')

    const notifications = await getNotifications(COORD, false)
    const titles = notifications.map((n) => n.title)

    expect(titles).toContain('Payment due in 3 days')
    expect(titles).toContain('Payment due today')
    expect(notifications.find((n) => n.title === 'Payment due today')?.message).toContain('Due Today Co')

    // Today outranks the warning, so it sits at the top of the bell.
    expect(notifications.findIndex((n) => n.title === 'Payment due today')).toBeLessThan(
      notifications.findIndex((n) => n.title === 'Payment due in 3 days')
    )
  })

  it('says nothing on any other day, and nothing about money already late', async () => {
    dueIn(-5, 'Late Co')
    dueIn(1, 'Tomorrow Co')
    dueIn(2, 'Two Days Co')
    dueIn(4, 'Four Days Co')
    dueIn(30, 'Next Month Co')

    const notifications = await getNotifications(COORD, false)
    expect(notifications).toHaveLength(0)
  })

  it('leaves a settled account alone even on its due date', async () => {
    demoCompanyStore.upsertCompany(
      makeCompany({ name: 'Paid Co', due_date: todayISO(), status: 'paid', total_amount: 0 })
    )
    expect(await getNotifications(COORD, false)).toHaveLength(0)
  })

  it('does not leak another coordinator/s companies', async () => {
    demoCompanyStore.upsertCompany(
      makeCompany({
        name: 'Someone Elses Co',
        assigned_coordinator_id: 'coord-2',
        due_date: addDaysISO(todayISO(), 3),
      })
    )

    const notifications = await getNotifications(COORD, false)
    expect(notifications.some((n) => n.message.includes('Someone Elses Co'))).toBe(false)

    // ...but an admin sees everything.
    const adminView = await getNotifications('admin-1', true)
    expect(adminView.some((n) => n.message.includes('Someone Elses Co'))).toBe(true)
  })

  it('no longer announces broken promises: those are worked from the account', async () => {
    const company = demoCompanyStore.upsertCompany(
      makeCompany({ name: 'Promise Co', due_date: addDaysISO(todayISO(), 30) })
    )
    await addFollowup(
      followupPayload(company.id, {
        committed_date: addDaysISO(todayISO(), -2),
        status: 'committed',
      })
    )

    expect(await getNotifications(COORD, false)).toHaveLength(0)
  })
})

describe('follow-up history by coordinator', () => {
  const OTHER = 'coord-3'

  it('returns one coordinator’s work across every account she touched', async () => {
    const balaji = demoCompanyStore.upsertCompany(makeCompany({ name: 'Balaji Print Pack' }))
    const gokul = demoCompanyStore.upsertCompany(makeCompany({ name: 'Gokul Beverages' }))

    await addFollowup(followupPayload(balaji.id, { notes: 'Spoke to accounts.' }))
    await addFollowup(followupPayload(gokul.id, { notes: 'Left a message.' }))
    await addFollowup(followupPayload(balaji.id, { coordinator_id: OTHER, notes: 'Not mine.' }))

    const mine = await getFollowupHistory({ coordinatorId: COORD })

    expect(mine).toHaveLength(2)
    expect(mine.map((e) => e.entity_name).sort()).toEqual(['Balaji Print Pack', 'Gokul Beverages'])
    expect(mine.every((e) => e.coordinator_id === COORD)).toBe(true)
  })

  it('names the account on every row, so the list reads without a join', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany({ name: 'Apex Flexipack', sap_bp_code: 'BP-2001' }))
    await addFollowup(followupPayload(company.id))

    const [entry] = await getFollowupHistory({ coordinatorId: COORD })
    expect(entry.entity_name).toBe('Apex Flexipack')
    expect(entry.entity_bp_code).toBe('BP-2001')
    expect(entry.coordinator_name).toBe('Pragati Patel')
  })

  it('orders newest first', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())
    await addFollowup(followupPayload(company.id, { notes: 'older', followup_date: '2026-08-01T09:00:00.000Z' }))
    await addFollowup(followupPayload(company.id, { notes: 'newer', followup_date: '2026-09-01T09:00:00.000Z' }))

    const history = await getFollowupHistory({ coordinatorId: COORD })
    expect(history.map((e) => e.notes)).toEqual(['newer', 'older'])
  })

  it('filters by date window, outcome and free text', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany({ name: 'Coastal Snacks' }))
    await addFollowup(followupPayload(company.id, { notes: 'old call', followup_date: '2026-01-05T09:00:00.000Z' }))
    await addFollowup(followupPayload(company.id, { notes: 'promised to pay', status: 'committed', followup_date: '2026-09-01T09:00:00.000Z' }))

    expect(await getFollowupHistory({ from: '2026-06-01' })).toHaveLength(1)
    expect(await getFollowupHistory({ to: '2026-06-01' })).toHaveLength(1)
    expect(await getFollowupHistory({ status: 'committed' })).toHaveLength(1)
    expect(await getFollowupHistory({ search: 'promised' })).toHaveLength(1)
    // Search covers the account name as well as the note.
    expect(await getFollowupHistory({ search: 'coastal' })).toHaveLength(2)
    expect(await getFollowupHistory({ search: 'nothing matches this' })).toHaveLength(0)
  })

  it('covers overdue-payment follow-ups too, not just companies', async () => {
    const payment = demoCompanyStore.upsertOverduePayment({
      id: 'ovd-hist-1',
      bp_code: 'BP-3001',
      customer_name: 'Himalaya Print Solutions',
      balance_due: 640000,
      due_0_30: 0, due_31_60: 0, due_61_90: 0, due_91_120: 640000, due_121_plus: 0,
      status: 'critical',
      assigned_coordinator_id: COORD,
    } as never).payment

    await addFollowup(followupPayload(payment.id, { entity_type: 'overdue_payment', entity_id: payment.id }))

    const [entry] = await getFollowupHistory({ coordinatorId: COORD })
    expect(entry.entity_name).toBe('Himalaya Print Solutions')
    expect(entry.entity_type).toBe('overdue_payment')

    // And the entity filter separates the two kinds.
    expect(await getFollowupHistory({ entityType: 'company' })).toHaveLength(0)
  })

  it('summarises the window the way the tiles read it', async () => {
    const a = demoCompanyStore.upsertCompany(makeCompany({ name: 'One' }))
    const b = demoCompanyStore.upsertCompany(makeCompany({ name: 'Two' }))
    await addFollowup(followupPayload(a.id, { status: 'committed', committed_date: '2026-09-20', committed_amount: 50000 }))
    await addFollowup(followupPayload(a.id, { status: 'paid', committed_date: '2026-09-10', committed_amount: 25000 }))
    await addFollowup(followupPayload(b.id))

    const summary = summariseHistory(await getFollowupHistory({ coordinatorId: COORD }))
    expect(summary.total).toBe(3)
    expect(summary.accountsTouched).toBe(2)
    expect(summary.commitmentsMade).toBe(2)
    expect(summary.commitmentsKept).toBe(1)
    expect(summary.amountCommitted).toBe(75000)
  })
})

describe('an edit never rewrites who did the work', () => {
  it('keeps the original coordinator when a leader corrects the note', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())
    const saved = await addFollowup(followupPayload(company.id, { notes: 'Original note.' }))

    // The form sends the editor's id in the payload; it must be ignored.
    await editFollowup(saved!.id, { notes: 'Corrected note.', coordinator_id: 'admin-1' }, 'admin-1')

    const [entry] = await getFollowupHistory({})
    expect(entry.notes).toBe('Corrected note.')
    expect(entry.coordinator_id).toBe(COORD)
    // So it still counts towards the person who made the call.
    expect(await getFollowupHistory({ coordinatorId: COORD })).toHaveLength(1)
    expect(await getFollowupHistory({ coordinatorId: 'admin-1' })).toHaveLength(0)
  })

  it('keeps the version it replaced, with who changed it', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())
    const saved = await addFollowup(followupPayload(company.id, { notes: 'Promised 2 lakh on the 20th.' }))

    await editFollowup(saved!.id, { notes: 'Promised 1 lakh on the 20th.' }, 'admin-1')

    const audit = demoCompanyStore.getAuditLog('followup', saved!.id)
    expect(audit).toHaveLength(1)
    expect(audit[0].action).toBe('edit')
    expect(audit[0].actor_id).toBe('admin-1')
    expect((audit[0].before as { notes: string }).notes).toBe('Promised 2 lakh on the 20th.')
    expect((audit[0].after as { notes: string }).notes).toBe('Promised 1 lakh on the 20th.')
  })
})

describe('one row per coordinator per account', () => {
  it('keeps only the latest contact and counts the rest', async () => {
    const gokul = demoCompanyStore.upsertCompany(makeCompany({ name: 'Gokul Beverages' }))

    await addFollowup(followupPayload(gokul.id, { mode: 'call', notes: 'first', followup_date: '2026-09-01T09:00:00.000Z' }))
    await addFollowup(followupPayload(gokul.id, { mode: 'email', notes: 'second', followup_date: '2026-09-03T09:00:00.000Z' }))
    await addFollowup(followupPayload(gokul.id, { mode: 'whatsapp', notes: 'latest', followup_date: '2026-09-05T09:00:00.000Z' }))

    const rows = collapseToLatestPerAccount(await getFollowupHistory({}))

    expect(rows).toHaveLength(1)
    expect(rows[0].notes).toBe('latest')
    expect(rows[0].mode).toBe('whatsapp')
    expect(rows[0].touches).toBe(3)
  })

  it('keeps each coordinator’s own line on a shared account', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany({ name: 'Shared Co' }))
    await addFollowup(followupPayload(company.id, { notes: 'mine' }))
    await addFollowup(followupPayload(company.id, { coordinator_id: 'coord-3', notes: 'hers' }))

    const rows = collapseToLatestPerAccount(await getFollowupHistory({}))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.touches)).toEqual([1, 1])
  })

  it('keeps one line per account, not one per coordinator’s whole day', async () => {
    const a = demoCompanyStore.upsertCompany(makeCompany({ name: 'Account A' }))
    const b = demoCompanyStore.upsertCompany(makeCompany({ name: 'Account B' }))
    await addFollowup(followupPayload(a.id, { notes: 'a1' }))
    await addFollowup(followupPayload(a.id, { notes: 'a2' }))
    await addFollowup(followupPayload(b.id, { notes: 'b1' }))

    const rows = collapseToLatestPerAccount(await getFollowupHistory({}))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.entity_name).sort()).toEqual(['Account A', 'Account B'])
  })

  it('breaks a same-day tie on when it was recorded', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())
    const sameDay = '2026-09-05T09:00:00.000Z'
    const first = await addFollowup(followupPayload(company.id, { notes: 'earlier', followup_date: sameDay }))
    const second = await addFollowup(followupPayload(company.id, { notes: 'later', followup_date: sameDay }))
    // Make the recording order unambiguous.
    demoCompanyStore.editFollowup(first!.id, { created_at: '2026-09-05T09:00:00.000Z' })
    demoCompanyStore.editFollowup(second!.id, { created_at: '2026-09-05T17:30:00.000Z' })

    const rows = collapseToLatestPerAccount(await getFollowupHistory({}))
    expect(rows[0].notes).toBe('later')
    expect(rows[0].touches).toBe(2)
  })

  it('still orders accounts newest contact first', async () => {
    const older = demoCompanyStore.upsertCompany(makeCompany({ name: 'Older' }))
    const newer = demoCompanyStore.upsertCompany(makeCompany({ name: 'Newer' }))
    await addFollowup(followupPayload(older.id, { followup_date: '2026-08-01T09:00:00.000Z' }))
    await addFollowup(followupPayload(newer.id, { followup_date: '2026-09-01T09:00:00.000Z' }))

    const rows = collapseToLatestPerAccount(await getFollowupHistory({}))
    expect(rows.map((r) => r.entity_name)).toEqual(['Newer', 'Older'])
  })

  it('leaves the activity totals alone, so the tiles still count every call', async () => {
    const company = demoCompanyStore.upsertCompany(makeCompany())
    await addFollowup(followupPayload(company.id, { followup_date: '2026-09-01T09:00:00.000Z' }))
    await addFollowup(followupPayload(company.id, { followup_date: '2026-09-02T09:00:00.000Z' }))

    const all = await getFollowupHistory({})
    expect(summariseHistory(all).total).toBe(2)
    expect(collapseToLatestPerAccount(all)).toHaveLength(1)
  })
})

describe('one account, whichever record the call was logged against', () => {
  it('merges the invoice record and the ageing record for the same customer', async () => {
    // The same customer is in Active Payments and in Overdue Payments, sharing
    // a BP code. A coordinator chasing them logs against whichever screen she
    // happens to be on, and the history must still read as one relationship.
    const company = demoCompanyStore.upsertCompany(
      makeCompany({ name: 'Gokul Beverages', sap_bp_code: 'BP-3002' })
    )
    const payment = demoCompanyStore.upsertOverduePayment({
      id: 'ovd-dup-1',
      bp_code: 'BP-3002',
      customer_name: 'Gokul Beverages',
      balance_due: 985000,
      due_0_30: 0, due_31_60: 0, due_61_90: 0, due_91_120: 985000, due_121_plus: 0,
      status: 'critical',
      assigned_coordinator_id: COORD,
    } as never).payment

    await addFollowup(followupPayload(company.id, { notes: 'called about the invoice', followup_date: '2026-09-01T09:00:00.000Z' }))
    await addFollowup(followupPayload(payment.id, {
      entity_type: 'overdue_payment', entity_id: payment.id,
      notes: 'whatsapp about the ageing', followup_date: '2026-09-04T09:00:00.000Z',
    }))

    const rows = collapseToLatestPerAccount(await getFollowupHistory({ coordinatorId: COORD }))

    expect(rows).toHaveLength(1)
    expect(rows[0].notes).toBe('whatsapp about the ageing')
    expect(rows[0].touches).toBe(2)
  })

  it('still separates two customers that share no BP code', async () => {
    const a = demoCompanyStore.upsertCompany(makeCompany({ name: 'Alpha', sap_bp_code: 'BP-9001' }))
    const b = demoCompanyStore.upsertCompany(makeCompany({ name: 'Beta', sap_bp_code: 'BP-9002' }))
    await addFollowup(followupPayload(a.id))
    await addFollowup(followupPayload(b.id))

    expect(collapseToLatestPerAccount(await getFollowupHistory({}))).toHaveLength(2)
  })

  it('does not lump together records that simply have no BP code', async () => {
    const a = demoCompanyStore.upsertCompany(makeCompany({ name: 'No Code One', sap_bp_code: null }))
    const b = demoCompanyStore.upsertCompany(makeCompany({ name: 'No Code Two', sap_bp_code: null }))
    await addFollowup(followupPayload(a.id))
    await addFollowup(followupPayload(b.id))

    expect(collapseToLatestPerAccount(await getFollowupHistory({}))).toHaveLength(2)
  })
})

describe('a filter narrows the latest records, it never revives an old one', () => {
  /** Gokul: an unanswered call in August, a commitment in September. */
  async function gokulWithTwoOutcomes() {
    const company = demoCompanyStore.upsertCompany(
      makeCompany({ name: 'Gokul Beverages', sap_bp_code: 'BP-3002' })
    )
    await addFollowup(followupPayload(company.id, {
      mode: 'call', status: 'no_response',
      notes: 'Left a message with the accounts desk. No call back.',
      followup_date: '2026-08-22T09:00:00.000Z',
    }))
    await addFollowup(followupPayload(company.id, {
      mode: 'whatsapp', status: 'committed',
      notes: 'will pay', committed_date: '2026-09-06', committed_amount: 526354,
      followup_date: '2026-09-06T09:00:00.000Z',
    }))
    return collapseToLatestPerAccount(await getFollowupHistory({}))
  }

  it('hides the account entirely under an outcome it has moved past', async () => {
    // The August "no response" is superseded; asking for no-response answers
    // should not bring it back.
    const rows = await gokulWithTwoOutcomes()
    expect(filterHistoryRows(rows, { status: 'no_response' })).toHaveLength(0)
  })

  it('shows it under the outcome it actually stands at', async () => {
    const rows = filterHistoryRows(await gokulWithTwoOutcomes(), { status: 'committed' })
    expect(rows).toHaveLength(1)
    expect(rows[0].notes).toBe('will pay')
    expect(rows[0].committed_amount).toBe(526354)
    expect(rows[0].touches).toBe(2)
  })

  it('searches the latest note, not the ones it replaced', async () => {
    const rows = await gokulWithTwoOutcomes()
    expect(filterHistoryRows(rows, { search: 'will pay' })).toHaveLength(1)
    expect(filterHistoryRows(rows, { search: 'No call back' })).toHaveLength(0)
    // The account itself is still findable by name and code.
    expect(filterHistoryRows(rows, { search: 'gokul' })).toHaveLength(1)
    expect(filterHistoryRows(rows, { search: 'BP-3002' })).toHaveLength(1)
  })

  it('counts the calls behind a row, not the rows on screen', async () => {
    const summary = summariseHistory(await gokulWithTwoOutcomes())
    expect(summary.total).toBe(2)
    expect(summary.accountsTouched).toBe(1)
  })

  it('leaves an account visible under its own current outcome', async () => {
    const a = demoCompanyStore.upsertCompany(makeCompany({ name: 'Still Pending', sap_bp_code: 'BP-7001' }))
    const b = demoCompanyStore.upsertCompany(makeCompany({ name: 'Now Paid', sap_bp_code: 'BP-7002' }))
    await addFollowup(followupPayload(a.id, { status: 'pending' }))
    await addFollowup(followupPayload(b.id, { status: 'paid' }))

    const rows = collapseToLatestPerAccount(await getFollowupHistory({}))
    expect(filterHistoryRows(rows, { status: 'pending' }).map((r) => r.entity_name)).toEqual(['Still Pending'])
    expect(filterHistoryRows(rows, { status: 'paid' }).map((r) => r.entity_name)).toEqual(['Now Paid'])
  })
})
