import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseFile } from './file-parser'
import {
  autoMapOverdueColumns,
  mapOverdueRows,
  validateOverdueRows,
  processOverdueUpload,
  deriveOverdueStatus,
} from './overdue-upload'
import { demoCompanyStore } from './demo-companies'
import { addFollowup } from './followups-api'
import { getOverduePayments, getOverdueStats } from './overdue-api'

function loadWorkbook(name: string): File {
  const buffer = readFileSync(resolve(__dirname, '__fixtures__', name))
  return {
    name,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as unknown as File
}

beforeEach(() => {
  demoCompanyStore.overduePayments = []
  demoCompanyStore.followups = []
})

describe('deriveOverdueStatus', () => {
  it('flags anything ageing past 90 days as critical', () => {
    expect(
      deriveOverdueStatus({ balance_due: 1000, due_91_120: 500, due_121_plus: 0 })
    ).toBe('critical')
    expect(
      deriveOverdueStatus({ balance_due: 1000, due_91_120: 0, due_121_plus: 500 })
    ).toBe('critical')
  })

  it('treats younger balances as ordinary overdue', () => {
    expect(deriveOverdueStatus({ balance_due: 1000, due_91_120: 0, due_121_plus: 0 })).toBe('overdue')
  })

  it('treats a cleared balance as settled', () => {
    expect(deriveOverdueStatus({ balance_due: 0, due_91_120: 0, due_121_plus: 0 })).toBe('settled')
  })
})

describe('overdue upload extraction', () => {
  it('maps ageing buckets without them colliding with each other', async () => {
    const parsed = await parseFile(loadWorkbook('overdue_sample.xlsx'))
    const mapping = autoMapOverdueColumns(parsed.headers)

    expect(mapping.bp_code).toBe('BP Code')
    expect(mapping.customer_name).toBe('Customer Name')
    expect(mapping.balance_due).toBe('Balance Due')
    expect(mapping.coordinator_name).toBe('Coordinator Name')

    // Each bucket must claim its own column.
    expect(mapping.due_0_30).toBe('0 - 30')
    expect(mapping.due_31_60).toBe('31 - 60')
    expect(mapping.due_61_90).toBe('61 - 90')
    expect(mapping.due_91_120).toBe('91 - 120')
    expect(mapping.due_121_plus).toBe('121+')
  })

  it('parses Indian-format currency and derives status per row', async () => {
    const parsed = await parseFile(loadWorkbook('overdue_sample.xlsx'))
    const rows = mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))

    const meridian = rows[0]
    expect(meridian.customer_name).toBe('Meridian Foods')
    expect(meridian.balance_due).toBe(420000)
    expect(meridian.due_91_120).toBe(150000)
    expect(meridian.status).toBe('critical')

    const nandi = rows[2]
    expect(nandi.balance_due).toBe(110000)
    expect(nandi.status).toBe('overdue') // nothing beyond 90 days

    // Unmapped columns are retained.
    expect(meridian.extra_fields).toHaveProperty('Region', 'West')
  })

  it('resolves coordinators through aliases and quarantines the rest', async () => {
    const parsed = await parseFile(loadWorkbook('overdue_sample.xlsx'))
    const rows = mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))
    const result = await validateOverdueRows(rows)

    expect(result.valid).toHaveLength(3) // Diya, "Pragati Patel", KRUPA
    // Three spellings, one rule: the bare first name, the full name an export
    // writes out, and a shouted one. None of them needs a saved alias.
    expect(result.valid.map((r) => r.coordinator_id)).toEqual(['coord-2', 'coord-1', 'coord-5'])

    // "Nobody Known" cannot be resolved; the blank BP code row is invalid.
    expect(result.unassigned.map((r) => r.customer_name)).toEqual(['Orbit Retail'])
    expect(result.errors[4]).toContain('BP Code is required')
  })

  it('imports rows and scopes them to the assigned coordinator', async () => {
    const parsed = await parseFile(loadWorkbook('overdue_sample.xlsx'))
    const rows = mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))
    const validation = await validateOverdueRows(rows)

    const outcome = await processOverdueUpload(validation.valid, {
      invalidRows: validation.invalid.map((row) => ({
        row,
        messages: validation.errors[row._originalIndex] ?? [],
      })),
    })

    expect(outcome.created).toBe(3)
    expect(outcome.updated).toBe(0)
    expect(outcome.failed).toBe(2)

    // coord-1 (Pragati) should only see the row assigned to her.
    const mine = await getOverduePayments('coord-1')
    expect(mine).toHaveLength(1)
    expect(mine[0].customer_name).toBe('Gokul Beverages')

    const stats = await getOverdueStats()
    expect(stats.total).toBe(3)
    expect(stats.critical).toBe(2)
    expect(stats.totalBalance).toBe(420000 + 985000 + 110000)
  })

  it('re-importing updates rows without resurrecting a settled balance', async () => {
    const parsed = await parseFile(loadWorkbook('overdue_sample.xlsx'))
    const rows = mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))
    const validation = await validateOverdueRows(rows)

    await processOverdueUpload(validation.valid)
    const settledId = (await getOverduePayments())[0].id
    demoCompanyStore.updateOverduePayment(settledId, { status: 'settled' })

    const second = await processOverdueUpload(
      mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers)).filter((r) => r.bp_code)
        .slice(0, 3)
        .map((r) => ({ ...r, coordinator_id: 'coord-1' }))
    )

    expect(second.created).toBe(0)
    expect(second.updated).toBe(3)
    expect(demoCompanyStore.getOverduePaymentById(settledId)?.status).toBe('settled')
  })
})

