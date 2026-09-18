import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Phone, MessageCircle, Mail, Users, FileText, Save, X, Paperclip } from 'lucide-react'
import { addFollowup, editFollowup } from '@/lib/followups-api'
import { formatCurrency, parseISODate, toLocalISODate } from '@/lib/utils'
import type { FollowupMode, FollowupStatus, Followup, FollowupEntityType } from '@/lib/types'

export interface AddFollowUpFormProps {
  /** Company id or overdue-payment id, depending on entityType. */
  entityId: string
  entityType?: FollowupEntityType
  coordinatorId: string
  /** Outstanding balance, used to cap the committed amount. */
  companyTotalAmount?: number
  editingFollowup?: Followup // if provided, editing mode
  onSaved: () => void
  onCancel: () => void
}

const MODES: { value: FollowupMode; label: string; icon: React.ReactNode }[] = [
  { value: 'call', label: 'Call', icon: <Phone className="h-4 w-4" /> },
  { value: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" /> },
  { value: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { value: 'in_person', label: 'In-person', icon: <Users className="h-4 w-4" /> },
  { value: 'other', label: 'Other', icon: <FileText className="h-4 w-4" /> },
]

export function AddFollowUpForm({
  entityId,
  entityType = 'company',
  coordinatorId,
  companyTotalAmount,
  editingFollowup,
  onSaved,
  onCancel,
}: AddFollowUpFormProps) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<FollowupMode>(editingFollowup?.mode || 'call')
  const [notes, setNotes] = useState(editingFollowup?.notes || '')
  const [customerResponse, setCustomerResponse] = useState(editingFollowup?.customer_response || '')
  const [status, setStatus] = useState<FollowupStatus>(editingFollowup?.status || 'pending')
  const [committedDate, setCommittedDate] = useState(editingFollowup?.committed_date || '')
  const [committedAmount, setCommittedAmount] = useState<string>(editingFollowup?.committed_amount?.toString() || '')
  const [nextReminderDate, setNextReminderDate] = useState(editingFollowup?.next_reminder_date || '')
  
  // Date auto-suggestion logic
  useEffect(() => {
    if (editingFollowup) return // Don't auto-suggest if editing
    
    const today = new Date()
    let nextDate = new Date(today)

    if (committedDate) {
      // Parse as local midnight, otherwise the date shifts back a day in IST.
      nextDate = parseISODate(committedDate)
    } else if (status === 'no_response') {
      nextDate.setDate(today.getDate() + 2)
    } else {
      nextDate.setDate(today.getDate() + 7)
    }

    setNextReminderDate(toLocalISODate(nextDate))
  }, [committedDate, status, editingFollowup])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notes) {
      toast.error('Notes are required')
      return
    }

    const amount = committedAmount ? parseFloat(committedAmount) : null
    if (amount !== null && (isNaN(amount) || amount < 0)) {
      toast.error('Committed amount must be a positive number')
      return
    }
    // `!= null`, not truthiness: a settled account has a balance of 0 and must
    // not thereby accept any commitment at all.
    if (amount !== null && companyTotalAmount != null && amount > companyTotalAmount) {
      toast.error(`Committed amount cannot exceed the outstanding ${formatCurrency(companyTotalAmount)}`)
      return
    }
    if (status === 'committed' && !committedDate) {
      toast.error('A committed status needs a committed payment date')
      return
    }

    setLoading(true)
    try {
      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        coordinator_id: coordinatorId,
        // Required by the schema; without it the DB default silently wins and
        // back-dated entries are impossible.
        followup_date: editingFollowup?.followup_date ?? new Date().toISOString(),
        mode,
        notes,
        customer_response: customerResponse || null,
        status,
        committed_date: committedDate || null,
        committed_amount: amount,
        next_reminder_date: nextReminderDate || null,
        proof_attachment_url: editingFollowup?.proof_attachment_url ?? null,
      }

      if (editingFollowup) {
        // The signed-in user is the actor on the audit entry; `editFollowup`
        // keeps the original author on the record itself.
        await editFollowup(editingFollowup.id, payload, coordinatorId)
        toast.success('Follow-up updated successfully')
      } else {
        await addFollowup(payload)
        toast.success('Follow-up added successfully')
      }
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save follow-up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background/50 backdrop-blur-md border border-border rounded-xl p-6 shadow-xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label className="mb-2 block">Follow-up Mode</Label>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <Button
                key={m.value}
                type="button"
                variant={mode === m.value ? 'default' : 'outline'}
                onClick={() => setMode(m.value)}
                className="gap-2"
              >
                {m.icon}
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes <span className="text-destructive">*</span></Label>
          <Textarea 
            placeholder="Details of the conversation..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
            className="bg-background/50"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Customer Response</Label>
            <Select value={customerResponse} onValueChange={setCustomerResponse}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select response..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Will pay by date">Will pay by date</SelectItem>
                <SelectItem value="Disputed amount">Disputed amount</SelectItem>
                <SelectItem value="No response">No response</SelectItem>
                <SelectItem value="Partial payment promised">Partial payment promised</SelectItem>
                <SelectItem value="Requested extension">Requested extension</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v: FollowupStatus) => setStatus(v)}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select status..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="committed">Committed</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="no_response">No Response</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Committed Payment Date</Label>
            <Input 
              type="date"
              value={committedDate}
              onChange={(e) => setCommittedDate(e.target.value)}
              className="bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Committed Amount
              {companyTotalAmount ? ` (Max: ${formatCurrency(companyTotalAmount)})` : ''}
            </Label>
            <Input 
              type="number"
              placeholder="₹ Amount"
              value={committedAmount}
              max={companyTotalAmount}
              onChange={(e) => setCommittedAmount(e.target.value)}
              className="bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label>Next Follow-Up Reminder</Label>
            <Input 
              type="date"
              value={nextReminderDate}
              onChange={(e) => setNextReminderDate(e.target.value)}
              className="bg-background/50"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Saving...' : 'Save Follow-Up'}
          </Button>
        </div>
      </form>
    </div>
  )
}
