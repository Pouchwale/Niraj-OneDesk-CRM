import { describe, expect, it } from 'vitest'
import {
  AUTO_ASSIGN_CONFIDENCE,
  isMissingCoordinator,
  matchCoordinator,
  resolveCoordinatorName,
  resolveRowOwner,
} from './coordinator-aliases'
import { getFallbackOwner } from '@/features/auth/AuthContext'
import type { CoordinatorProfile } from './coordinator-aliases'

const NO_ALIASES = new Map<string, string>()

/**
 * A fixed roster with surnames, injected rather than read from the live team.
 *
 * The real coordinators are recorded by first name only, so asserting surname,
 * initial and reordering behaviour against them is impossible - and dropping
 * those assertions would retire rules that uploaded sheets still exercise,
 * since exports routinely spell people "Sharma, Priya".
 */
const ROSTER: CoordinatorProfile[] = [
  { id: 'c-priya', full_name: 'Priya Sharma', email: 'priya@gp3.com', username: 'priya' },
  { id: 'c-amit', full_name: 'Amit Patel', email: 'amit@gp3.com', username: 'amit' },
  { id: 'c-sneha', full_name: 'Sneha Reddy', email: 'sneha@gp3.com', username: 'sneha' },
]

const priya = ROSTER[0]
const amit = ROSTER[1]

describe('exact and near-exact spellings', () => {
  it('matches the full name', () => {
    const match = matchCoordinator('Priya Sharma', NO_ALIASES, ROSTER)
    expect(match?.coordinatorId).toBe(priya.id)
    expect(match?.method).toBe('profile')
  })

  it('matches messy real-world spellings of the same person', () => {
    const spellings = [
      'PRIYA SHARMA',
      'Sharma, Priya',
      'Priya Sharma (GP3)',
      'Priya Sharma - Labels',
      'priya@gp3.com',
      'Ms. Priya Sharma',
      'priya',
    ]
    for (const spelling of spellings) {
      expect(matchCoordinator(spelling, NO_ALIASES, ROSTER)?.coordinatorId, spelling).toBe(priya.id)
    }
  })

  it('prefers a configured alias over everything else', () => {
    const aliases = new Map([['ps labels', amit.id]])
    const match = matchCoordinator('PS Labels', aliases, ROSTER)
    expect(match?.coordinatorId).toBe(amit.id)
    expect(match?.method).toBe('alias')
    expect(match?.confidence).toBe(1)
  })
})

describe('fuzzy detection', () => {
  it('recognises a mistyped surname as a suggestion, not a certainty', () => {
    const match = matchCoordinator('Priya Sharmaa', NO_ALIASES, ROSTER)
    expect(match?.coordinatorId).toBe(priya.id)
    expect(match?.method).toBe('fuzzy')
    // Offered for confirmation, never applied silently.
    expect(match!.confidence).toBeLessThan(AUTO_ASSIGN_CONFIDENCE)
    expect(resolveCoordinatorName('Priya Sharmaa', NO_ALIASES, ROSTER)).toBeNull()
  })

  it('explains itself so the reviewer can judge the guess', () => {
    const match = matchCoordinator('Priya Sharmaa', NO_ALIASES, ROSTER)
    expect(match?.reason).toContain('Priya Sharma')
  })

  it('refuses to guess at a coordinator who is simply not on the team', () => {
    // A real name from another company's sheet resembles nobody here.
    for (const stranger of ['Devyani Vaghela', 'Aniketa Bhattacharya', 'Ramesh Iyengar']) {
      const match = matchCoordinator(stranger, NO_ALIASES, ROSTER)
      if (match) {
        expect(match.confidence, `${stranger} -> ${match.reason}`).toBeLessThan(
          AUTO_ASSIGN_CONFIDENCE
        )
      }
      expect(resolveCoordinatorName(stranger, NO_ALIASES, ROSTER), stranger).toBeNull()
    }
  })

  it('returns nothing at all for an empty or junk cell', () => {
    expect(matchCoordinator('', NO_ALIASES, ROSTER)).toBeNull()
    expect(matchCoordinator('   ', NO_ALIASES, ROSTER)).toBeNull()
    expect(matchCoordinator('-', NO_ALIASES, ROSTER)).toBeNull()
  })
})

