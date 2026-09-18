/**
 * Matching a customer by name or by reference, when the text is not exact.
 *
 * Kept when the reconciliation desk was removed: the assistant still has to
 * work out which customer a question is about, and people write a company name
 * three different ways and quote a BP code with whatever punctuation they like.
 */

/** Suffixes that carry no identifying information in an Indian company name. */
const LEGAL_SUFFIXES = [
  'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'corp', 'corporation',
  'co', 'company', 'and', 'the', 'india', 'enterprises', 'enterprise',
  'industries', 'industry', 'sons', 'bros', 'brothers', 'group',
]

/**
 * Lowercases, strips punctuation and drops legal suffixes so that
 * "Balaji Print Pack Pvt. Ltd." and "BALAJI PRINTPACK PRIVATE LIMITED"
 * reduce to the same token set.
 */
export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .replace(/[.,'"`&/\\()\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0 && !LEGAL_SUFFIXES.includes(token))
    .join(' ')
}

/** Normalised name with spaces removed, so "printpack" matches "print pack". */
function collapse(value: string): string {
  return value.replace(/\s+/g, '')
}

/** Levenshtein distance, capped implicitly by the shorter string's length. */
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

/** Similarity in 0..1 derived from edit distance. */
function editSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - levenshtein(a, b) / longest
}

/**
 * Similarity of two company names in 0..1.
 *
 * Combines a token-set overlap (robust to reordering and extra words, which is
 * how sister concerns and trading names differ) with an edit-distance score on
 * the collapsed strings (robust to spelling drift and joined words). The higher
 * of the two wins, because either kind of evidence alone is convincing.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = normalizeCompanyName(a)
  const right = normalizeCompanyName(b)
  if (!left || !right) return 0
  if (left === right) return 1

  const leftTokens = new Set(left.split(' '))
  const rightTokens = new Set(right.split(' '))
  let shared = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared++
  }

  // Scored against the smaller set so a short trading name contained in the
  // registered name still counts, then damped by how much of the *longer* name
  // was matched. Without that damping a single generic word shared between
  // "Meridian Foods" and "Konkan Agro Foods" scores 0.5 and drags unrelated
  // customers into the candidate list.
  const containment = shared / Math.min(leftTokens.size, rightTokens.size)
  const coverage = shared / Math.max(leftTokens.size, rightTokens.size)
  const tokenScore = containment * Math.sqrt(coverage)

  const editScore = editSimilarity(collapse(left), collapse(right))
  return Math.max(tokenScore, editScore)
}

/**
 * Digit-and-letter core of a reference, e.g. "INV/2025-26/0412" becomes
 * "inv2025260412". Used to compare identifiers that different systems format
 * differently.
 */
export function normalizeReference(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}
