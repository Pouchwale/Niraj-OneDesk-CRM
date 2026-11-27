/**
 * Service → Customer updates (27 Nov 2026, the user's request): the inventory
 * app's open jobs (server/modules/open-jobs), each graded by its RFD date
 * against its Due Date (shared/open-jobs.ts). From 3 days before the Due Date
 * the coordinator emails the customer: early, on time, or delayed by N days.
 * Robi drafts the email; the coordinator sends it from their own mail, and
 * "Customer told" saves a Service record (Information Date today, 10 points).
 * A coordinator sees their own POs; the team leader and administrator see all.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { CheckCircle2, Copy, ExternalLink, Mail, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { customerUpdateEmail, longDate, toldRemark } from '@/lib/customer-update-email'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { buildEmailUrl, emailProviderName, emailRecipients, getEmailProvider, getSenderOrg, openChannel } from '@/lib/messaging'
import { whenSaved } from '@/lib/shared-data'
import type { ServiceRecord } from '@/lib/types'
import { cn, todayISO } from '@/lib/utils'
import { customerUpdates, OPEN_JOB_REPORTS, seesCustomerUpdates, TELL_DAYS_BEFORE_DUE, type CustomerUpdate, type UpdateStatus } from '../../../shared/open-jobs'
import { refreshOpenJobs, useOpenJobs } from './open-jobs-api'

const STATUS_STYLE: Record<UpdateStatus, string> = {
  Early: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  'On Time': 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  Delay: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400',
}

type Tab = 'now' | 'soon' | 'told'
const TABS: { id: Tab; label: string }[] = [
  { id: 'now', label: 'Tell now' },
  { id: 'soon', label: 'Coming up' },
  { id: 'told', label: 'Told' },
]

const reportLabel = (id: string) => OPEN_JOB_REPORTS.find((r) => r.id === id)?.label ?? id
const statusText = (u: CustomerUpdate) => (u.status === 'On Time' ? 'On time' : `${u.status === 'Delay' ? 'Delay' : 'Early'} ${u.days}d`)
const newId = () => `service-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase()

/** The customer's email address(es) from Active Payments, by customer name. */
function customerEmailOf(customer: string | null): string {
  if (!customer) return ''
  const key = nameKey(customer)
  const found = new Set<string>()
  for (const c of demoCompanyStore.getAllCompanies()) {
    if (nameKey(c.name) !== key) continue
    for (const e of emailRecipients(c.email)) found.add(e)
  }
  return [...found].join(', ')
}

/** Counts for the tab label (Service page): POs to tell now. */
export function useCustomerUpdates(person: string) {
  const { user, canManageTeam } = useAuth()
  const open = useOpenJobs(seesCustomerUpdates(user?.role))
  const records = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.serviceRecords)
  const today = todayISO()
  const updates = useMemo(() => {
    const jobs = (open.data?.jobs ?? []).filter((j) => !canManageTeam || person === 'all' || j.coordinatorId === person)
    return customerUpdates(jobs, records, today)
  }, [open.data, records, today, canManageTeam, person])
  return { open, updates, waiting: (open.data?.jobs ?? []).filter((j) => !j.rfdDate).length }
}

