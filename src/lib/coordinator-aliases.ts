import type { CoordinatorAlias } from './types';
import { demoCompanyStore } from './demo-companies';
import { getAssignableOwners, getFallbackOwner } from '@/features/auth/AuthContext';

export async function getAliasMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  
  const aliases = demoCompanyStore.getAliases();
  for (const alias of aliases) {
    map.set(alias.alias_text.toLowerCase().trim(), alias.coordinator_id);
  }

  
  return map;
}

/**
 * Placeholders a coordinator cell holds when the sheet has no answer.
 *
 * `#N/A` and its siblings are what a failed VLOOKUP leaves behind, and typists
 * fill the rest in by hand. None of them is a person, so treating them as an
 * unrecognised *name* is wrong twice over: it invites someone to fuzzy-match a
 * human onto a spreadsheet error, and it blocks an import over a cell that was
 * always going to be empty.
 */
const MISSING_VALUE_TOKENS = new Set([
  '#n/a', '#na', 'n/a', 'na', 'nan', '#ref!', '#value!', '#name?', '#null!',
  '#div/0!', '#num!', '#error', 'null', 'nil', 'none', 'blank', 'tbd', 'tba',
  'unknown', 'not assigned', 'unassigned', 'no coordinator', 'xxx', '?',
])

/** True when a coordinator cell holds no usable name at all. */
export function isMissingCoordinator(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true
  const trimmed = String(raw).trim()
  if (!trimmed) return true
  // Rules of dashes, underscores or dots used as a visual blank.
  if (/^[-_.\s]+$/.test(trimmed)) return true
  return MISSING_VALUE_TOKENS.has(trimmed.toLowerCase())
}

/** Lowercase, strip honorifics/punctuation, collapse whitespace. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/g, '')
    .replace(/[._\-]+/g, ' ')
    .replace(/[^a-z0-9@ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Turns a raw cell into the candidate spellings worth matching.
 *
 * Coordinator columns in real sheets are messy: "Sharma, Priya", "Priya Sharma
 * (GP3)", "priya@gp3.com", "Priya Sharma - Labels". Each of these should land on
 * the same person.
 */
function nameCandidates(raw: string): string[] {
  const candidates = new Set<string>()
  const add = (v: string) => {
    const n = normalizeName(v)
    if (n) candidates.add(n)
  }

  add(raw)

  // Drop trailing qualifiers: "(GP3)", "- Labels", "/ West".
  const stripped = raw.replace(/[\(\[].*?[\)\]]/g, ' ').split(/\s+[-–/|]\s+/)[0]
  add(stripped)

  // "Sharma, Priya" -> "Priya Sharma"
  const comma = stripped.split(',')
  if (comma.length === 2) add(`${comma[1]} ${comma[0]}`)

  // Local part of an email address.
  const at = raw.indexOf('@')
  if (at > 0) add(raw.slice(0, at))

  return [...candidates]
}

/** Builds every spelling a known coordinator could reasonably be written as. */
function profileKeys(profile: { full_name: string; email: string; username?: string }): string[] {
  const keys = new Set<string>()
  const add = (v?: string) => {
    if (!v) return
    const n = normalizeName(v)
    if (n) keys.add(n)
  }

  add(profile.full_name)
  add(profile.email)
  add(profile.username)
  add(profile.email.split('@')[0])

  const parts = normalizeName(profile.full_name).split(' ').filter(Boolean)
  if (parts.length >= 2) {
    const [first, ...rest] = parts
    const last = rest[rest.length - 1]
    add(`${last} ${first}`) // "Sharma Priya"
    add(`${first[0]} ${last}`) // "P Sharma"
    add(`${first} ${last[0]}`) // "Priya S"
  }

  return [...keys]
}

export type CoordinatorMatchMethod =
  | 'alias'
  | 'profile'
  | 'first-name'
  | 'surname'
  | 'fuzzy'
  /** No name in the file at all; routed to the admin by policy, not by guess. */
  | 'fallback'

/** The fields of a coordinator profile the matcher actually reads. */
export interface CoordinatorProfile {
  id: string
  full_name: string
  email: string
  username?: string
  /** Which team they sit on, so a message can be addressed to one of them. */
  module?: string | null
}

export interface CoordinatorMatch {
  coordinatorId: string
  /** 0..1. */
  confidence: number
  method: CoordinatorMatchMethod
  /** Plain sentence explaining the match, shown next to the assignment. */
  reason: string
}

/** At or above this the match is applied without asking. */
export const AUTO_ASSIGN_CONFIDENCE = 0.85
/** Below this nothing is offered - a bad guess is worse than a blank box. */
export const SUGGEST_CONFIDENCE = 0.62

