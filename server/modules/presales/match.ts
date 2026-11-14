/**
 * A coordinator name as the Pre-Sales file writes it, matched to a CRM
 * coordinator (14 Nov 2026: for customers with no CRM account, the user chose
 * the coordinator named on their latest order in the file).
 *
 * The file's names vary ("Krina", "KRINA SHAH", "krina"): a name matches a
 * coordinator whose full name it equals, or whose first name it equals, case
 * and spacing aside. A name that fits nobody, or more than one coordinator
 * ("Disha" for Disha Acharya and Disha Chaudhary), matches no one.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim()

export function coordinatorMatcher(coordinators: readonly { id: string; name: string }[]): (fileName: string | null | undefined) => string | null {
  const people = coordinators.map((c) => ({ id: c.id, full: norm(c.name), first: norm(c.name).split(' ')[0] ?? '' })).filter((p) => p.full)
  const cache = new Map<string, string | null>()
  return (fileName) => {
    const name = norm(fileName ?? '')
    if (!name) return null
    if (cache.has(name)) return cache.get(name)!
    const exact = people.filter((p) => p.full === name || p.full.replace(/ /g, '') === name.replace(/ /g, ''))
    const byFirst = exact.length ? exact : name.includes(' ') ? [] : people.filter((p) => p.first === name)
    const found = byFirst.length === 1 ? byFirst[0].id : null
    cache.set(name, found)
    return found
  }
}