export function CustomerUpdates({ person }: { person: string }) {
  const { user, canManageTeam } = useAuth()
  const { open, updates, waiting } = useCustomerUpdates(person)
  const today = todayISO()
  const [tab, setTab] = useState<Tab>('now')
  const [search, setSearch] = useState('')
  const [emailing, setEmailing] = useState<CustomerUpdate | null>(null)

  const byTab: Record<Tab, CustomerUpdate[]> = {
    now: updates.filter((u) => u.due && !u.told),
    soon: updates.filter((u) => !u.due && !u.told),
    told: updates.filter((u) => u.told),
  }
  const needle = search.trim().toLowerCase()
  const rows = byTab[tab].filter(
    (u) =>
      !needle ||
      [u.job.poNo, u.job.customerName, u.job.jobName, u.job.salesOrderNo, u.job.coordinatorName].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
  )

  const problem = open.error ?? open.data?.error ?? (open.data && !open.data.configured ? 'The inventory app is not set up on the server (INVENTORY_API_KEY).' : null)

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="customer-updates">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-medium">Customer updates</h3>
          <p className="text-xs text-muted-foreground">
            Open jobs from the inventory app. From {TELL_DAYS_BEFORE_DUE} days before the due date, tell the customer how the RFD date stands: early, on
            time or delayed. Robi drafts the email; you send it, then mark the customer told (a Service record, 10 points).
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {open.data?.fetchedAt && (
            <span data-testid="open-jobs-fetched">
              Read {new Date(open.data.fetchedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void refreshOpenJobs()} disabled={open.loading} aria-label="Read the open jobs again">
            <RefreshCw className={cn('h-4 w-4', open.loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {problem && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">{problem}</p>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Customer updates" className="inline-flex w-fit rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              data-testid={`updates-tab-${t.id}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                tab === t.id ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', t.id === 'now' && byTab.now.length ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400' : 'bg-muted')}>
                {byTab[t.id].length}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="PO, customer, job, SO" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
        </div>
      </div>

      {open.loading && !open.data ? (
        <p className="p-10 text-center text-sm text-muted-foreground">Reading the open jobs…</p>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {tab === 'now' ? 'Nobody is waiting for an update right now.' : tab === 'soon' ? 'No open job with an RFD date is coming up.' : 'No customer told yet for these jobs.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/50">
          <table className="w-full text-sm" data-testid="customer-updates-table">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">PO</th>
                <th className="px-3 py-3 font-medium">Customer / job</th>
                {canManageTeam && <th className="px-3 py-3 font-medium">Coordinator</th>}
                <th className="px-3 py-3 font-medium">Due date</th>
                <th className="px-3 py-3 font-medium">RFD date</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Tell from</th>
                <th className="px-3 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((u) => {
                const late = u.due && !u.told && u.job.dueDate && today > u.job.dueDate
                return (
                  <tr key={u.job.poNo} className="align-top" data-testid="customer-update-row">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="font-medium tabular-nums">{u.job.poNo}</div>
                      <div className="text-xs text-muted-foreground">{reportLabel(u.job.report)}</div>
                    </td>
                    <td className="min-w-[200px] px-3 py-2.5">
                      <div className="font-medium">{u.job.customerName ?? <span className="text-amber-600">Customer not known</span>}</div>
                      <div className="max-w-[280px] truncate text-xs text-muted-foreground" title={u.job.jobName ?? undefined}>
                        {[u.job.jobName, u.job.salesOrderNo && `SO ${u.job.salesOrderNo}`].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    {canManageTeam && (
                      <td className={cn('whitespace-nowrap px-3 py-2.5', !u.job.coordinatorId && 'text-amber-600')}>
                        {u.job.coordinatorId ? getCoordinatorDisplayName(u.job.coordinatorId) : u.job.coordinatorName ?? 'Not known'}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2.5">{u.job.dueDate ? longDate(u.job.dueDate) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {u.job.rfdDate ? longDate(u.job.rfdDate) : '—'}
                      {u.job.rfdManual && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-muted-foreground" title="Entered by hand in the inventory app">
                          manual
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={cn('whitespace-nowrap', STATUS_STYLE[u.status])} data-testid="customer-update-status">
                        {statusText(u)}
                      </Badge>
                    </td>
                    <td className={cn('whitespace-nowrap px-3 py-2.5', late && 'text-rose-600')} title={late ? 'The due date has passed' : undefined}>
                      {longDate(u.tellFrom)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {u.told ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Told
                        </span>
                      ) : (
                        <Button size="sm" variant={u.due ? 'default' : 'outline'} className="h-8" onClick={() => setEmailing(u)} data-testid="customer-update-email">
                          <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {waiting > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="open-jobs-no-rfd">
          {waiting.toLocaleString('en-IN')} open {waiting === 1 ? 'job has' : 'jobs have'} no RFD date yet in the inventory app; they show here once one is entered.
        </p>
      )}

      {emailing && user && <UpdateEmailDialog update={emailing} userId={user.id} senderName={user.full_name} canManageTeam={canManageTeam} onClose={() => setEmailing(null)} />}
    </GlassCard>
  )
}

function UpdateEmailDialog({
  update,
  userId,
  senderName,
  canManageTeam,
  onClose,
}: {
  update: CustomerUpdate
  userId: string
  senderName: string
  canManageTeam: boolean
  onClose: () => void
}) {
  const draft = useMemo(() => customerUpdateEmail(update, senderName, getSenderOrg()), [update, senderName])
  const [to, setTo] = useState(() => customerEmailOf(update.job.customerName))
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState(false)
  const provider = getEmailProvider()
  const owner = canManageTeam ? update.job.coordinatorId : userId

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      toast.success('Email copied.')
    } catch {
      toast.error('Could not copy; select the text and copy it yourself.')
    }
  }

  const markTold = async () => {
    setBusy(true)
    const at = new Date().toISOString()
    const today = todayISO()
    const record: ServiceRecord = {
      id: newId(),
      date: today,
      coordinator_id: owner,
      coordinator_name: update.job.coordinatorName,
      po_no: update.job.poNo,
      fg_code: update.job.fgCode,
      sales_order_no: update.job.salesOrderNo,
      customer_name: update.job.customerName?.trim() || '-',
      dispatch_status: update.status,
      information_date: today,
      original_dispatch_date: update.job.dueDate,
      final_dispatch_date: update.job.rfdDate,
      remark: toldRemark(update),
      created_at: at,
      created_by: userId,
      updated_at: at,
      updated_by: userId,
    }
    try {
      demoCompanyStore.saveServiceRecord(record)
      await whenSaved()
      toast.success(`PO ${update.job.poNo}: customer told. Saved in Service.`)
      onClose()
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl" data-testid="update-email-dialog">
        <DialogHeader>
          <DialogTitle>
            PO {update.job.poNo} · {update.status === 'On Time' ? 'On time' : `${update.status === 'Delay' ? 'Delayed' : 'Early'} by ${update.days} day${update.days === 1 ? '' : 's'}`}
          </DialogTitle>
          <DialogDescription>
            {update.job.customerName ?? 'Customer not known'} · due {update.job.dueDate ? longDate(update.job.dueDate) : '—'} · RFD{' '}
            {update.job.rfdDate ? longDate(update.job.rfdDate) : '—'}. Robi drafted this; change anything, send it from your mail, then mark the customer told.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="update-to">To</Label>
            <Input id="update-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="No email for this customer in Active Payments; type it" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="update-subject">Subject</Label>
            <Input id="update-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="update-body">Email</Label>
            <Textarea id="update-body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="text-sm leading-relaxed" data-testid="update-email-body" />
          </div>
          {!owner && (
            <p className="text-xs text-amber-600">This PO's coordinator is not a CRM account, so the Service record will have no coordinator.</p>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void copy()}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy
            </Button>
            <Button variant="outline" onClick={() => openChannel(buildEmailUrl(provider, to, subject, body))} disabled={!emailRecipients(to).length}>
              <ExternalLink className="mr-1.5 h-4 w-4" /> Open in {emailProviderName(provider)}
            </Button>
          </div>
          <Button onClick={() => void markTold()} disabled={busy} data-testid="update-mark-told">
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Customer told
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