/** Edit distance, used to forgive spelling drift in a person's name. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  const current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current.slice()
  }
  return previous[b.length]
}

/**
 * Similarity of two already-normalized person names, 0..1.
 *
 * Blends shared name parts with edit distance on the whole string, so both
 * "Priya Sharma" vs "Sharma Priya" (reordered) and "Priya Sharmaa" vs
 * "Priya Sharma" (mistyped) score highly.
 */
function personSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  const aParts = new Set(a.split(' ').filter(Boolean))
  const bParts = new Set(b.split(' ').filter(Boolean))
  let shared = 0
  for (const part of aParts) if (bParts.has(part)) shared++
  const tokenScore = shared / Math.max(aParts.size, bParts.size)

  const longest = Math.max(a.length, b.length)
  const editScore = longest === 0 ? 0 : 1 - levenshtein(a, b) / longest

  // Weighted toward whole-name similarity, but a fully shared token set alone
  // is enough - that is just a reordering.
  return Math.max(tokenScore, editScore * 0.95, tokenScore * 0.6 + editScore * 0.4)
}

/**
 * Best guess at which coordinator a spreadsheet name refers to, with a
 * confidence and the reasoning behind it.
 *
 * The tiers are ordered by how much they can be trusted: an explicit alias, then
 * an exact profile spelling, then a *unique* first name or surname, and only
 * then fuzzy similarity. Every tier that could be ambiguous is skipped when more
 * than one coordinator qualifies - handing an account to the wrong person is far
 * more costly than leaving a row for someone to assign by hand.
 */
export function matchCoordinator(
  name: string,
  aliasMap: Map<string, string>,
  /**
   * Roster to match against, defaulting to the live coordinators.
   *
   * Injectable so the algorithm can be tested against name shapes the current
   * team does not happen to have. The roster is first names only today, which
   * would otherwise silently retire the surname, initial and reordering rules -
   * and uploaded sheets still spell people "Devyani Vaghela".
   */
  roster?: CoordinatorProfile[]
): CoordinatorMatch | null {
  if (isMissingCoordinator(name)) return null

  const candidates = nameCandidates(name)
  const profiles = roster ?? getAssignableOwners()
  const displayName = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? 'coordinator'

  // 1. Configured aliases, normalized on both sides.
  const normalizedAliases = new Map<string, string>()
  for (const [alias, id] of aliasMap) {
    const key = normalizeName(alias)
    if (key) normalizedAliases.set(key, id)
  }
  for (const candidate of candidates) {
    const hit = normalizedAliases.get(candidate)
    if (hit) {
      return {
        coordinatorId: hit,
        confidence: 1,
        method: 'alias',
        reason: `"${name.trim()}" is a saved alias for ${displayName(hit)}`,
      }
    }
  }

  // 2. The coordinator profiles themselves - the alias table is often empty.
  for (const candidate of candidates) {
    for (const profile of profiles) {
      if (profileKeys(profile).includes(candidate)) {
        return {
          coordinatorId: profile.id,
          confidence: 0.98,
          method: 'profile',
          reason: `Matches ${profile.full_name} exactly`,
        }
      }
    }
  }

  // 3. Unique first-name match ("Priya", "Amit").
  for (const candidate of candidates) {
    const matches = profiles.filter((p) => normalizeName(p.full_name).split(' ')[0] === candidate)
    if (matches.length === 1) {
      return {
        coordinatorId: matches[0].id,
        confidence: 0.92,
        method: 'first-name',
        reason: `Only ${matches[0].full_name} goes by "${candidate}"`,
      }
    }
  }

  // 4. A single-name coordinator written with a surname the roster never held.
  //
  // The team is recorded by first name ("Devyani") while exports spell people
  // in full ("Devyani Vaghela"), so without this the commonest spelling in a
  // real sheet resolves to nobody. Deliberately narrow: it fires only when the
  // profile name is a single word that equals the leading word of the input,
  // and only when exactly one coordinator answers to it. A two-word profile is
  // left to the fuzzy tier, so "Priya Sharmaa" stays a suggestion rather than
  // being waved through on its first name.
  const leadingToken = normalizeName(name).split(' ').filter(Boolean)[0]
  if (leadingToken) {
    const matches = profiles.filter((p) => {
      const parts = normalizeName(p.full_name).split(' ').filter(Boolean)
      return parts.length === 1 && parts[0] === leadingToken
    })
    if (matches.length === 1 && normalizeName(matches[0].full_name) !== normalizeName(name)) {
      return {
        coordinatorId: matches[0].id,
        confidence: 0.9,
        method: 'first-name',
        reason: `Only ${matches[0].full_name} goes by "${leadingToken}"; the rest of "${name.trim()}" is not on record`,
      }
    }
  }

  // 5. Unique surname match.
  for (const candidate of candidates) {
    const matches = profiles.filter((p) => {
      const parts = normalizeName(p.full_name).split(' ')
      return parts.length > 1 && parts[parts.length - 1] === candidate
    })
    if (matches.length === 1) {
      return {
        coordinatorId: matches[0].id,
        confidence: 0.88,
        method: 'surname',
        reason: `Only ${matches[0].full_name} has the surname "${candidate}"`,
      }
    }
  }

  // 6. Fuzzy similarity, offered as a suggestion rather than applied. Requires a
  // clear winner: if two coordinators are near-equally similar the spelling does
  // not identify anyone, and guessing between them is exactly the mistake this
  // whole ordering exists to avoid.
  const scored = profiles
    .map((profile) => {
      const best = Math.max(
        ...candidates.flatMap((candidate) =>
          profileKeys(profile).map((key) => personSimilarity(candidate, key))
        )
      )
      return { profile, score: best }
    })
    .sort((a, b) => b.score - a.score)

  const [leader, runnerUp] = scored
  if (leader && leader.score >= SUGGEST_CONFIDENCE) {
    const margin = leader.score - (runnerUp?.score ?? 0)
    if (margin >= 0.1) {
      return {
        coordinatorId: leader.profile.id,
        confidence: Math.min(leader.score, AUTO_ASSIGN_CONFIDENCE - 0.01),
        method: 'fuzzy',
        reason: `"${name.trim()}" closely resembles ${leader.profile.full_name}`,
      }
    }
  }

  return null
}

