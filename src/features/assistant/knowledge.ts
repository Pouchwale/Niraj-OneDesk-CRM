/**
 * The assistant's understanding of the system.
 *
 * The nudge rules push work outwards - "chase this, log that". This is the
 * other half: it answers questions. Ask it about a customer, an invoice, a
 * colleague, what is owed, what has been collected, what is stuck in the
 * the ageing book, and it reads the live data and answers.
 *
 * Every answer is computed from the records, never generated. In a receivables
 * system a confidently wrong number is worse than no answer at all, so when the
 * question is not understood the assistant says so and offers what it does
 * know, rather than guessing.
 *
 * Answers are scoped to the person asking: a coordinator is told about their
 * own accounts, and the admin about everything.
 */

import type { Company, Followup, OverduePayment, UserRole } from '@/lib/types'
import { seesAllAccounts } from '@/lib/users/roles'
import { carriedOverLine } from './daily-plan'
import { isBankrupt, isSetAside } from '@/lib/no-followup'
import { recalculateDueDate } from '@/lib/due-date'
import type { Commitment } from '@/lib/followups-api'
import { nameSimilarity, normalizeReference } from '@/lib/name-match'
import {
  AUTO_ASSIGN_CONFIDENCE,
  matchCoordinator,
  type CoordinatorProfile,
} from '@/lib/coordinator-aliases'
import { formatCurrency, formatDate, todayISO } from '@/lib/utils'
import { sentMessages } from '@/lib/reminders'
import type { AssistantTask } from './types'
import { DAY_MS } from '@/lib/constants'
import { normalizeBpCode, sameBpCode } from '@/lib/bp-code'
import {
  bookForCoordinator,
  buildReceivablesBook,
  summariseBook,
  type BookAccount,
} from '@/lib/receivables-book'

export interface SystemSnapshot {
  role: UserRole
  userId: string
  userName: string
  today?: string
  companies: Company[]
  overduePayments: OverduePayment[]
  followups: Followup[]
  commitments: Commitment[]
  coordinators: CoordinatorProfile[]
  /** The nudge queue, so "what should I do" answers from the same source. */
  tasks: AssistantTask[]
  /** Each coordinator's daily plan, by id. Present for whoever runs the team. */
  teamPlans?: Record<
    string,
    {
      done: number
      total: number
      open: number
      carriedOver: number
      oldestCarried: string | null
      date: string
      items?: { account: string; status: string; nudge: string }[]
    }
  >
  /** The asker's own plan for today, when they are a coordinator. */
  myPlan?: {
    done: number
    total: number
    carriedOver: number
    oldestCarried: string | null
    date: string
    items: { account: string; status: string; nudge: string; waiting: string | null }[]
  }
}

export interface AssistantFact {
  label: string
  value: string
}

/**
 * Something the assistant cannot do itself.
 *
 * `askAssistant` is pure - it reads and answers. Sending a reminder writes, so
 * it is returned as an instruction for the caller to carry out, which keeps the
 * question-answering testable without a store behind it.
 */
export interface AssistantRecipient {
  id: string
  name: string
}

export interface AssistantAction {
  kind: 'remind'
  /** Everyone it goes to: one person, a team, or all the coordinators. */
  recipients: AssistantRecipient[]
  /** How they were addressed, for the confirmation: "the team", "Pragati Patel". */
  audience: string
  subject: string | null
  message: string
  /** Where the recipient lands when they open it, when it is about a record. */
  link?: string | null
}

export interface AssistantAnswer {
  /** Which question was recognised; `unknown` when nothing matched. */
  intent: string
  text: string
  facts?: AssistantFact[]
  /** Things worth asking next, offered as tappable prompts. */
  followUps?: string[]
  action?: AssistantAction
  /** True when Claude wrote the text, from the same facts. */
  ai?: boolean
  /** Set when Claude was asked but could not answer, so the rules answered instead. */
  aiError?: string
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS
  )
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s/@-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function has(text: string, ...words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`
}

/* ===== Scope ===== */

interface Scope {
  companies: Company[]
  overduePayments: OverduePayment[]
  followups: Followup[]
  commitments: Commitment[]
  /** True when the answer covers the whole business rather than one person. */
  wholeBusiness: boolean
}

/**
 * Narrows the data to what the asker is responsible for.
 *
 * A coordinator asking "how much is overdue" means *their* book; the same
 * question from the admin means the company's. Answering the wrong one is not a
 * privacy leak so much as a useless answer.
 */
function scopeFor(snapshot: SystemSnapshot): Scope {
  if (snapshot.role !== 'coordinator') {
    return {
      companies: snapshot.companies,
      overduePayments: snapshot.overduePayments,
      followups: snapshot.followups,
      commitments: snapshot.commitments,
      wholeBusiness: true,
    }
  }

  const id = snapshot.userId
  return {
    companies: snapshot.companies.filter((c) => c.assigned_coordinator_id === id),
    overduePayments: snapshot.overduePayments.filter((p) => p.assigned_coordinator_id === id),
    followups: snapshot.followups.filter((f) => f.coordinator_id === id),
    commitments: snapshot.commitments.filter((c) => c.coordinator_id === id),
    wholeBusiness: false,
  }
}

/* ===== Entity resolution ===== */

interface CustomerRecord {
  bpCode: string | null
  name: string
  /** Everything owed, from whichever dataset knows about them. */
  outstanding: number
  overdue: OverduePayment[]
  company?: Company
  ownerId: string | null
}

/**
 * The receivables book for what the asker can see - the same one the
 * Overview and the dashboard read, so "how much is owed" gets one answer.
 */
function bookOf(scope: Scope, today: string): BookAccount[] {
  return buildReceivablesBook({
    companies: scope.companies,
    overduePayments: scope.overduePayments,
    today,
  })
}

/**
 * Every customer the asker can see, one record each.
 *
 * Open accounts come from the book. Customers the team has already closed are
 * kept too, owing nothing, so "has Balaji paid?" gets "nothing outstanding"
 * rather than "never heard of them".
 */
function customerIndex(scope: Scope, today: string = todayISO()): CustomerRecord[] {
  const records: CustomerRecord[] = []
  const seen = new Set<string>()

  for (const account of bookOf(scope, today)) {
    seen.add(account.key)
    records.push({
      bpCode: account.bpCode,
      name: account.name,
      outstanding: account.outstanding,
      overdue: account.ageing ? [account.ageing] : [],
      company: account.company,
      ownerId: account.coordinatorId,
    })
  }

  for (const company of scope.companies) {
    const code = normalizeBpCode(company.sap_bp_code)
    const key = code ? `bp:${code}` : `company:${company.id}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({
      bpCode: code,
      name: company.name,
      outstanding: 0,
      overdue: [],
      company,
      ownerId: company.assigned_coordinator_id,
    })
  }

  for (const row of scope.overduePayments) {
    const code = normalizeBpCode(row.bp_code)
    const key = code ? `bp:${code}` : `ageing:${row.id}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({
      bpCode: code,
      name: row.customer_name || row.bp_code,
      outstanding: 0,
      overdue: [row],
      ownerId: row.assigned_coordinator_id,
    })
  }

  {
  }

  return records
}

/** The customer a question is about, when it names one recognisably. */
function findCustomer(question: string, customers: CustomerRecord[]): CustomerRecord | null {
  const normalized = normalize(question)
  const reference = normalizeReference(question)

  // A BP code is unambiguous, so it wins outright.
  for (const customer of customers) {
    if (!customer.bpCode) continue
    const code = normalizeReference(customer.bpCode)
    if (code.length >= 4 && reference.includes(code)) return customer
  }

  let best: { customer: CustomerRecord; score: number } | null = null
  for (const customer of customers) {
    const name = normalize(customer.name)
    if (!name) continue

    // Whole name present in the question is the strongest signal.
    let score = normalized.includes(name) ? 1 : 0

    // Otherwise look for a distinctive word from the name: "balaji", "meridian".
    if (score === 0) {
      const distinctive = name
        .split(' ')
        .filter((word) => word.length >= 5 && !GENERIC_NAME_WORDS.has(word))
      if (distinctive.some((word) => normalized.includes(word))) score = 0.9
    }

    if (score === 0) score = nameSimilarity(normalized, customer.name) >= 0.8 ? 0.8 : 0
    if (score > 0 && (!best || score > best.score)) best = { customer, score }
  }

  return best?.customer ?? null
}

/** Words too common in company names to identify anybody on their own. */
const GENERIC_NAME_WORDS = new Set([
  'foods', 'products', 'industries', 'packaging', 'private', 'limited', 'traders',
  'enterprise', 'enterprises', 'agro', 'papers', 'mills', 'dairy', 'exports', 'print',
  'pack', 'beverages', 'chemicals', 'textile', 'herbals', 'publication',
])

/**
 * The colleague a question is about.
 *
 * Uses the same matcher the uploads do, so "how is Diya doing" resolves off a
 * first name while a shared one ("Disha") is refused. A high confidence bar
 * keeps stray words in an unrelated question from landing on a person.
 */
function findCoordinator(
  question: string,
  coordinators: CoordinatorProfile[]
): CoordinatorProfile | null {
  // The matcher expects a name, not a sentence, so try the words in the
  // question: each on its own, and each adjacent pair for "Disha Acharya".
  // Longest first, so a full name beats the shared first name inside it.
  const words = normalize(question).split(' ').filter((word) => word.length >= 3)
  const candidates = [
    ...words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`),
    ...words,
  ]

  for (const candidate of candidates) {
    const match = matchCoordinator(candidate, new Map(), coordinators)
    if (!match || match.confidence < AUTO_ASSIGN_CONFIDENCE) continue
    const found = coordinators.find((c) => c.id === match.coordinatorId)
    if (found) return found
  }
  return null
}

