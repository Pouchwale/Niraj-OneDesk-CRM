/**
 * Log or edit a billing issue: the sheet's columns, one form. A coordinator
 * edits only what they logged; the team leader and administrator edit any,
 * and only they delete. Sr. No is given by the store on first save.
 */

import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getAssignableOwners, getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { BILLING_DEPARTMENTS, resolveResponsible } from '@/lib/billing-issues'
import { demoCompanyStore } from '@/lib/demo-companies'
import { whenSaved } from '@/lib/shared-data'
import type { BillingIssue } from '@/lib/types'
import { formatDate, todayISO } from '@/lib/utils'

const newId = () => `billing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

/** A responsible person as people read it: the user's name, or the text as written. */
export function responsibleName(value: string | null): string {
  if (!value) return ''
  const person = getAssignableOwners().find((p) => p.id === value)
  return person ? person.full_name : value
}

type FormKey =
  | 'date' | 'responsible_1' | 'responsible_2' | 'responsible_3' | 'customer_name' | 'issue' | 'issue_date'
  | 'solution' | 'solution_date' | 'invoice_no' | 'cn_no' | 'dn_no' | 'account_remarks' | 'coordinator_remarks'

export function BillingIssueDialog({
  issue,
  canManageTeam,
  currentUserId,
  onClose,
  onSaved,
}: {
  issue: BillingIssue | null
  canManageTeam: boolean
  currentUserId: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const today = todayISO()
  const people = useMemo(() => getAssignableOwners(), [])
  const [form, setForm] = useState<Record<FormKey, string>>(() => ({
    date: issue?.date ?? today,
    // New issues start with the person logging it as Responsible Person 1.
    responsible_1: issue ? responsibleName(issue.responsible_1) : responsibleName(currentUserId),
    responsible_2: responsibleName(issue?.responsible_2 ?? null),
    responsible_3: responsibleName(issue?.responsible_3 ?? null),
    customer_name: issue?.customer_name ?? '',
    issue: issue?.issue ?? '',
    issue_date: issue?.issue_date ?? '',
    solution: issue?.solution ?? '',
    solution_date: issue?.solution_date ?? '',
    invoice_no: issue?.invoice_no ?? '',
    cn_no: issue?.cn_no ?? '',
    dn_no: issue?.dn_no ?? '',
    account_remarks: issue?.account_remarks ?? '',
    coordinator_remarks: issue?.coordinator_remarks ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const canEdit = canManageTeam || !issue || issue.created_by === currentUserId
  const set = (key: FormKey, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const problem = !form.date
    ? 'Enter the date.'
    : !form.responsible_1.trim()
      ? 'Choose Responsible Person 1.'
      : !form.customer_name.trim()
        ? 'Enter the customer.'
        : form.issue.trim().length < 3
          ? 'Describe the issue.'
          : null

  const text = (key: FormKey) => form[key].trim() || null

  const save = async () => {
    if (problem || !canEdit) return
    setBusy(true)
    const at = new Date().toISOString()
    const record: BillingIssue = {
      id: issue?.id ?? newId(),
      sr_no: issue?.sr_no ?? 0,
      date: form.date,
      responsible_1: resolveResponsible(form.responsible_1, people),
      responsible_2: resolveResponsible(form.responsible_2, people),
      responsible_3: resolveResponsible(form.responsible_3, people),
      customer_name: form.customer_name.trim(),
      issue: form.issue.trim(),
      issue_date: text('issue_date'),
      solution: text('solution'),
      solution_date: text('solution_date'),
      invoice_no: text('invoice_no'),
      cn_no: text('cn_no'),
      dn_no: text('dn_no'),
      account_remarks: text('account_remarks'),
      coordinator_remarks: text('coordinator_remarks'),
      created_at: issue?.created_at ?? at,
      created_by: issue?.created_by ?? currentUserId,
      updated_at: at,
      updated_by: currentUserId,
    }
    try {
      demoCompanyStore.saveBillingIssue(record)
      await whenSaved()
      onSaved(issue ? 'Billing issue updated.' : 'Billing issue logged.')
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!issue) return
    setBusy(true)
    try {
      demoCompanyStore.deleteBillingIssue(issue.id)
      await whenSaved()
      onSaved('Billing issue deleted.')
    } catch (err) {
      toast.error('Not deleted.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, key: FormKey, props: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`b-${key}`}>{label}</Label>
      <Input id={`b-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={!canEdit} {...props} />
    </div>
  )
  const area = (label: string, key: FormKey) => (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor={`b-${key}`}>{label}</Label>
      <Textarea id={`b-${key}`} rows={2} value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={!canEdit} />
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{issue ? `Billing issue #${issue.sr_no}` : 'New billing issue'}</DialogTitle>
        </DialogHeader>

        {/* Names of the team plus the departments; anything else can be typed. */}
        <datalist id="billing-people">
          {people.map((p) => (
            <option key={p.id} value={p.full_name} />
          ))}
          {BILLING_DEPARTMENTS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        <div className="grid gap-3 sm:grid-cols-2">
          {field('Date', 'date', { type: 'date' })}
          {field('Customer name', 'customer_name', { placeholder: 'Company name' })}
          {field('Responsible person 1 (scored)', 'responsible_1', { list: 'billing-people', placeholder: 'Coordinator or department' })}
          {field('Responsible person 2', 'responsible_2', { list: 'billing-people' })}
          {field('Responsible person 3', 'responsible_3', { list: 'billing-people' })}
          {field('Invoice number', 'invoice_no')}
          {area('Issue', 'issue')}
          {field('Issue date', 'issue_date', { type: 'date' })}
          {field('Solution date', 'solution_date', { type: 'date' })}
          {area('Solution', 'solution')}
          {field('CN number', 'cn_no')}
          {field('DN number', 'dn_no')}
          {area('Account team remarks', 'account_remarks')}
          {area('Coordinator team remarks', 'coordinator_remarks')}
        </div>

        {issue && (
          <p className="text-xs text-muted-foreground">
            Logged by {issue.created_by ? getCoordinatorDisplayName(issue.created_by) : 'the old sheet'} on {formatDate(issue.created_at.slice(0, 10))}.
            {!canEdit && ' Only they, the team leader or the administrator can change it.'}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {issue && canManageTeam ? (
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
              <Button onClick={save} disabled={busy || Boolean(problem)} data-testid="billing-save">
                {issue ? 'Save' : 'Log issue'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