/**
 * Resolves a coordinator name to an id, or null when it cannot be trusted.
 *
 * Only matches at or above the auto-assign threshold count, so fuzzy
 * resemblances are excluded here and surfaced as suggestions instead.
 */
export function resolveCoordinatorName(
  name: string,
  aliasMap: Map<string, string>,
  roster?: CoordinatorProfile[]
): string | null {
  const match = matchCoordinator(name, aliasMap, roster)
  return match && match.confidence >= AUTO_ASSIGN_CONFIDENCE ? match.coordinatorId : null
}

export interface OwnerResolution {
  /** Who the row is booked against, or null when a human must choose. */
  coordinatorId: string | null
  match: CoordinatorMatch | null
  /** Validation message to raise, or null when the row is settled. */
  error: string | null
  /** True when the admin took the row because the file named nobody. */
  routedToAdmin: boolean
}

/**
 * Decides who owns an imported row, applied identically by every upload path.
 *
 * Three outcomes, in order:
 *   - the cell holds no name at all ("#N/A", blank, "-") - the admin takes it,
 *     because a failed lookup in the source sheet is not a reason to block an
 *     otherwise valid row, and someone has to own the account meanwhile;
 *   - the name resolves confidently - assign it;
 *   - anything else - leave it for a human, carrying the best guess along.
 */
export function resolveRowOwner(
  rawName: string | null | undefined,
  aliasMap: Map<string, string>
): OwnerResolution {
  if (isMissingCoordinator(rawName)) {
    const admin = getFallbackOwner()
    if (!admin) {
      return { coordinatorId: null, match: null, error: 'Coordinator is required', routedToAdmin: false }
    }
    return {
      coordinatorId: admin.id,
      match: {
        coordinatorId: admin.id,
        confidence: 1,
        method: 'fallback',
        reason: `The file names no coordinator, so this sits with ${admin.full_name} to reassign`,
      },
      error: null,
      routedToAdmin: true,
    }
  }

  const match = matchCoordinator(rawName as string, aliasMap)
  const coordinatorId =
    match && match.confidence >= AUTO_ASSIGN_CONFIDENCE ? match.coordinatorId : null

  return {
    coordinatorId,
    match,
    error: coordinatorId ? null : 'Unassigned coordinator',
    routedToAdmin: false,
  }
}

export async function addAlias(coordinatorId: string, aliasText: string): Promise<any> {
  const trimmedAlias = aliasText.trim();
  if (!trimmedAlias) {
    throw new Error('Alias text cannot be empty');
  }
  
  // Check if it's already taken
  const existing = demoCompanyStore.getAliases().find(
    a => a.alias_text.toLowerCase() === trimmedAlias.toLowerCase()
  );
  if (existing) {
    throw new Error('Alias already exists');
  }
  return demoCompanyStore.addAlias({ coordinator_id: coordinatorId, alias_text: trimmedAlias } as any);

}

export async function removeAlias(aliasId: string): Promise<any> {
  demoCompanyStore.removeAlias(aliasId);
  return null as any;

}

export async function getAllAliases(): Promise<CoordinatorAlias[]> {
  return demoCompanyStore.getAliases();

}
