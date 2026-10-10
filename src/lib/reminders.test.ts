import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A localStorage good enough for the store: tests run in node, which has none. */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}

vi.stubGlobal('localStorage', memoryStorage())

const { readRemindersFor, sendReminder, sendReminders, sentMessages } = await import('./reminders')
// Messages live in the shared store now, not in localStorage.
const { demoCompanyStore } = await import('./demo-companies')

const LEADER = { fromUserId: 'admin-1', fromName: 'Niki Patel' }
const TEAM = [
  { id: 'coord-1', name: 'Pragati Patel' },
  { id: 'coord-9', name: 'Vishva Vyas' },
  { id: 'coord-7', name: 'Krina Shah' },
]

beforeEach(() => {
  localStorage.clear()
  demoCompanyStore.replaceAll({ ...demoCompanyStore.getSnapshot(), messages: [] })
})

describe('sending to one person', () => {
  it('reaches that person and nobody else', async () => {
    await sendReminder({ ...LEADER, toCoordinatorId: 'coord-1', message: 'call Balaji before five' })

    const hers = readRemindersFor('coord-1')
    expect(hers).toHaveLength(1)
    expect(hers[0].message).toBe('call Balaji before five')
    expect(hers[0].fromName).toBe('Niki Patel')
    expect(readRemindersFor('coord-9')).toHaveLength(0)
  })

  it('carries the account it is about, so the bell can open it', async () => {
    await sendReminder({
      ...LEADER,
      toCoordinatorId: 'coord-1',
      subject: 'Balaji Print Pack',
      message: 'chase this today',
      link: '/companies?company=c1',
    })
    expect(readRemindersFor('coord-1')[0].link).toBe('/companies?company=c1')
  })
})

describe('sending to the whole team', () => {
  it('gives every person their own copy, so each has their own bell', async () => {
    const sent = await sendReminders({ ...LEADER, to: TEAM, message: 'log your entries by six', audience: 'the team' })

    expect(sent).toHaveLength(3)
    for (const person of TEAM) {
      const theirs = readRemindersFor(person.id)
      expect(theirs).toHaveLength(1)
      expect(theirs[0].message).toBe('log your entries by six')
    }
  })

  it('ties the copies together, so the sender sees one message', async () => {
    const sent = await sendReminders({ ...LEADER, to: TEAM, message: 'month end is Friday' })
    expect(new Set(sent.map((r) => r.batchId)).size).toBe(1)
  })

  it('never writes to the same person twice', async () => {
    await sendReminders({
      ...LEADER,
      to: [TEAM[0], TEAM[0], TEAM[1]],
      message: 'call me',
    })
    expect(readRemindersFor('coord-1')).toHaveLength(1)
  })

  it('refuses a send with nobody to send to', async () => {
    // "Sent" has to mean somebody will see it.
    await expect(sendReminders({ ...LEADER, to: [], message: 'hello' })).rejects.toThrow(/No one/)
  })
})

describe('the sender looking at what they sent', () => {
  it('counts a broadcast once, however many bells it rang', async () => {
    await sendReminders({ ...LEADER, to: TEAM, message: 'month end is Friday', audience: 'the team' })
    await sendReminder({ ...LEADER, toCoordinatorId: 'coord-1', message: 'and call Balaji' })

    const sent = sentMessages('admin-1')
    expect(sent).toHaveLength(2)

    const broadcast = sent.find((m) => m.message === 'month end is Friday')
    expect(broadcast?.recipientIds).toHaveLength(3)
    expect(broadcast?.audience).toBe('the team')

    const single = sent.find((m) => m.message === 'and call Balaji')
    expect(single?.recipientIds).toEqual(['coord-1'])
  })

  it('shows nothing to somebody who has sent nothing', async () => {
    await sendReminders({ ...LEADER, to: TEAM, message: 'anything' })
    expect(sentMessages('coord-1')).toEqual([])
  })

  it('puts the most recent first', async () => {
    await sendReminder({ ...LEADER, toCoordinatorId: 'coord-1', message: 'first' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await sendReminder({ ...LEADER, toCoordinatorId: 'coord-1', message: 'second' })

    const sent = sentMessages('admin-1')
    expect(sent[0].message).toBe('second')
  })
})