/* ===== Shared derivations ===== */

function lastContactWith(scope: Scope, customer: CustomerRecord): Followup | null {
  const ids = new Set<string>([
    ...(customer.company ? [customer.company.id] : []),
    ...customer.overdue.map((o) => o.id),
  ])
  const hits = scope.followups
    .filter((f) => ids.has(f.entity_id))
    .sort((a, b) => b.followup_date.localeCompare(a.followup_date))
  return hits[0] ?? null
}

/**
 * How the past-90-days figure on an account arose, in the words of the record
 * that supplied it.
 */
function agedDetail(account: BookAccount, today: string): string {
  if (account.source === 'ageing' && account.ageing) {
    return (account.ageing.due_121_plus ?? 0) > 0
      ? `${formatCurrency(account.ageing.due_121_plus)} past 120 days`
      : 'in the 91-120 bucket'
  }
  return account.daysPastDue !== null ? `${account.daysPastDue} days past due` : 'critical'
}

/* ===== Answerers ===== */

function answerCustomer(
  customer: CustomerRecord,
  snapshot: SystemSnapshot,
  scope: Scope
): AssistantAnswer {
  const today = snapshot.today ?? todayISO()
  const facts: AssistantFact[] = []

  facts.push({ label: 'Outstanding', value: formatCurrency(customer.outstanding) })

  const aged = customer.overdue.reduce(
    (sum, r) => sum + (r.due_91_120 ?? 0) + (r.due_121_plus ?? 0),
    0
  )
  if (aged > 0) facts.push({ label: 'Past 90 days', value: formatCurrency(aged) })

  const lastContact = lastContactWith(scope, customer)
  if (lastContact) {
    const day = lastContact.followup_date.slice(0, 10)
    facts.push({
      label: 'Last contact',
      value: `${formatDate(day)} by ${nameOf(snapshot, lastContact.coordinator_id)}${
        lastContact.notes ? ` — “${lastContact.notes}”` : ''
      }`,
    })
  }

  const promise = scope.commitments
    .filter((c) => sameBpCode(c.bp_code, customer.bpCode))
    .sort((a, b) => a.committed_date.localeCompare(b.committed_date))[0]
  if (promise) {
    const overdue = promise.committed_date <= today
    facts.push({
      label: 'Promise',
      value: `${formatCurrency(promise.amount)} by ${formatDate(promise.committed_date)}${
        overdue ? ' — already past' : ''
      }`,
    })
  }

  if (scope.wholeBusiness && customer.ownerId) {
    facts.push({ label: 'Owned by', value: nameOf(snapshot, customer.ownerId) })
  }

  const headline =
    customer.outstanding > 0.5
      ? `${customer.name} owes ${formatCurrency(customer.outstanding)}.`
      : `${customer.name} has nothing outstanding.`

  return {
    intent: 'customer',
    text: headline,
    facts,
    followUps: [`Has ${customer.name} paid recently?`, 'What should I do first?'],
  }
}

function answerBook(snapshot: SystemSnapshot, scope: Scope): AssistantAnswer {
  const today = snapshot.today ?? todayISO()
  const book = bookOf(scope, today)
  const totals = summariseBook(book)

  const biggest = [...book].sort((a, b) => b.outstanding - a.outstanding).slice(0, 3)

  return {
    intent: 'book',
    text: scope.wholeBusiness
      ? `The company is owed ${formatCurrency(totals.outstanding)} across ${book.length} customers.`
      : `You are chasing ${formatCurrency(totals.outstanding)} across ${book.length} accounts.`,
    facts: [
      { label: 'Past due', value: formatCurrency(totals.pastDue) },
      {
        label: 'Past 90 days',
        value:
          totals.criticalAmount > 0
            ? `${formatCurrency(totals.criticalAmount)} over ${totals.criticalAccounts} accounts`
            : 'None',
      },
      {
        label: 'Largest',
        value: biggest.map((c) => `${c.name} ${formatCurrency(c.outstanding, true)}`).join(', ') || '—',
      },
    ],
    followUps: ['What is past 90 days?', 'Who broke a promise?'],
  }
}

