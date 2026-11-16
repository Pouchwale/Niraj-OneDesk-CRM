/**
 * Add or edit a service record (a dispatch mail): the SERVICE sheet's columns,
 * one form. Date Diff is worked out from the two dates. A coordinator keeps
 * their own rows; the team leader and administrator can enter for anyone and
 * delete. Since 16 Nov 2026 entering a PO no. fills Customer name, Sales order
 * no, FG code and Original SO dispatch date from Service-AutoPO (looked up on
 * the server; still editable; the Coordinator stays as chosen).
 */

import { useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getAssignableOwners } from '@/features/auth/AuthContext'
import { demoCompanyStore } from '@/lib/demo-companies'
import { DISPATCH_STATUSES, serviceDateDiff, serviceRowScore } from '@/lib/service-records'
import { whenSaved } from '@/lib/shared-data'
import type { DispatchStatus, ServiceRecord } from '@/lib/types'
import { todayISO } from '@/lib/utils'
import { lookupServicePo } from './service-po-api'
import { poKey } from '../../../shared/service-po'

const newId = () => `service-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const selectClass = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm'

type FormKey =
  | 'date' | 'coordinator_id' | 'po_no' | 'fg_code' | 'sales_order_no' | 'customer_name' | 'dispatch_status'
  | 'information_date' | 'original_dispatch_date' | 'final_dispatch_date' | 'remark'

export function ServiceRecordDialog({
  record,
  canManageTeam,
  currentUserId,
  onClose,
  onSaved,
}: {
  record: ServiceRecord | null
  canManageTeam: boolean
  currentUserId: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const today = todayISO()
  const coordinators = useMemo(() => getAssignableOwners().filter((p) => p.role === 'coordinator'), [])
  // The customers this person works with, as suggestions; any name can be typed.
  const customers = useMemo(
    () => [...new Set(demoCompanyStore.getAllCompanies().map((c) => c.name).filter(Boolean))].sort().slice(0, 2000),
    []
  )
  const [form, setForm] = useState<Record<FormKey, string>>(() => ({
    date: record?.date ?? today,
    coordinator_id: record?.coordinator_id ?? (canManageTeam ? '' : currentUserId),
    po_no: record?.po_no ?? '',
    fg_code: record?.fg_code ?? '',
    sales_order_no: record?.sales_order_no ?? '',
    customer_name: record?.customer_name ?? '',
    dispatch_status: record?.dispatch_status ?? '',
    information_date: record?.information_date ?? today,
    original_dispatch_date: record?.original_dispatch_date ?? '',
    final_dispatch_date: record?.final_dispatch_date ?? '',
    remark: record?.remark ?? '',
  }))
  const [busy, setBusy] = useState(false)
  // The PO lookup: what it said about the PO no. last looked up.
  const [poNote, setPoNote] = useState<{ tone: 'ok' | 'warn' | 'busy'; text: string } | null>(null)
  const lookedUp = useRef(poKey(record?.po_no ?? ''))
  // What the last lookup filled in, so a PO the sheet does not have clears it again (unless it was changed by hand).
  const filled = useRef<Partial<Record<FormKey, string>>>({})
  const lookUpPo = async () => {
    const key = poKey(form.po_no)
    if (!key || key === lookedUp.current) return
    lookedUp.current = key
    setPoNote({ tone: 'busy', text: 'Looking up the PO in Service-AutoPO…' })
    try {
      const res = await lookupServicePo(key)
      // Another PO was typed and looked up meanwhile: that answer wins.
      if (lookedUp.current !== key) return
      if (!res.configured) return setPoNote(null)
      if (res.error) return setPoNote({ tone: 'warn', text: `Service-AutoPO could not be read (${res.error}); fill the fields yourself.` })
      const m = res.match
      if (!m) {
        const before = filled.current
        filled.current = {}
        setForm((f) => {
          const next = { ...f }
          for (const [k, v] of Object.entries(before) as [FormKey, string][]) if (next[k] === v) next[k] = ''
          return next
        })
        return setPoNote({ tone: 'warn', text: 'PO not found in Service-AutoPO; fill the fields yourself.' })
      }
      const fill: Partial<Record<FormKey, string>> = {}
      if (m.customerName) fill.customer_name = m.customerName
      if (m.salesOrderNo) fill.sales_order_no = m.salesOrderNo
      if (m.fgCode) fill.fg_code = m.fgCode
      if (m.dueDate) fill.original_dispatch_date = m.dueDate
      filled.current = fill
      setForm((f) => ({ ...f, ...fill }))
      setPoNote({ tone: 'ok', text: 'Filled from Service-AutoPO: customer, sales order, FG code and original dispatch date. You can still change them.' })
    } catch (err) {
      setPoNote({ tone: 'warn', text: err instanceof Error ? err.message : 'The PO could not be looked up; fill the fields yourself.' })
    }
  }
  const canEdit = canManageTeam || !record || record.coordinator_id === currentUserId
  const set = (key: FormKey, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const text = (key: FormKey) => form[key].trim() || null

  const diff = serviceDateDiff({ information_date: form.information_date || null, original_dispatch_date: form.original_dispatch_date || null })
  const score = serviceRowScore({ information_date: form.information_date || null })

  const problem = !form.date
    ? 'Enter the date.'
    : !form.coordinator_id
      ? 'Choose the coordinator.'
      : !form.customer_name.trim()
        ? 'Enter the customer.'
        : null

  const save = async () => {
    if (problem || !canEdit) return
    setBusy(true)
    const at = new Date().toISOString()
    const saved: ServiceRecord = {
      id: record?.id ?? newId(),
      date: form.date,
      coordinator_id: canManageTeam ? form.coordinator_id : currentUserId,
      coordinator_name: record?.coordinator_name ?? null,
      po_no: text('po_no'),
      fg_code: text('fg_code'),
      sales_order_no: text('sales_order_no'),
      customer_name: form.customer_name.trim(),
      dispatch_status: (form.dispatch_status || null) as DispatchStatus | null,
      information_date: text('information_date'),
      original_dispatch_date: text('original_dispatch_date'),
      final_dispatch_date: text('final_dispatch_date'),
      remark: text('remark'),
      created_at: record?.created_at ?? at,
      created_by: record?.created_by ?? currentUserId,
      updated_at: at,
      updated_by: currentUserId,
    }
    try {
      demoCompanyStore.saveServiceRecord(saved)
      await whenSaved()
      onSaved(record ? 'Service record updated.' : 'Service record added.')
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!record) return
    setBusy(true)
    try {
      demoCompanyStore.deleteServiceRecord(record.id)
      await whenSaved()
      onSaved('Service record deleted.')
    } catch (err) {
      toast.error('Not deleted.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, key: FormKey, props: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`s-${key}`}>{label}</Label>
      <Input id={`s-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={!canEdit} {...props} />
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {record ? `Service record · ${record.customer_name}` : 'New service record'}
            <Badge variant="outline">{score} points</Badge>
          </DialogTitle>
        </DialogHeader>

        <datalist id="service-customers">
          {customers.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="grid gap-3 sm:grid-cols-2">
          {field('Date', 'date', { type: 'date' })}
          {canManageTeam ? (
            <div className="space-y-1">
              <Label htmlFor="s-coordinator">Coordinator</Label>
              <select id="s-coordinator" className={selectClass} value={form.coordinator_id} onChange={(e) => set('coordinator_id', e.target.value)} disabled={!canEdit}>
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
          {field('Customer name', 'customer_name', { list: 'service-customers', placeholder: 'Company name' })}
          {field('Sales order no', 'sales_order_no')}
          <div className="space-y-1">
            <Label htmlFor="s-po_no">PO no.</Label>
            <Input
              id="s-po_no"
              value={form.po_no}
              onChange={(e) => set('po_no', e.target.value)}
              onBlur={() => void lookUpPo()}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void lookUpPo())}
              disabled={!canEdit}
              placeholder="Type the PO no. to fill the rest"
              data-testid="service-po"
            />
            {poNote && (
              <p
                className={poNote.tone === 'ok' ? 'text-xs text-emerald-700 dark:text-emerald-400' : poNote.tone === 'warn' ? 'text-xs text-amber-600 dark:text-amber-400' : 'text-xs text-muted-foreground'}
                data-testid="service-po-note"
              >
                {poNote.text}
              </p>
            )}
          </div>
          {field('FG code', 'fg_code')}
          <div className="space-y-1">
            <Label htmlFor="s-status">Dispatch status</Label>
            <select id="s-status" className={selectClass} value={form.dispatch_status} onChange={(e) => set('dispatch_status', e.target.value)} disabled={!canEdit}>
              <option value="">—</option>
              {DISPATCH_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {field('Information date', 'information_date', { type: 'date' })}
          {field('Original SO dispatch date', 'original_dispatch_date', { type: 'date' })}
          <div className="space-y-1">
            <Label>Date diff</Label>
            <p className="flex h-9 items-center rounded-md border border-dashed border-border px-3 text-sm tabular-nums text-muted-foreground" data-testid="service-diff">
              {diff === null ? 'Fills in from the two dates' : `${diff} day${Math.abs(diff) === 1 ? '' : 's'}`}
            </p>
          </div>
          {field('Final dispatch date', 'final_dispatch_date', { type: 'date' })}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="s-remark">Remark</Label>
            <Textarea id="s-remark" rows={2} value={form.remark} onChange={(e) => set('remark', e.target.value)} disabled={!canEdit} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {record && canManageTeam ? (
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
              <Button onClick={save} disabled={busy || Boolean(problem)} data-testid="service-save">
                {record ? 'Save' : 'Add record'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
