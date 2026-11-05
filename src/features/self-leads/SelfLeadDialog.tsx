/**
 * Add or edit a self lead, and keep its remarks. Connected is ticked once the
 * coordinator has spoken to the lead; Lost needs a reason. A coordinator keeps
 * their own leads; the team leader and administrator can change any and delete.
 */

import { useMemo, useState } from 'react'
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
import { SELF_LEAD_SOURCES, SELF_LEAD_STATUS_LABEL } from '@/lib/self-leads'
import { whenSaved } from '@/lib/shared-data'
import type { SelfLead, SelfLeadStatus } from '@/lib/types'
import { formatDate, todayISO } from '@/lib/utils'

const newId = () => `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const selectClass = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm'

type FormKey = 'date' | 'coordinator_id' | 'company_name' | 'contact_person' | 'contact_number' | 'source' | 'connected_date' | 'status' | 'value' | 'lost_reason'

export function SelfLeadDialog({
  lead,
  all,
  canManageTeam,
  currentUserId,
  onClose,
  onSaved,
}: {
  lead: SelfLead | null
  all: SelfLead[]
  canManageTeam: boolean
  currentUserId: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const today = todayISO()
  // The live copy, so a remark added here shows straight away.
  const live = lead ? all.find((l) => l.id === lead.id) ?? lead : null
  const coordinators = useMemo(() => getAssignableOwners().filter((p) => p.role === 'coordinator'), [])
  const [form, setForm] = useState<Record<FormKey, string>>(() => ({
    date: lead?.date ?? today,
    coordinator_id: lead?.coordinator_id ?? (canManageTeam ? '' : currentUserId),
    company_name: lead?.company_name ?? '',
    contact_person: lead?.contact_person ?? '',
    contact_number: lead?.contact_number ?? '',
    source: lead?.source ?? '',
    connected_date: lead?.connected_date ?? '',
    status: lead?.status ?? 'open',
    value: lead?.value ? String(lead.value) : '',
    lost_reason: lead?.lost_reason ?? '',
  }))
  const [connected, setConnected] = useState(lead?.connected ?? false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = canManageTeam || !lead || lead.coordinator_id === currentUserId
  const set = (key: FormKey, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const text = (key: FormKey) => form[key].trim() || null

  const problem = !form.date
    ? 'Enter the date.'
    : !form.coordinator_id
      ? 'Choose the coordinator.'
      : !form.company_name.trim()
        ? 'Enter the company.'
        : form.status === 'lost' && form.lost_reason.trim().length < 3
          ? 'Say why it was lost.'
          : form.status === 'closed' && !(Number(form.value) > 0)
            ? 'Enter the order value for a closed lead.'
            : null

  const save = async () => {
    if (problem || !canEdit) return
    setBusy(true)
    const at = new Date().toISOString()
    const value = Number(form.value)
    // A closed or lost lead was spoken to, whatever the box says.
    const wasConnected = connected || form.status !== 'open'
    const record: SelfLead = {
      id: lead?.id ?? newId(),
      date: form.date,
      coordinator_id: canManageTeam ? form.coordinator_id : currentUserId,
      company_name: form.company_name.trim(),
      contact_person: text('contact_person'),
      contact_number: text('contact_number'),
      source: text('source'),
      connected: wasConnected,
      connected_date: wasConnected ? form.connected_date || lead?.connected_date || today : null,
      status: form.status as SelfLeadStatus,
      value: value > 0 ? value : null,
      lost_reason: form.status === 'lost' ? form.lost_reason.trim() : null,
      // A new lead takes the first remark with it; an existing one keeps its log.
      remarks: lead ? live?.remarks ?? [] : note.trim() ? [{ at, by: currentUserId, note: note.trim() }] : [],
      created_at: lead?.created_at ?? at,
      created_by: lead?.created_by ?? currentUserId,
      updated_at: at,
      updated_by: currentUserId,
    }
    try {
      demoCompanyStore.saveSelfLead(record)
      await whenSaved()
      onSaved(lead ? 'Lead updated.' : `Lead ${record.company_name} added.`)
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const addRemark = async () => {
    if (!live || note.trim().length < 2) return
    setBusy(true)
    try {
      demoCompanyStore.addSelfLeadRemark(live.id, { at: new Date().toISOString(), by: currentUserId, note: note.trim() })
      await whenSaved()
      setNote('')
      toast.success('Remark added.')
    } catch (err) {
      toast.error('Not added.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!live) return
    setBusy(true)
    try {
      demoCompanyStore.deleteSelfLead(live.id)
      await whenSaved()
      onSaved('Lead deleted.')
    } catch (err) {
      toast.error('Not deleted.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, key: FormKey, props: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`l-${key}`}>{label}</Label>
      <Input id={`l-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={!canEdit} {...props} />
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {lead ? lead.company_name : 'New lead'}
            {lead && <Badge variant="outline">{SELF_LEAD_STATUS_LABEL[form.status as SelfLeadStatus]}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <datalist id="lead-sources">
          {SELF_LEAD_SOURCES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <div className="grid gap-3 sm:grid-cols-2">
          {field('Date', 'date', { type: 'date' })}
          {canManageTeam ? (
            <div className="space-y-1">
              <Label htmlFor="l-coordinator">Coordinator</Label>
              <select id="l-coordinator" className={selectClass} value={form.coordinator_id} onChange={(e) => set('coordinator_id', e.target.value)} disabled={!canEdit}>
                <option value="">Choose…</option>
                {coordinators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="hidden sm:block" />
          )}
          {field('Company / customer', 'company_name', { placeholder: 'Company name' })}
          {field('Source', 'source', { list: 'lead-sources', placeholder: 'Cold call, IndiaMART, reference…' })}
          {field('Contact person', 'contact_person')}
          {field('Contact number', 'contact_number', { inputMode: 'tel' })}

          <div className="space-y-1">
            <Label>Connected</Label>
            <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <input type="checkbox" checked={connected || form.status !== 'open'} onChange={(e) => setConnected(e.target.checked)} disabled={!canEdit || form.status !== 'open'} />
              Spoke to the lead
            </label>
          </div>
          {(connected || form.status !== 'open') ? field('Connected on', 'connected_date', { type: 'date' }) : <span className="hidden sm:block" />}

          <div className="space-y-1">
            <Label htmlFor="l-status">Status</Label>
            <select id="l-status" className={selectClass} value={form.status} onChange={(e) => set('status', e.target.value)} disabled={!canEdit}>
              {(['open', 'closed', 'lost'] as const).map((s) => (
                <option key={s} value={s}>
                  {SELF_LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {field(form.status === 'closed' ? 'Order value (Rs)' : 'Expected value (Rs)', 'value', { inputMode: 'decimal' })}
          {form.status === 'lost' && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="l-lost">Why was it lost?</Label>
              <Textarea id="l-lost" rows={2} value={form.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} disabled={!canEdit} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="l-note">{lead ? 'Remarks' : 'First remark (optional)'}</Label>
          {live && live.remarks.length > 0 && (
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border/50 p-3 text-sm" data-testid="lead-remarks">
              {[...live.remarks].reverse().map((r, i) => (
                <li key={`${r.at}-${i}`}>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(r.at.slice(0, 10))} · {getCoordinatorDisplayName(r.by)}
                  </div>
                  <div className="whitespace-pre-wrap">{r.note}</div>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="flex gap-2">
              <Textarea id="l-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was said, next step…" />
              {lead && (
                <Button variant="outline" className="self-end" onClick={addRemark} disabled={busy || note.trim().length < 2}>
                  <MessageSquarePlus className="mr-2 h-4 w-4" /> Add
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {lead && canManageTeam ? (
            <Button variant="outline" className="text-rose-600" onClick={remove} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {problem && canEdit && <span className="text-xs text-muted-foreground">{problem}</span>}
            <Button variant="outline" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button onClick={save} disabled={busy || Boolean(problem)} data-testid="lead-save">
                {lead ? 'Save' : 'Add lead'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