function answerAgeing(snapshot: SystemSnapshot, scope: Scope): AssistantAnswer {
  const today = snapshot.today ?? todayISO()
  // One line per customer, from the shared book, so this list is the "past 90
  // days" figure the Overview card and the dashboard show.
  const rows = bookOf(scope, today)
    .filter((account) => account.criticalAmount > 0)
    .map((account) => ({
      name: account.name,
      value: account.criticalAmount,
      detail: agedDetail(account, today),
    }))

  rows.sort((a, b) => b.value - a.value)
  const total = rows.reduce((sum, r) => sum + r.value, 0)

  if (rows.length === 0) {
    return {
      intent: 'ageing',
      text: scope.wholeBusiness
        ? 'Nothing on the book is past 90 days.'
        : 'Nothing of yours is past 90 days.',
      followUps: ['How much is owed in total?'],
    }
  }

  return {
    intent: 'ageing',
    text: `${formatCurrency(total)} is past 90 days across ${rows.length} account${rows.length === 1 ? '' : 's'}. This is the money most likely to be written off.`,
    facts: rows.slice(0, 6).map((r) => ({ label: r.name, value: `${formatCurrency(r.value)} — ${r.detail}` })),
    followUps: ['What should I do first?'],
  }
}

function answerPromises(snapshot: SystemSnapshot, scope: Scope): AssistantAnswer {
  const today = snapshot.today ?? todayISO()

  // A promise stands until the account it was made about is paid or settled,
  // which getFollowupCommitments has already applied.
  const due = scope.commitments.filter((c) => c.committed_date <= today)
  const upcoming = scope.commitments.filter((c) => c.committed_date > today)

  if (due.length === 0) {
    return {
      intent: 'promises',
      text:
        upcoming.length > 0
          ? `No broken promises. ${upcoming.length} payment${upcoming.length === 1 ? ' is' : 's are'} still due in future.`
          : 'No outstanding payment promises.',
      facts: upcoming.slice(0, 5).map((c) => ({
        label: nameForBp(snapshot, c.bp_code),
        value: `${formatCurrency(c.amount)} by ${formatDate(c.committed_date)}`,
      })),
    }
  }

  const total = due.reduce((sum, c) => sum + c.amount, 0)
  return {
    intent: 'promises',
    text: `${due.length} promise${due.length === 1 ? '' : 's'} worth ${formatCurrency(total)} ${due.length === 1 ? 'has' : 'have'} come due without payment.`,
    facts: due.slice(0, 6).map((c) => ({
      label: nameForBp(snapshot, c.bp_code),
      value: `${formatCurrency(c.amount)}, promised for ${formatDate(c.committed_date)}${
        scope.wholeBusiness && c.coordinator_id ? ` · ${nameOf(snapshot, c.coordinator_id)}` : ''
      }`,
    })),
    followUps: ['What should I do first?'],
  }
}

/** "Plans today: 5 of 12 done", when the snapshot carries the team's plans. */
function teamPlanFact(snapshot: SystemSnapshot): AssistantFact[] {
  const plans = Object.values(snapshot.teamPlans ?? {}).filter((p) => p.total > 0)
  if (plans.length === 0) return []
  const done = plans.reduce((sum, p) => sum + p.done, 0)
  const total = plans.reduce((sum, p) => sum + p.total, 0)
  return [{ label: 'Plans today', value: `${done} of ${total} follow-ups done` }]
}

function answerTeam(snapshot: SystemSnapshot): AssistantAnswer {
  // Each coordinator's share of the same book the Overview table shows.
  const book = bookOf(scopeFor({ ...snapshot, role: 'team_leader' }), snapshot.today ?? todayISO())
  const rows = snapshot.coordinators.map((coordinator) => ({
    name: coordinator.full_name,
    value: summariseBook(bookForCoordinator(book, coordinator.id)).outstanding,
  }))

  rows.sort((a, b) => b.value - a.value)
  const total = rows.reduce((sum, r) => sum + r.value, 0)

  return {
    intent: 'team',
    text: `${formatCurrency(total)} is spread across ${rows.filter((r) => r.value > 0).length} coordinators.`,
    facts: [
      ...rows.filter((r) => r.value > 0).map((r) => ({ label: r.name, value: formatCurrency(r.value) })),
      ...teamPlanFact(snapshot),
    ],
    followUps: ['Who broke a promise?', 'What is past 90 days?'],
  }
}

function answerCoordinator(
  coordinator: CoordinatorProfile,
  snapshot: SystemSnapshot
): AssistantAnswer {
  const today = snapshot.today ?? todayISO()
  const scope: Scope = {
    companies: snapshot.companies.filter((c) => c.assigned_coordinator_id === coordinator.id),
    overduePayments: snapshot.overduePayments.filter(
      (r) => r.assigned_coordinator_id === coordinator.id
    ),
    followups: snapshot.followups.filter((f) => f.coordinator_id === coordinator.id),
    commitments: snapshot.commitments.filter((c) => c.coordinator_id === coordinator.id),
    wholeBusiness: false,
  }
  // The same figure as their row on the Overview and their own dashboard.
  const mine = bookOf(scope, today)
  const book = summariseBook(mine).outstanding
  const plan = snapshot.teamPlans?.[coordinator.id] ?? null

  return {
    intent: 'coordinator',
    text: `${coordinator.full_name} is carrying ${formatCurrency(book)}.`,
    facts: [
      { label: 'Accounts', value: String(mine.length) },
      { label: 'Follow-ups logged', value: String(scope.followups.length) },
      ...(plan
        ? [
            {
              label: "Today's plan",
              value:
                plan.total === 0
                  ? 'nothing planned'
                  : [
                      `${plan.done} of ${plan.total} done`,
                      plan.open > 0 ? `${plan.open} open` : null,
                      // Work that came forward is the work most likely to be
                      // forgotten, so it is named rather than folded silently
                      // into the count of what is open.
                      carriedOverLine(plan),
                    ]
                      .filter(Boolean)
                      .join(', '),
            },
          ]
        : []),
    ],
    followUps: ['How is the team doing?'],
  }
}

/** Days without a logged follow-up before an unsettled account counts as quiet. */
const QUIET_AFTER_DAYS = 14

/**
 * "Which accounts have gone quiet?" — unsettled accounts nobody has spoken to
 * in a fortnight, oldest silence first.
 *
 * The help card has offered this question since the assistant shipped; until
 * now the router had no answer for it.
 */
