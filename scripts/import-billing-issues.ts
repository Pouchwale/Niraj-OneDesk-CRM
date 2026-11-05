/**
 * One-off: brings the old billing issue sheet into the CRM (5 Nov 2026).
 *
 *   npx tsx scripts/import-billing-issues.ts <workbook.xlsx> <store.json> <users.json> [--write]
 *
 * Without --write it only reports what it would add. Run it on the live
 * store.json only while the server is stopped (the server holds the store in
 * memory and would overwrite the change). Rows already imported (same id) are
 * skipped, so running it twice adds nothing.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import XLSX from 'xlsx'

import { billingIssuesFromSheet, type BillingPerson } from '../src/lib/billing-issues'
import type { BillingIssue } from '../src/lib/types'

const [bookPath, storePath, usersPath] = process.argv.slice(2)
const write = process.argv.includes('--write')
if (!bookPath || !storePath || !usersPath) {
  console.error('usage: tsx scripts/import-billing-issues.ts <workbook.xlsx> <store.json> <users.json> [--write]')
  process.exit(1)
}

const book = XLSX.read(readFileSync(bookPath))
const sheet = book.Sheets['Billing Issues'] ?? book.Sheets[book.SheetNames[0]]

// A merged cell holds its value in the top-left cell only: copy it down to the rest.
for (const range of sheet['!merges'] ?? []) {
  const top = sheet[XLSX.utils.encode_cell(range.s)]
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (r === range.s.r && c === range.s.c) continue
      if (top) sheet[XLSX.utils.encode_cell({ r, c })] = { ...top }
    }
  }
}

// Only the sheet's own 15 columns; the score block to the right is not data.
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', range: 0 }).map((row) => {
  const keep: Record<string, unknown> = {}
  for (const key of ['Sr. No', 'Date', 'Responsible Person 1', 'Responsible Person 2', 'Responsible Person 3', 'Customer Name', 'Issue', 'Issue Date', 'Solution', 'Solution Date', 'Invoice Number', 'CN Number', 'DN Number', 'Account Team Remarks', 'Coordinator Team Remarks']) {
    keep[key] = row[key]
  }
  return keep
})

const usersFile = JSON.parse(readFileSync(usersPath, 'utf8'))
const users: { id: string; full_name: string; role: string }[] = Array.isArray(usersFile) ? usersFile : usersFile.users ?? usersFile.accounts ?? []
const people: BillingPerson[] = users.filter((u) => u.role !== 'admin').map((u) => ({ id: u.id, full_name: u.full_name }))

const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const { issues, skipped, reread } = billingIssuesFromSheet(rows, people, now.toISOString(), today)

const store = JSON.parse(readFileSync(storePath, 'utf8'))
const have = new Set(((store.billingIssues ?? []) as BillingIssue[]).map((i) => i.id))
const fresh = issues.filter((i) => !have.has(i.id))

const name = (v: string | null) => users.find((u) => u.id === v)?.full_name ?? v
const byPerson = new Map<string, number>()
for (const i of issues) if (i.responsible_1) byPerson.set(name(i.responsible_1)!, (byPerson.get(name(i.responsible_1)!) ?? 0) + 1)

console.log(`rows read: ${rows.length}, issues: ${issues.length}, empty rows left out: ${skipped}, dates read the other way round: ${reread}`)
console.log(`new to this store: ${fresh.length} (already there: ${issues.length - fresh.length})`)
console.log('Responsible Person 1:', Object.fromEntries([...byPerson.entries()].sort((a, b) => b[1] - a[1])))

if (write && fresh.length) {
  store.billingIssues = [...(store.billingIssues ?? []), ...fresh]
  writeFileSync(storePath, JSON.stringify(store))
  console.log(`written: ${fresh.length} issues added to ${storePath}`)
} else if (!write) {
  console.log('dry run: nothing written (add --write)')
}
