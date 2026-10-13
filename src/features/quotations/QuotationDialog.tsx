/**
 * Add or edit a quotation, and log its follow-ups. Closed or Lost fills the
 * closing date (it can be changed); Lost needs a reason. The performance
 * remark follows the status, as it always did in the sheet.
 */

import { useState } from 'react'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getAssignableOwners, getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { demoCompanyStore } from '@/lib/demo-companies'
import { PERFORMANCE, QUOTATION_SOURCES, QUOTATION_STATUS_LABEL, followupCount, nextQuotationNo } from '@/lib/quotations'
import type { Quotation, QuotationStatus } from '@/lib/types'
import { formatDate, todayISO } from '@/lib/utils'

const newId = () => `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const selectClass = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm'

export function QuotationDialog({
  quotation,
  all,
  canManageTeam,
  currentUserId,
  onClose,
  onSaved,
}: {
  quotation: Quotation | null
  all: Quotation[]
  canManageTeam: boolean
  currentUserId: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const today = todayISO()
  // The live copy, so a follow-up logged here shows straight away.
  const live = quotation ? all.find((q) => q.id === quotation.id) ?? quotation : null
  const [form, setForm] = useState(() => ({
    inquiry_date: quotation?.inquiry_date ?? today,
    quotation_date: quotation?.quotation_date ?? today,
    quotation_no:
      quotation?.quotation_no ??
      nextQuotationNo([...demoCompanyStore.getQuotations(), ...demoCompanyStore.quotationNos.map((n) => ({ quotation_no: n }))]),
    customer_name: quotation?.customer_name ?? '',
    concern_person: quotation?.concern_person ?? '',
    contact_number: quotation?.contact_number ?? '',
    source: quotation?.source ?? 'Label',
    sales_employee: quotation?.sales_employee ?? '',
    customer_type: quotation?.customer_type ?? 'existing',
    amount: quotation?.amount ? String(quotation.amount) : '',
    status: (quotation?.status ?? 'open') as QuotationStatus,
    closing_date: quotation?.closing_date ?? '',
    lost_remark: quotation?.lost_remark ?? '',
    coordinator_id: quotation?.coordinator_id ?? currentUserId,
  }))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = canManageTeam || !quotation || quotation.coordinator_id === currentUserId

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => {
      const next = { ...f, [key]: value }
      // Closed or Lost: the closing date is today unless one is already set.
      if (key === 'status' && value !== 'open' && !f.closing_date) next.closing_date = today
      if (key === 'status' && value === 'open') next.closing_date = ''
      return next
    })

  const problem =
    !form.customer_name.trim()
      ? 'Enter the customer.'
      : form.status === 'lost' && form.lost_remark.trim().length < 3
        ? 'Say why it was lost.'
        : form.amount && !(Number(form.amount) >= 0)
          ? 'The amount must be a number.'
          : null

  const save = async () => {
    if (problem || !canEdit) return
    setBusy(true)
    const at = new Date().toISOString()
    const amount = Number(form.amount)
    const record: Quotation = {
      id: quotation?.id ?? newId(),
      inquiry_date: form.inquiry_date || null,
      coordinator_id: canManageTeam ? form.coordinator_id || null : currentUserId,
      coordinator_name: quotation?.coordinator_name ?? null,
      customer_name: form.customer_name.trim(),
      concern_person: form.concern_person.trim() || null,
      contact_number: form.contact_number.trim() || null,
      source: form.source || null,
      quotation_date: form.quotation_date || null,
      sales_employee: form.sales_employee.trim() || null,
      quotation_no: form.quotation_no.trim() || null,
      followups: live?.followups ?? [],
      earlier_followups: live?.earlier_followups ?? 0,
      closing_date: form.status === 'open' ? null : form.closing_date || today,
      status: form.status,
      customer_type: (form.customer_type as Quotation['customer_type']) || null,
      amount: form.amount && amount > 0 ? amount : null,
      lost_remark: form.status === 'lost' ? form.lost_remark.trim() : form.lost_remark.trim() || null,
      created_at: quotation?.created_at ?? at,
      created_by: quotation?.created_by ?? currentUserId,
      updated_at: at,
      updated_by: currentUserId,
    }
    try {
      await demoCompanyStore.saveQuotation(record)
      onSaved(quotation ? 'Quotation updated.' : `Quotation ${record.quotation_no ?? ''} added.`)
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const logFollowup = async () => {
    if (!live || note.trim().length < 2) return
    setBusy(true)
    try {
      await demoCompanyStore.addQuotationFollowup(live.id, { at: new Date().toISOString(), by: currentUserId, note: note.trim() })
      setNote('')
      toast.success('Follow-up logged.')
    } catch (err) {
      toast.error('Not logged.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!live) return
    setBusy(true)
    try {
      await demoCompanyStore.deleteQuotation(live.id)
      onSaved('Quotation deleted.')
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, key: keyof typeof form, props: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`q-${key}`}>{label}</Label>
      <Input id={`q-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={!canEdit} {...props} />
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {quotation ? `Quotation ${quotation.quotation_no ?? ''}` : 'New quotation'}
            {quotation && <Badge variant="outline">{PERFORMANCE[form.status]}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {field('Customer', 'customer_name', { placeholder: 'Company name' })}
          {field('Concern person', 'concern_person')}
          {field('Contact number', 'contact_number')}
          {field('Quotation no', 'quotation_no')}
          {field('Enquiry date', 'inquiry_date', { type: 'date' })}
          {field('Quotation date', 'quotation_date', { type: 'date' })}
          <div className="space-y-1">
            <Label htmlFor="q-source">Source of enquiry</Label>
            <select id="q-source" className={selectClass} value={form.source} onChange={(e) => set('source', e.target.value)} disabled={!canEdit}>
              {QUOTATION_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {field('Sales employee', 'sales_employee')}
          <div className="space-y-1">
            <Label htmlFor="q-type">Customer type</Label>
            <select id="q-type" className={selectClass} value={form.customer_type ?? ''} onChange={(e) => set('customer_type', e.target.value)} disabled={!canEdit}>
              <option value="existing">Existing</option>
              <option value="new">New</option>
            </select>
          </div>
          {field('Amount (Rs)', 'amount', { inputMode: 'decimal' })}
          <div className="space-y-1">
            <Label htmlFor="q-status">Status</Label>
            <select id="q-status" className={selectClass} value={form.status} onChange={(e) => set('status', e.target.value)} disabled={!canEdit}>
              {(['open', 'closed', 'lost'] as const).map((s) => (
                <option key={s} value={s}>
                  {QUOTATION_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {form.status !== 'open' && field('Closing date', 'closing_date', { type: 'date' })}
          {canManageTeam && (
            <div className="space-y-1">
              <Label htmlFor="q-owner">Coordinator</Label>
              <select id="q-owner" className={selectClass} value={form.coordinator_id ?? ''} onChange={(e) => set('coordinator_id', e.target.value)}>
                <option value="">Unassigned</option>
                {getAssignableOwners().map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.status === 'lost' && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="q-lost">Why was it lost?</Label>
              <Textarea id="q-lost" rows={2} value={form.lost_remark} onChange={(e) => set('lost_remark', e.target.value)} disabled={!canEdit} />
            </div>
          )}
        </div>

        {live && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">
              Follow-ups <span className="text-muted-foreground">({followupCount(live)})</span>
            </p>
            {live.earlier_followups > 0 && (
              <p className="text-xs text-muted-foreground">{live.earlier_followups} made before the CRM, counted from the old sheet.</p>
            )}
            <ul className="space-y-1.5 text-sm">
              {[...(live.followups ?? [])].reverse().map((f, i) => (
                <li key={`${f.at}-${i}`} className="rounded border border-border/50 bg-muted/30 p-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(f.at.slice(0, 10))} · {getCoordinatorDisplayName(f.by)}
                  </span>
                  <div>{f.note}</div>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="flex gap-2">
                <Input id="q-followup" placeholder="What happened on this follow-up?" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button variant="outline" onClick={logFollowup} disabled={busy || note.trim().length < 2} data-testid="quotation-log-followup">
                  <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Log
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {canManageTeam && live && (
              <Button variant="ghost" className="text-rose-600" onClick={remove} disabled={busy}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {problem && <span className="text-xs text-rose-600">{problem}</span>}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {canEdit && (
              <Button onClick={save} disabled={busy || problem !== null} data-testid="quotation-save">
                {quotation ? 'Save' : 'Add quotation'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