function answerQuiet(snapshot: SystemSnapshot, scope: Scope): AssistantAnswer {
  const today = snapshot.today ?? todayISO()
  const lastContact = new Map<string, string>()
  for (const f of scope.followups) {
    const day = f.followup_date.slice(0, 10)
    const seen = lastContact.get(f.entity_id)
    if (!seen || day > seen) lastContact.set(f.entity_id, day)
  }

  const quiet: { name: string; amount: number; silentDays: number | null }[] = []
  for (const account of bookOf(scope, today)) {
    // A follow-up is filed on the company or the ageing row; whichever the
    // account came from, the other record's calls count for it too.
    const last = [account.company?.id, account.ageing?.id]
      .filter((id): id is string => Boolean(id))
      .map((id) => lastContact.get(id))
      .filter((day): day is string => Boolean(day))
      .sort()
      .pop()
    const silentDays = last ? daysBetween(last, today) : null
    if (silentDays === null || silentDays >= QUIET_AFTER_DAYS) {
      quiet.push({ name: account.name, amount: account.outstanding, silentDays })
    }
  }

  if (quiet.length === 0) {
    return {
      intent: 'quiet',
      text: `Every open account has been contacted within the last ${QUIET_AFTER_DAYS} days.`,
      followUps: ['What should I do first?'],
    }
  }

  quiet.sort((a, b) => (b.silentDays ?? Infinity) - (a.silentDays ?? Infinity) || b.amount - a.amount)
  const total = quiet.reduce((sum, q) => sum + q.amount, 0)
  return {
    intent: 'quiet',
    text: `${quiet.length} ${quiet.length === 1 ? 'account has' : 'accounts have'} had no follow-up for ${QUIET_AFTER_DAYS} days or more, ${formatCurrency(total)} between them.`,
    facts: quiet.slice(0, 5).map((q) => ({
      label: q.name,
      value: `${formatCurrency(q.amount)} · ${q.silentDays === null ? 'never contacted' : `${q.silentDays} days silent`}`,
    })),
    followUps: [`Remind me about ${quiet[0].name}`, 'What should I do first?'],
  }
}

function answerPriority(snapshot: SystemSnapshot, scope: Scope): AssistantAnswer {
  if (snapshot.tasks.length === 0) {
    // No broken promises or silences in the nudge queue, but a balance in the
    // 90+ buckets still needs someone; saying "nothing" while the bell shows
    // a critical account would be a contradiction.
    const critical = bookOf(scope, snapshot.today ?? todayISO())
      .filter((account) => account.isCritical)
      .map((account) => ({ name: account.name, amount: account.outstanding }))
      .sort((a, b) => b.amount - a.amount)

    if (critical.length > 0) {
      return {
        intent: 'priority',
        text: `No promises are broken and nothing has gone quiet, but ${critical.length} ${critical.length === 1 ? 'account is' : 'accounts are'} critical. Start with ${critical[0].name} (${formatCurrency(critical[0].amount)}).`,
        facts: critical.slice(1, 4).map((c, index) => ({ label: `Then ${index + 2}`, value: `${c.name} · ${formatCurrency(c.amount)}` })),
        followUps: ['What is past 90 days?'],
      }
    }

    return {
      intent: 'priority',
      text: 'Nothing needs you right now — every commitment is current and no account has gone quiet.',
      followUps: ['How much is owed?'],
    }
  }

  const [first, ...rest] = snapshot.tasks
  return {
    intent: 'priority',
    text: first.message,
    facts: rest.slice(0, 4).map((task, index) => ({
      label: `Then ${index + 2}`,
      value: task.message,
    })),
    followUps: ['What is past 90 days?'],
  }
}

/* ===== Messaging the team ===== */

/** The verbs that mean "pass this on to somebody". */
const MESSAGE_VERBS =
  /^\s*(?:please\s+|pls\s+|can\s+you\s+|could\s+you\s+|kindly\s+|just\s+)*(?:send\s+a\s+message\s+to|send\s+a\s+message|drop\s+a\s+message\s+to|message|remind|tell|notify|nudge|inform|ask|chase\s+up|chase|let)\s+/i

/**
 * Whether the sentence is an instruction to pass something on - it starts with
 * the verb ("tell Pragati ...", "please let the team know ...") and is not
 * addressed to Robi itself ("tell me why ...", "remind me what ...").
 *
 * It used to fire on the word anywhere, so "can you tell me why AyuLabs is
 * missing?" was answered "who should I send that to?".
 */
export function isMessageRequest(question: string): boolean {
  if (!MESSAGE_VERBS.test(question)) return false
  const afterVerb = question.replace(MESSAGE_VERBS, '')
  return !/^\s*(?:me|us|myself)\b/i.test(afterVerb)
}

/** Ways of addressing everyone at once. */
const EVERYONE =
  /\b(everyone|everybody|all\s+coordinators?|all\s+of\s+(?:them|the\s+team)|the\s+coordinators?|whole\s+team|entire\s+team|the\s+team|my\s+team|all\s+the\s+team)\b/i

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The instruction itself, with the addressing stripped off the front.
 *
 * "tell Pragati to call Balaji before five" leaves "call Balaji before five",
 * which is what the coordinator actually needs to read. The leader's own words
 * carry far more than a generated "you have been asked to follow up".
 */
