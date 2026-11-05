/**
 * One-off: brings the old SERVICE sheet into the CRM (5 Nov 2026), and its
 * Total Customers numbers (columns N-O) as May 2026's customer counts (the
 * sheet's period, M3-M6).
 *
 *   npx tsx scripts/import-service-records.ts <workbook.xlsx> <store.json> <users.json> [--write]
 *
 * Without --write it only reports. Run it on the live store.json only while the
 * server is stopped. Rows already imported (same id) are skipped; a customer
 * count already set in the CRM is kept.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import XLSX from 'xlsx'

import { resolveResponsible, type BillingPerson } from '../src/lib/billing-issues'
import { serviceRecordsFromSheet, serviceRowScore } from '../src/lib/service-records'
import type { ServiceCustomerTarget, ServiceRecord } from '../src/lib/types'

const [bookPath, storePath, usersPath] = process.argv.slice(2)
const write = process.argv.includes('--write')
if (!bookPath || !storePath || !usersPath) {
  console.error('usage: tsx scripts/import-service-records.ts <workbook.xlsx> <store.json> <users.json> [--write]')
  process.exit(1)
}

const book = XLSX.read(readFileSync(bookPath))
const sheet = book.Sheets['SERVICE'] ?? book.Sheets[book.SheetNames[0]]
const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }).slice(1)

// Columns by position: the sheet's first header cell holds a number, not "Date".
const COLUMNS = ['Date', 'Coordinator Name', 'PO No.', 'FG Code', 'Sales Order No', 'Customer Name', 'Dispatch Status', 'Information Date', 'Original SO Dispatch Date', 'Date Diff']
const rows = grid.map((r) => Object.fromEntries(COLUMNS.map((c, i) => [c, r[i]])))

const usersFile = JSON.parse(readFileSync(usersPath, 'utf8'))
const users: { id: string; full_name: string; role: string }[] = Array.isArray(usersFile) ? usersFile : usersFile.users ?? usersFile.accounts ?? []
const people: BillingPerson[] = users.filter((u) => u.role === 'coordinator').map((u) => ({ id: u.id, full_name: u.full_name }))

const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const { records, skipped, reread } = serviceRecordsFromSheet(rows, people, now.toISOString(), today)

// The sheet's own Date Diff against the one worked out from the dates read.
let diffMismatch = 0
records.forEach((r) => {
  const row = rows[Number(r.id.replace('service-import-', '')) - 2]
  const given = row['Date Diff']
  if (typeof given === 'number' && r.information_date && r.original_dispatch_date) {
    const worked = Math.round((Date.parse(r.original_dispatch_date) - Date.parse(r.information_date)) / 86_400_000)
    if (worked !== given) diffMismatch++
  }
})

// Total Customers from the score block (N = name, O = customers).
const targets: ServiceCustomerTarget[] = []
for (const r of grid) {
  const name = String(r[13] ?? '').trim()
  const customers = Number(r[14])
  if (!name || !(customers > 0)) continue
  const id = resolveResponsible(name, people)
  if (id && people.some((p) => p.id === id)) targets.push({ coordinatorId: id, month: '2026-05', customers, updatedAt: now.toISOString(), updatedBy: null })
}

const store = JSON.parse(readFileSync(storePath, 'utf8'))
const have = new Set(((store.serviceRecords ?? []) as ServiceRecord[]).map((r) => r.id))
const fresh = records.filter((r) => !have.has(r.id))
const setAlready = new Set(((store.serviceTargets ?? []) as ServiceCustomerTarget[]).map((t) => `${t.coordinatorId}|${t.month ?? '2026-05'}`))
const freshTargets = targets.filter((t) => !setAlready.has(`${t.coordinatorId}|${t.month}`))

const name = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? '(not matched)'
const byPerson = new Map<string, number>()
for (const r of records) byPerson.set(name(r.coordinator_id), (byPerson.get(name(r.coordinator_id)) ?? 0) + 1)

console.log(`rows read: ${rows.length}, records: ${records.length}, left out: ${skipped}, dates read the other way round: ${reread}`)
console.log(`Date Diff differs from the sheet on ${diffMismatch} rows; rows scoring 0 (no information date): ${records.filter((r) => serviceRowScore(r) === 0).length}`)
console.log(`new to this store: ${fresh.length} (already there: ${records.length - fresh.length})`)
console.log('by coordinator:', Object.fromEntries([...byPerson.entries()].sort((a, b) => b[1] - a[1])))
console.log('unmatched names:', [...new Set(records.filter((r) => !r.coordinator_id).map((r) => r.coordinator_name))])
console.log('total customers:', targets.map((t) => `${name(t.coordinatorId)} ${t.customers}`).join(', '), `(new: ${freshTargets.length})`)

if (write && (fresh.length || freshTargets.length)) {
  store.serviceRecords = [...(store.serviceRecords ?? []), ...fresh]
  store.serviceTargets = [...(store.serviceTargets ?? []), ...freshTargets]
  writeFileSync(storePath, JSON.stringify(store))
  console.log(`written: ${fresh.length} records and ${freshTargets.length} customer counts added to ${storePath}`)
} else if (!write) {
  console.log('dry run: nothing written (add --write)')
}