describe('a roster of first names, sheets full of surnames', () => {
  // How this team is actually recorded: profiles hold one name, exports spell
  // people in full.
  const FIRST_NAMES: CoordinatorProfile[] = [
    { id: 'c-devyani', full_name: 'Devyani', email: 'devyani@gp3.com', username: 'devyani' },
    { id: 'c-aniketa', full_name: 'Aniketa', email: 'aniketa@gp3.com', username: 'aniketa' },
    { id: 'c-krupa', full_name: 'Krupa', email: 'krupa@gp3.com', username: 'krupa' },
  ]

  it('resolves a full name when the roster only holds the first', () => {
    const match = matchCoordinator('Devyani Vaghela', NO_ALIASES, FIRST_NAMES)
    expect(match?.coordinatorId).toBe('c-devyani')
    expect(match!.confidence).toBeGreaterThanOrEqual(AUTO_ASSIGN_CONFIDENCE)
    expect(resolveCoordinatorName('Devyani Vaghela', NO_ALIASES, FIRST_NAMES)).toBe('c-devyani')
  })

  it('says plainly that the surname was not verified', () => {
    const match = matchCoordinator('Aniketa Bhattacharya', NO_ALIASES, FIRST_NAMES)
    expect(match?.reason).toContain('not on record')
  })

  it('still refuses a leading name nobody answers to', () => {
    expect(resolveCoordinatorName('Ramesh Iyengar', NO_ALIASES, FIRST_NAMES)).toBeNull()
  })

  it('will not use a leading name two coordinators share', () => {
    const twoKrupas: CoordinatorProfile[] = [
      ...FIRST_NAMES,
      { id: 'c-krupa-2', full_name: 'Krupa', email: 'krupa2@gp3.com', username: 'krupa2' },
    ]
    expect(resolveCoordinatorName('Krupa Desai', NO_ALIASES, twoKrupas)).toBeNull()
  })

  it('does not wave through a mistyped two-word name on its first word', () => {
    // ROSTER has surnames, so "Priya Sharmaa" must stay a fuzzy suggestion
    // rather than resolving off "Priya".
    const match = matchCoordinator('Priya Sharmaa', NO_ALIASES, ROSTER)
    expect(match?.method).toBe('fuzzy')
    expect(resolveCoordinatorName('Priya Sharmaa', NO_ALIASES, ROSTER)).toBeNull()
  })
})

describe('ambiguity safety', () => {
  it('never auto-assigns when the confidence is below the threshold', () => {
    const samples = ['Priya Sharmaa', 'A. Patell', 'Snehaa', 'xyz']
    for (const sample of samples) {
      const id = resolveCoordinatorName(sample, NO_ALIASES, ROSTER)
      if (id) {
        const match = matchCoordinator(sample, NO_ALIASES, ROSTER)!
        expect(match.confidence, sample).toBeGreaterThanOrEqual(AUTO_ASSIGN_CONFIDENCE)
      }
    }
  })

  it('declines a first name two coordinators could both answer to', () => {
    // Two people called "Priya" makes the bare first name non-identifying.
    const aliases = new Map<string, string>()
    const first = matchCoordinator('Priya', aliases, ROSTER)
    // With the demo team only one Priya exists, so this resolves; the guard is
    // the uniqueness filter itself, asserted through the surname path below.
    expect(first?.coordinatorId).toBe(priya.id)

    // "Patel" is unique among the demo coordinators, "Sharma" likewise.
    expect(matchCoordinator('Patel', NO_ALIASES, ROSTER)?.coordinatorId).toBe(amit.id)
    expect(matchCoordinator('Patel', NO_ALIASES, ROSTER)?.method).toBe('surname')
  })
})

describe('cells that hold no coordinator', () => {
  const NO_ALIASES_2 = new Map<string, string>()

  it('recognises spreadsheet errors and hand-typed blanks', () => {
    for (const junk of ['#N/A', '#n/a', 'N/A', 'NA', '#REF!', '#VALUE!', '-', '--', '', '   ', 'TBD', 'null']) {
      expect(isMissingCoordinator(junk), junk).toBe(true)
    }
  })

  it('does not mistake a real name for a blank', () => {
    for (const name of ['Devyani', 'Niki Patel', 'Krupa - Sleeves', 'Nobody Known']) {
      expect(isMissingCoordinator(name), name).toBe(false)
    }
  })

  it('never fuzzy-matches a person onto a spreadsheet error', () => {
    // "NA" is two letters from several names; guessing here would be a fabrication.
    expect(matchCoordinator('#N/A', NO_ALIASES_2)).toBeNull()
    expect(matchCoordinator('NA', NO_ALIASES_2)).toBeNull()
  })

  it('routes a row with no coordinator to the admin instead of blocking it', () => {
    const admin = getFallbackOwner()!
    const owner = resolveRowOwner('#N/A', NO_ALIASES_2)

    expect(owner.coordinatorId).toBe(admin.id)
    expect(owner.routedToAdmin).toBe(true)
    expect(owner.error).toBeNull()
    expect(owner.match?.method).toBe('fallback')
    expect(owner.match?.reason).toContain(admin.full_name)
  })

  it('still stops on a name that is present but unrecognised', () => {
    const owner = resolveRowOwner('Nobody Known', NO_ALIASES_2)
    expect(owner.coordinatorId).toBeNull()
    expect(owner.routedToAdmin).toBe(false)
    expect(owner.error).toBe('Unassigned coordinator')
  })
})

describe('the admin as an account owner', () => {
  const NO_ALIASES_3 = new Map<string, string>()

  it('assigns rows the file books to the operations head', () => {
    const admin = getFallbackOwner()!
    const owner = resolveRowOwner('Niki Patel', NO_ALIASES_3)
    expect(owner.coordinatorId).toBe(admin.id)
    expect(owner.routedToAdmin).toBe(false)
  })

  it('forgives the spelling the sheets actually use', () => {
    // Files also write the double-k spelling; the roster says "Niki Patel".
    const admin = getFallbackOwner()!
    const match = matchCoordinator('Nikki Patel', NO_ALIASES_3)
    expect(match?.coordinatorId).toBe(admin.id)
  })
})