export function instructionFrom(question: string, addressedAs: string[]): string {
  let text = question.trim().replace(/^["“']|["”']$/g, '')
  text = text.replace(MESSAGE_VERBS, '')

  // Whoever was addressed, however they were named. Longest first, and only
  // once: "tell the Pouchwale team the file is due" must lose the addressing
  // and keep "the file is due" — stripping a second time would eat the article
  // and quietly reword what the leader said.
  const pieces = [...new Set(addressedAs.flatMap((phrase) => [phrase, ...phrase.trim().split(/\s+/)]))]
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= 2)
    .sort((a, b) => b.length - a.length)

  for (const piece of pieces) {
    const before = text
    text = text.replace(new RegExp(`^\\s*${escapeRegExp(piece)}\\b[\\s,:;-]*`, 'i'), '')
    if (text !== before) break
  }

  // "... and notify them that ...", "... and let everyone know that ...": the
  // second verb is more addressing, not the message. Left in, the team read
  // "and notify them that Each day, Robi AI will ...".
  text = text.replace(
    /^\s*(?:and|&)\s+(?:please\s+)?(?:notify|inform|tell|let|remind|ask|message|update)\s+(?:them|everyone|everybody|all(?:\s+of\s+them)?|the\s+team|him|her)?\s*/i,
    ''
  )

  // "let the team know that ...", "tell her to ...", "message: ..."
  text = text.replace(/^\s*(?:know\s+)?(?:that|to|about|please|:|-|,)\s+/i, '')
  text = text.replace(/^\s*[:,-]\s*/, '')
  return text.trim()
}

/** Everyone on a named team, when the question names one. */
function teamNamed(question: string, coordinators: CoordinatorProfile[]): { label: string; members: CoordinatorProfile[] } | null {
  const modules = [...new Set(coordinators.map((c) => c.module).filter((m): m is string => Boolean(m)))]
  const text = normalize(question)

  for (const module of modules) {
    const key = normalize(module)
    if (!key) continue
    // "the GP3 team", "GP3 coordinators", or just "GP3" alongside a message verb.
    if (new RegExp(`\\b${escapeRegExp(key)}\\b`).test(text)) {
      const members = coordinators.filter((c) => c.module && normalize(c.module) === key)
      if (members.length > 0) return { label: `the ${module} team`, members }
    }
  }
  return null
}

/**
 * "Tell Pragati to call Balaji", "tell the team month end is Friday".
 *
 * One person, one team, or all the coordinators. A single coordinator is
 * resolved with the same matcher the uploads use, so the uniqueness guard
 * applies here too: with two people called Disha, a bare "Disha" is refused
 * rather than sent to whichever one sorted first. Sending a task to the wrong
 * person is worse than asking again.
 */
function answerRemind(
  question: string,
  snapshot: SystemSnapshot,
  scope: Scope
): AssistantAnswer {
  const roster = snapshot.coordinators
  let recipients: CoordinatorProfile[] = []
  let audience = ''
  let addressedAs: string[] = []

  const team = teamNamed(question, roster)
  const everyone = question.match(EVERYONE)

  if (everyone) {
    recipients = roster
    audience = 'the team'
    addressedAs = [everyone[0]]
  } else if (team) {
    recipients = team.members
    audience = team.label
    addressedAs = [team.label, team.label.replace(/^the\s+/i, ''), team.label.replace(/\s+team$/i, '')]
  } else {
    // The verbs are stripped so "chase" cannot be mistaken for part of a name.
    const stripped = question.replace(/\b(remind|tell|ask|notify|nudge|chase|message|inform|let)\b/gi, ' ')
    const target = findCoordinator(stripped, roster)
    if (target) {
      recipients = [target]
      audience = target.full_name
      addressedAs = [target.full_name, ...target.full_name.split(/\s+/)]
    }
  }

  if (recipients.length === 0) {
    return {
      intent: 'remind_ambiguous',
      text: 'Who should I send that to? Name a coordinator in full — two people here share a first name — or say "the team" to send it to all of them.',
      facts: [{ label: 'Team', value: roster.map((c) => c.full_name).join(', ') }],
      followUps: ['Tell the team to log today\'s entries', `Tell ${roster[0]?.full_name ?? 'a coordinator'} to call me`],
    }
  }

  // What it is about: a customer if one is named. Their record is linked so the
  // recipient lands on the account rather than hunting for it.
  const customer = findCustomer(question, customerIndex(scope))
  const subject = customer?.name ?? null
  const link = customer?.company
    ? `/companies?company=${customer.company.id}`
    : customer?.overdue?.[0]
      ? `/overdue?payment=${customer.overdue[0].id}`
      : null

  // The leader's own words when they gave any; otherwise the standing nudge.
  const typed = instructionFrom(question, addressedAs)
  const ownWords = typed.length >= 3 && !(subject && normalize(typed) === normalize(subject))
  const body = ownWords
    ? typed
    : subject
      ? `${snapshot.userName} asked you to follow up on ${subject}.`
      : `${snapshot.userName} asked you to follow this up.`

  const to =
    recipients.length === 1
      ? recipients[0].full_name
      : `${audience} — ${plural(recipients.length, 'coordinator')}`

  // Nothing is sent yet: the widget shows the message with Send / Cancel, and
  // only the press of Send puts it in anybody's notifications.
  return {
    intent: 'remind',
    text:
      recipients.length === 1
        ? `Here is the message for ${recipients[0].full_name}. Check the wording, change it if you like, then press Send.`
        : `Here is the message for ${audience} (${plural(recipients.length, 'coordinator')}). Check the wording, change it if you like, then press Send.`,
    facts: [
      { label: 'To', value: to },
      ...(recipients.length > 1
        ? [{ label: 'Who exactly', value: recipients.map((c) => c.full_name).join(', ') }]
        : []),
      ...(subject ? [{ label: 'About', value: subject }] : []),
      { label: 'They will see', value: `“${body}”` },
    ],
    action: {
      kind: 'remind',
      recipients: recipients.map((c) => ({ id: c.id, name: c.full_name })),
      audience,
      subject,
      message: body,
      link,
    },
  }
}

/**
 * "What have I sent?" — the sender's own outbox.
 *
 * A leader who cannot see what they already asked for either asks twice or
 * assumes it landed. A broadcast counts once, however many bells it rang.
 */
function answerSent(snapshot: SystemSnapshot): AssistantAnswer {
  const sent = sentMessages(snapshot.userId).slice(0, 8)
  const nameOf = (id: string) => snapshot.coordinators.find((c) => c.id === id)?.full_name ?? 'someone'

  if (sent.length === 0) {
    return {
      intent: 'sent',
      text: 'You have not sent anyone a message yet. Say "tell the team ..." or "tell Pragati to ..." and I will pass it on.',
    }
  }

  return {
    intent: 'sent',
    text: `Here is what you have sent, most recent first (${plural(sent.length, 'message')}).`,
    facts: sent.map((message) => ({
      label: `${formatDate(message.createdAt.slice(0, 10))} · ${
        message.recipientIds.length === 1
          ? nameOf(message.recipientIds[0])
          : `${message.audience ?? 'the team'} (${message.recipientIds.length})`
      }`,
      value: message.subject ? `${message.subject} — ${message.message}` : message.message,
    })),
  }
}

function answerHelp(snapshot: SystemSnapshot): AssistantAnswer {
  const common = [
    'How much does Balaji owe?',
    'What should I do first?',
    'What is past 90 days?',
    'Who broke a promise?',
    'What did we collect this month?',
  ]
  // Whoever runs the team can also put something in everybody's notifications,
  // so the phrasing that does it is offered rather than left to be guessed.
  const leading = [
    'How is the team doing?',
    'How is Pragati doing?',
    'Tell the team to log today\'s entries',
    'Tell Pragati to call Balaji before five',
    'What have I sent?',
  ]
  const byRole: Record<string, string[]> = {
    admin: leading,
    team_leader: leading,
    coordinator: ['How much am I chasing?', 'Which accounts have gone quiet?'],
  }

  const canMessage = seesAllAccounts(snapshot.role)
  return {
    intent: 'help',
    text: canMessage
      ? 'Ask me about any customer, invoice or colleague, and I will read the live records. I can also tell you what needs doing first — and pass a message to one coordinator or to the whole team, straight into their notifications.'
      : 'Ask me about any customer, invoice or colleague, and I will read the live records. I can also tell you what needs doing first.',
    facts: [{ label: 'Try', value: [...common, ...(byRole[snapshot.role] ?? [])].join(' · ') }],
    followUps: [...(byRole[snapshot.role] ?? []).slice(0, 1), 'What should I do first?'],
  }
}

/* ===== Naming helpers ===== */

function nameOf(snapshot: SystemSnapshot, id: string | null): string {
  if (!id) return 'Unassigned'
  return snapshot.coordinators.find((c) => c.id === id)?.full_name ?? id
}

function nameForBp(snapshot: SystemSnapshot, bpCode: string): string {
  return (
    snapshot.companies.find((c) => sameBpCode(c.sap_bp_code, bpCode))?.name ??
    snapshot.overduePayments.find((p) => sameBpCode(p.bp_code, bpCode))?.customer_name ??
    bpCode
  )
}

/* ===== Entry point ===== */

/**
 * Answers a free-text question about the system.
 *
 * A named customer, invoice or colleague settles the question outright - those
 * are unambiguous and are what people mostly ask about. Otherwise the wording
 * is matched against the topics the assistant can speak to, and if nothing
 * matches it says so rather than inventing an answer.
 */
export function askAssistant(question: string, snapshot: SystemSnapshot): AssistantAnswer {
  const text = normalize(question)
  if (!text) return answerHelp(snapshot)

  const scope = scopeFor(snapshot)

  // An instruction to pass something on comes first: "tell the team ... help
  // you get them done" is a message, not a request for the help menu.
  if (isMessageRequest(question)) {
    if (seesAllAccounts(snapshot.role)) return answerRemind(question, snapshot, scope)
    return {
      intent: 'remind_denied',
      text: 'Only a team leader or the administrator can message a coordinator through me. You can log a follow-up on the account instead, and your team leader will see it.',
    }
  }

  // The menu only for a short request for it: "help", "what can you do".
  // A question that merely contains "help" - "help me understand why ..." -
  // is a question, and goes to the AI like any other.
  if (text.split(' ').length <= 5 && has(text, 'help', 'what can you', 'what do you know', 'commands')) {
    return answerHelp(snapshot)
  }

  // The sender's own outbox, before the send itself so "what have I sent"
  // is not read as an instruction to send something.
  if (
    has(text, 'what have i sent', 'what did i send', 'messages i sent', 'my messages', 'my outbox', 'what have i told') &&
    seesAllAccounts(snapshot.role)
  ) {
    return answerSent(snapshot)
  }

  // Named records answer themselves.
  const customers = customerIndex(scope)
  const customer = findCustomer(question, customers)
  if (customer) return answerCustomer(customer, snapshot, scope)

  if (snapshot.role !== 'coordinator') {
    const colleague = findCoordinator(question, snapshot.coordinators)
    if (colleague) return answerCoordinator(colleague, snapshot)
  }

  // Topics.
  if (has(text, 'quiet', 'silent', 'silence', 'not heard', "haven't heard", 'no contact', 'stale', 'untouched', 'neglected')) {
    return answerQuiet(snapshot, scope)
  }
  if (has(text, 'what should i', 'what do i do', 'priority', 'first', 'next', 'today', 'my work')) {
    return answerPriority(snapshot, scope)
  }
  if (has(text, '90 day', '90 days', 'ninety', 'ageing', 'aging', 'critical', 'oldest', 'write off', 'write-off')) {
    return answerAgeing(snapshot, scope)
  }
  if (has(text, 'promise', 'committed', 'commitment', 'broke', 'broken')) {
    return answerPromises(snapshot, scope)
  }
  if (has(text, 'team', 'everyone', 'coordinators', 'who is behind')) {
    if (snapshot.role !== 'coordinator') return answerTeam(snapshot)
  }
  if (has(text, 'owe', 'outstanding', 'receivable', 'total', 'book', 'balance', 'how much', 'overdue', 'due')) {
    return answerBook(snapshot, scope)
  }

  return {
    intent: 'unknown',
    text: "I could not find that in the records. I can only tell you what is actually there, so I would rather say so than guess.",
    facts: [
      {
        label: 'I can answer',
        value:
          'a customer or invoice by name, what is owed, what is past 90 days, broken promises, collections, and what to do first',
      },
    ],
    followUps: ['What can you do?', 'What should I do first?'],
  }
}

/**
 * What the records say is wrong, before anybody asks.
 *
 * Each of these is a real, countable state of the book that a person can do
 * something about today. They are deliberately few: a list of twenty
 * observations is a list nobody reads, and the point is to raise the one thing
 * that matters, not to prove how much the robot noticed.
 */
export function worthRaising(snapshot: SystemSnapshot, scope: Scope): AiContext['worthRaising'] {
  const today = snapshot.today ?? todayISO()
  const out: { what: string; detail: string; where: string }[] = []

  // Due dates that do not follow from their own terms. In the live file 79
  // invoices are like this, some of them three months adrift, and every one of
  // them sits in the wrong week of the chase list until somebody notices.
  const wrongDates = scope.companies.filter((company) => {
    if (company.status === 'paid' || isSetAside(company)) return false
    const fixed = recalculateDueDate(company.invoice_date, company.payment_terms, company.due_date)
    return fixed.ok && fixed.changed
  })
  if (wrongDates.length > 0) {
    out.push({
      what: `${plural(wrongDates.length, 'invoice')} due on a date that does not follow from its terms`,
      detail: `For example ${wrongDates[0].name}: invoiced ${formatDate(wrongDates[0].invoice_date!)} on ${wrongDates[0].payment_terms}, but dated due ${wrongDates[0].due_date ? formatDate(wrongDates[0].due_date) : 'nothing'}. Recalculating it is one button in the follow-up panel.`,
      where: 'the follow-up panel of the account',
    })
  }

  // Money held out of the totals. Nobody is chasing it and it is not counted,
  // so it is the easiest thing in the system to forget entirely.
  const setAside = scope.companies.filter(isSetAside)
  const setAsideAgeing = scope.overduePayments.filter(isSetAside)
  if (setAside.length + setAsideAgeing.length > 0) {
    const held =
      setAside.reduce((sum, c) => sum + (c.total_amount || 0), 0) +
      setAsideAgeing.reduce((sum, o) => sum + (o.balance_due || 0), 0)
    out.push({
      what: `${formatCurrency(held)} set aside as no follow-up`,
      detail: `Held out of the outstanding total across ${plural(setAside.length + setAsideAgeing.length, 'record')}. Nobody is chasing it and it is not counted, so it only comes back if somebody goes looking.`,
      where: 'the No follow-up tab on the Overview',
    })
  }

  // Promises already broken are the most answerable thing in the book: the
  // customer named a date and it has passed.
  const broken = scope.commitments.filter((c) => c.committed_date < today)
  if (broken.length > 0) {
    out.push({
      what: `${plural(broken.length, 'promise')} already past the date the customer gave`,
      detail: 'A date the customer named and missed is the easiest call to make: there is nothing to negotiate, only to ask what happened.',
      where: 'the follow-up timeline of each account',
    })
  }

  return out.length > 0 ? out : undefined
}

/* ===== The facts handed to Claude ===== */

/**
 * Everything Claude is allowed to know for one question: the asker, today's
 * totals, their plan and nudges, the customer the question names (with its
 * follow-ups, promises and invoices), the biggest balances, and - for whoever
 * runs the team - each coordinator's position and the broken promises.
 *
 * Amounts are pre-formatted so the model quotes them as they appear on
 * screen rather than re-formatting rupees its own way. Everything is scoped
 * exactly as the rule engine scopes it: a coordinator's context never holds
 * a colleague's customer.
 */
export interface AiContext {
  today: string
  user: { name: string; role: UserRole }
  scope: 'the whole business' | 'own accounts only'
  totals: { accounts: number; outstanding: string; pastDue: string; pastNinetyDays: string }
  plan?: SystemSnapshot['myPlan']
  nudges: string[]
  customer?: {
    name: string
    bpCode: string | null
    owner: string
    status: string
    outstanding: string
    daysPastDue: number | null
    pastNinetyDays: string | null
    recentFollowups: {
      date: string
      by: string
      mode: string
      outcome: string
      notes: string | null
      promise: string | null
      nextReminder: string | null
    }[]
    openPromise: string | null
  }
  customers: { name: string; bpCode: string | null; owner: string; status: string; outstanding: string; note: string }[]
  team?: { coordinator: string; outstanding: string; planDone: number; planTotal: number }[]
  /**
   * Things worth raising that nobody asked about.
   *
   * Offered to the model as observations, not as a script: it decides whether
   * one of them answers the question in front of it. An assistant that recites
   * all of them every time is a nuisance; one that never mentions them is a
   * lookup table.
   */
  worthRaising?: { what: string; detail: string; where: string }[]
  brokenPromises?: { customer: string; amount: string; promisedFor: string; daysLate: number; coordinator: string }[]
  /**
   * Customers the question names that are set aside - No follow-up or
   * bankrupt - with who did it, when and why. The usual answer to "why can't
   * I see X?", which the lists themselves can never give.
   */
  setAside?: { customer: string; bpCode: string | null; reason: string; by: string; on: string | null; note: string | null; amount: string }[]
  /** Customers the question names that the Excel file no longer carries (settled or paid by the sync). */
  goneFromExcel?: { customer: string; bpCode: string | null; lastChanged: string | null }[]
  /** Leader/admin: how many customers are set aside in all. */
  setAsideCount?: number
  /** Leader/admin: coordinator names in the Excel file that match nobody in the CRM ("Unknown"). */
  unknownCoordinatorNames?: { name: string; accounts: number; amount: string }[]
  /**
   * The coordinator the question names: their own plan for today and their own
   * accounts, oldest money first. What they should do comes from here and
   * nowhere else - without it the model picked accounts that were not theirs,
   * and once invented a customer outright.
   */
  coordinator?: {
    name: string
    planToday: { account: string; status: string; nudge: string }[]
    planDone: number
    planTotal: number
    accounts: { name: string; status: string; outstanding: string; pastNinetyDays: string | null; daysPastDue: number | null }[]
  }
}

const CONTEXT_CUSTOMERS = 30
const CONTEXT_FOLLOWUPS = 5

function accountStatus(account: BookAccount): string {
  if (account.company) return account.company.status
  if (account.ageing) return account.ageing.status
  return 'open invoices'
}

function accountNote(account: BookAccount): string {
  if (account.daysPastDue !== null && account.daysPastDue > 0) return `${account.daysPastDue} days past due`
  if (account.company?.due_date) return `due ${formatDate(account.company.due_date)}`
  if (account.isOverdue) return 'past due on the ageing report'
  return 'not yet due'
}

/* ===== Customers that are not in the lists, and why ===== */

type AnyRecord = Company | OverduePayment

const isInvoice = (r: AnyRecord): r is Company => 'sap_bp_code' in r
const codeOfRecord = (r: AnyRecord) => (isInvoice(r) ? r.sap_bp_code : r.bp_code)
const nameOfRecord = (r: AnyRecord) => (isInvoice(r) ? r.name : r.customer_name || r.bp_code)
const amountOfRecord = (r: AnyRecord) => (isInvoice(r) ? r.total_amount : r.balance_due) || 0
const closedRecord = (r: AnyRecord) => r.status === 'paid' || r.status === 'settled'
const customerKeyOf = (r: AnyRecord) => normalizeBpCode(codeOfRecord(r)) ?? normalize(nameOfRecord(r))

/** Words that cannot be the first distinctive word of a company name. */
const NOT_DISTINCTIVE = new Set([
  'the', 'shri', 'shree', 'sri', 'new', 'india', 'indian', 'private', 'limited', 'pvt', 'ltd', 'llp', 'and',
  'foods', 'food', 'industries', 'enterprise', 'enterprises', 'company', 'pharma', 'products', 'trading',
])

/** Whether the question names this customer: their BP code, or the first distinctive word of their name. */
function questionNames(asked: string, record: AnyRecord): boolean {
  const code = normalizeBpCode(codeOfRecord(record))
  if (code && asked.includes(code.toLowerCase())) return true
  const word = normalize(nameOfRecord(record))
    .split(' ')
    .find((w) => w.length >= 4 && !NOT_DISTINCTIVE.has(w) && !GENERIC_NAME_WORDS.has(w))
  return Boolean(word && new RegExp(`\\b${word}\\b`).test(asked))
}

function namedOffList(question: string, scope: Scope, snapshot: SystemSnapshot) {
  const asked = normalize(question)
  const records: AnyRecord[] = [...scope.companies, ...scope.overduePayments]
  const byCustomer = new Map<string, AnyRecord[]>()
  for (const r of records) {
    if (!questionNames(asked, r)) continue
    const key = customerKeyOf(r)
    const list = byCustomer.get(key)
    if (list) list.push(r)
    else byCustomer.set(key, [r])
  }

  const setAside: NonNullable<AiContext['setAside']> = []
  const gone: NonNullable<AiContext['goneFromExcel']> = []
  for (const list of byCustomer.values()) {
    const open = list.filter((r) => !closedRecord(r))
    const held = open.find((r) => isSetAside(r))
    if (held) {
      const bankrupt = isBankrupt(held)
      setAside.push({
        customer: nameOfRecord(held),
        bpCode: normalizeBpCode(codeOfRecord(held)),
        reason: bankrupt ? 'declared bankrupt' : 'marked No follow-up',
        by: nameOf(snapshot, (bankrupt ? held.bankrupt_declared_by : held.no_followup_by) ?? null),
        on: (bankrupt ? held.bankrupt_declared_at : held.no_followup_at)?.slice(0, 10) ?? null,
        note: (bankrupt ? held.bankrupt_note : held.no_followup_note) ?? null,
        amount: formatCurrency(open.filter((r) => isSetAside(r)).reduce((sum, r) => sum + amountOfRecord(r), 0)),
      })
    } else if (open.length === 0) {
      const last = list.map((r) => r.updated_at).sort().pop() ?? null
      gone.push({ customer: nameOfRecord(list[0]), bpCode: normalizeBpCode(codeOfRecord(list[0])), lastChanged: last?.slice(0, 10) ?? null })
    }
  }
  return { setAside: setAside.slice(0, 5), gone: gone.slice(0, 5) }
}

/** Coordinator names in the Excel file that match nobody in the CRM, with what sits under them. */
function unknownNames(scope: Scope): NonNullable<AiContext['unknownCoordinatorNames']> {
  const byName = new Map<string, { name: string; accounts: Set<string>; amount: number }>()
  for (const r of [...scope.companies, ...scope.overduePayments]) {
    if (r.assigned_coordinator_id || closedRecord(r) || isSetAside(r)) continue
    const name = (r.coordinator_name ?? '').trim() || '(blank)'
    const entry = byName.get(name.toLowerCase()) ?? { name, accounts: new Set<string>(), amount: 0 }
    entry.accounts.add(customerKeyOf(r))
    entry.amount += amountOfRecord(r)
    byName.set(name.toLowerCase(), entry)
  }
  return [...byName.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)
    .map((e) => ({ name: e.name, accounts: e.accounts.size, amount: formatCurrency(e.amount) }))
}

export function buildAiContext(question: string, snapshot: SystemSnapshot): AiContext {
  const today = snapshot.today ?? todayISO()
  const scope = scopeFor(snapshot)
  const book = bookOf(scope, today)
  const totals = summariseBook(book)

  const context: AiContext = {
    today,
    user: { name: snapshot.userName, role: snapshot.role },
    scope: scope.wholeBusiness ? 'the whole business' : 'own accounts only',
    totals: {
      accounts: totals.accounts,
      outstanding: formatCurrency(totals.outstanding),
      pastDue: formatCurrency(totals.pastDue),
      pastNinetyDays: formatCurrency(totals.criticalAmount),
    },
    plan: snapshot.myPlan,
    nudges: snapshot.tasks.slice(0, 8).map((task) => task.message),
    // What the records say is wrong, whether or not it was asked about.
    worthRaising: worthRaising(snapshot, scope),
    customers: [...book]
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, CONTEXT_CUSTOMERS)
      .map((account) => ({
        name: account.name,
        bpCode: account.bpCode,
        owner: nameOf(snapshot, account.coordinatorId),
        status: accountStatus(account),
        outstanding: formatCurrency(account.outstanding),
        note: accountNote(account),
      })),
  }

  // The customer the question is about, in the same depth answerCustomer uses.
  const customer = findCustomer(question, customerIndex(scope, today))
  if (customer) {
    const account = book.find(
      (a) =>
        (customer.bpCode && a.bpCode === customer.bpCode) ||
        (customer.company && a.company?.id === customer.company.id)
    )
    const ids = new Set<string>([
      ...(customer.company ? [customer.company.id] : []),
      ...customer.overdue.map((row) => row.id),
    ])
    const recent = scope.followups
      .filter((f) => ids.has(f.entity_id))
      .sort((a, b) => b.followup_date.localeCompare(a.followup_date))
      .slice(0, CONTEXT_FOLLOWUPS)
    const promise = scope.commitments
      .filter((c) => sameBpCode(c.bp_code, customer.bpCode))
      .sort((a, b) => a.committed_date.localeCompare(b.committed_date))[0]

    context.customer = {
      name: customer.name,
      bpCode: customer.bpCode,
      owner: nameOf(snapshot, customer.ownerId),
      status: account ? accountStatus(account) : customer.company?.status ?? 'settled',
      outstanding: formatCurrency(customer.outstanding),
      daysPastDue: account?.daysPastDue ?? null,
      pastNinetyDays: account && account.criticalAmount > 0 ? formatCurrency(account.criticalAmount) : null,
      recentFollowups: recent.map((f) => ({
        date: formatDate(f.followup_date.slice(0, 10)),
        by: nameOf(snapshot, f.coordinator_id),
        mode: f.mode,
        outcome: f.status,
        notes: f.notes,
        promise: f.committed_date
          ? `${f.committed_amount ? formatCurrency(f.committed_amount) : 'payment'} by ${formatDate(f.committed_date)}`
          : null,
        nextReminder: f.next_reminder_date ? formatDate(f.next_reminder_date) : null,
      })),
      openPromise: promise
        ? `${formatCurrency(promise.amount)} by ${formatDate(promise.committed_date)}${
            promise.committed_date <= today ? ' (already past)' : ''
          }`
        : null,
    }
  }

  // Why a customer the question names is not in the lists.
  const named = namedOffList(question, scope, snapshot)
  if (named.setAside.length > 0) context.setAside = named.setAside
  if (named.gone.length > 0) context.goneFromExcel = named.gone

  /*
   * The customer summary is read from the working lists, which leave set-aside
   * customers out - so a customer marked No follow-up came through as
   * "settled, ₹0" beside the note saying who set it aside, and the model
   * believed the first. Say the real reason in the summary itself.
   */
  if (context.customer) {
    const code = context.customer.bpCode
    const held = named.setAside.find((s) => s.bpCode === code || s.customer === context.customer!.name)
    const gone = named.gone.find((g) => g.bpCode === code || g.customer === context.customer!.name)
    if (held) {
      context.customer.status = `set aside - ${held.reason} by ${held.by}${held.on ? ` on ${formatDate(held.on)}` : ''}${
        held.note ? ` ("${held.note}")` : ''
      }; not in Active Payments, Overdue Payments or any total`
      context.customer.outstanding = held.amount
    } else if (gone) {
      context.customer.status = 'not in the Excel file any more - settled/paid by the sync, so not in any list'
    }
  }

  // A named coordinator: their real plan and their real accounts, nobody else's.
  if (scope.wholeBusiness) {
    const colleague = findCoordinator(question, snapshot.coordinators)
    if (colleague) {
      const plan = snapshot.teamPlans?.[colleague.id]
      context.coordinator = {
        name: colleague.full_name,
        planToday: plan?.items ?? [],
        planDone: plan?.done ?? 0,
        planTotal: plan?.total ?? 0,
        accounts: bookForCoordinator(book, colleague.id)
          .sort((a, b) => (b.daysPastDue ?? -1) - (a.daysPastDue ?? -1) || b.outstanding - a.outstanding)
          .slice(0, 12)
          .map((account) => ({
            name: account.name,
            status: accountStatus(account),
            outstanding: formatCurrency(account.outstanding),
            pastNinetyDays: account.criticalAmount > 0 ? formatCurrency(account.criticalAmount) : null,
            daysPastDue: account.daysPastDue,
          })),
      }
    }
  }

  if (scope.wholeBusiness) {
    context.setAsideCount = new Set(
      [...scope.companies, ...scope.overduePayments]
        .filter((r) => isSetAside(r) && !closedRecord(r))
        .map((r) => customerKeyOf(r))
    ).size
    const unknown = unknownNames(scope)
    if (unknown.length > 0) context.unknownCoordinatorNames = unknown
  }

  if (scope.wholeBusiness) {
    context.team = snapshot.coordinators.map((coordinator) => {
      const plan = snapshot.teamPlans?.[coordinator.id]
      return {
        coordinator: coordinator.full_name,
        outstanding: formatCurrency(summariseBook(bookForCoordinator(book, coordinator.id)).outstanding),
        planDone: plan?.done ?? 0,
        planTotal: plan?.total ?? 0,
      }
    })
    context.brokenPromises = scope.commitments
      .filter((c) => c.committed_date <= today)
      .sort((a, b) => a.committed_date.localeCompare(b.committed_date))
      .slice(0, 5)
      .map((c) => ({
        customer: nameForBp(snapshot, c.bp_code),
        amount: formatCurrency(c.amount),
        promisedFor: formatDate(c.committed_date),
        daysLate: daysBetween(c.committed_date, today),
        coordinator: nameOf(snapshot, c.coordinator_id),
      }))
  }

  return context
}