describe('overdue follow-ups', () => {
  it('records a follow-up against the overdue balance and advances its status', async () => {
    const parsed = await parseFile(loadWorkbook('overdue_sample.xlsx'))
    const validation = await validateOverdueRows(
      mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))
    )
    await processOverdueUpload(validation.valid)

    const payment = (await getOverduePayments('coord-1'))[0]

    await addFollowup({
      entity_type: 'overdue_payment',
      entity_id: payment.id,
      coordinator_id: 'coord-1',
      followup_date: new Date().toISOString(),
      mode: 'call',
      notes: 'Spoke to accounts; part payment promised.',
      customer_response: 'Partial payment promised',
      status: 'committed',
      committed_date: '2026-10-01',
      committed_amount: 300000,
      next_reminder_date: '2026-10-02',
      proof_attachment_url: null,
    })

    const timeline = demoCompanyStore.getFollowupsForEntity(payment.id, 'overdue_payment')
    expect(timeline).toHaveLength(1)
    expect(timeline[0].notes).toBe('Spoke to accounts; part payment promised.')

    // Logging a follow-up moves the balance out of the untouched queue.
    expect(demoCompanyStore.getOverduePaymentById(payment.id)?.status).toBe('in_progress')

    // A company timeline must not pick up overdue follow-ups.
    expect(demoCompanyStore.getFollowupsForEntity(payment.id, 'company')).toHaveLength(0)
  })

  it('settles the balance when the follow-up is marked paid', async () => {
    const parsed = await parseFile(loadWorkbook('overdue_sample.xlsx'))
    const validation = await validateOverdueRows(
      mapOverdueRows(parsed.rows, autoMapOverdueColumns(parsed.headers))
    )
    await processOverdueUpload(validation.valid)
    const payment = (await getOverduePayments('coord-1'))[0]

    await addFollowup({
      entity_type: 'overdue_payment',
      entity_id: payment.id,
      coordinator_id: 'coord-1',
      followup_date: new Date().toISOString(),
      mode: 'email',
      notes: 'Payment received in full.',
      customer_response: null,
      status: 'paid',
      committed_date: null,
      committed_amount: null,
      next_reminder_date: null,
      proof_attachment_url: null,
    })

    expect(demoCompanyStore.getOverduePaymentById(payment.id)?.status).toBe('settled')
  })
})

describe('a customer in credit', () => {
  const creditRow = {
    'BP Code': 'C1508',
    'Customer Name': 'Khushi Agro Private Limited',
    'Balance Due': -22275,
    '0 - 30': 0,
    '31 - 60': 0,
    '61 - 90': 0,
    '91 - 120': 0,
    '121+': -22275,
    'Coordinator Name': 'Pragati',
  }
  const mapping = {
    bp_code: 'BP Code',
    customer_name: 'Customer Name',
    balance_due: 'Balance Due',
    coordinator_name: 'Coordinator Name',
    due_0_30: '0 - 30',
    due_31_60: '31 - 60',
    due_61_90: '61 - 90',
    due_91_120: '91 - 120',
    due_121_plus: '121+',
  }

  it('imports rather than refusing it', async () => {
    // A credit note or an advance is a real position, not a broken row.
    const result = await validateOverdueRows(mapOverdueRows([creditRow], mapping))
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].balance_due).toBe(-22275)
  })

  it('is not marked settled, so it stays visible and nets off the totals', () => {
    expect(deriveOverdueStatus({ balance_due: -22275, due_91_120: 0, due_121_plus: -22275 })).not.toBe('settled')
  })

  it('still treats a nil balance as settled', () => {
    expect(deriveOverdueStatus({ balance_due: 0, due_91_120: 0, due_121_plus: 0 })).toBe('settled')
  })

  it('is never called critical: a credit is not money past 90 days', () => {
    expect(deriveOverdueStatus({ balance_due: -22275, due_91_120: 0, due_121_plus: -22275 })).not.toBe('critical')
  })
})
