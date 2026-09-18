import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthContext'
import { useDailyEntries } from './hooks/useDailyEntries'
import { EntryForm, type EntryFormValues } from './components/EntryForm'
import { deskFor, fieldsOf } from './desk-layouts'
import { StatusPreview } from './components/StatusPreview'
import { parseCurrency } from '@/lib/utils'
import type { DailyEntry } from '@/lib/types'

export function DailyEntryPage() {
  const { user } = useAuth()
  const { addEntry, getEntryByDate } = useDailyEntries()
  
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [isLeave, setIsLeave] = useState(false)
  const [formValues, setFormValues] = useState<Partial<EntryFormValues>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const layout = deskFor(user)
  const existingEntry = user ? getEntryByDate(user.id, date) : null

  useEffect(() => {
    if (existingEntry) {
      setIsLeave(existingEntry.is_leave || false)
    }
  }, [existingEntry])

  const handleSubmit = async (data: EntryFormValues) => {
    if (!user) return
    setIsSubmitting(true)
    try {
      // Built from the layout so a field can never be added to the form and
      // then silently dropped on save.
      const recorded: Record<string, unknown> = {}
      for (const field of fieldsOf(layout)) {
        const raw = data[field.name]
        if (field.kind === 'number') recorded[field.name] = Number(raw) || 0
        else if (field.kind === 'currency') recorded[field.name] = parseCurrency(String(raw ?? ''))
        else recorded[field.name] = raw === '' || raw === undefined ? null : raw
      }

      await addEntry({
        ...recorded,
        employee_id: user.id,
        entry_date: date,
        is_leave: isLeave,
        // The form names differ from the stored column for these three.
        payment_calls_advance: Number(data.payment_calls) || 0,
        payment_email_advance: Number(data.payment_emails) || 0,
        mode_of_leads: (data.mode_of_leads as DailyEntry['mode_of_leads']) ?? null,
      } as unknown as Partial<DailyEntry>)
      toast.success('Daily entry saved successfully')
    } catch (error) {
      toast.error('Failed to save entry')
    } finally {
      setIsSubmitting(false)
    }
  }

  const defaultFormValues = existingEntry
    ? Object.fromEntries(
        fieldsOf(layout).map((field) => {
          const stored =
            field.name === 'payment_calls'
              ? existingEntry.payment_calls_advance
              : field.name === 'payment_emails'
                ? existingEntry.payment_email_advance
                : (existingEntry as unknown as Record<string, unknown>)[field.name]

          if (field.kind === 'number') return [field.name, Number(stored) || 0]
          if (field.kind === 'currency') return [field.name, stored ? String(stored) : '']
          if (field.kind === 'mode') return [field.name, stored ? String(stored) : 'Call']
          return [field.name, stored ? String(stored) : '']
        })
      )
    : undefined

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <PageHeader 
        title="Daily Activity Entry" 
        subtitle={`Entry for ${format(new Date(date), 'MMMM d, yyyy')}`} 
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-card/60 border border-border backdrop-blur-sm">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch 
              id="leave-mode" 
              checked={isLeave} 
              onCheckedChange={setIsLeave} 
            />
            <Label htmlFor="leave-mode" className="whitespace-nowrap">Mark as Leave</Label>
          </div>
        </div>

        <StatusPreview 
          isLeave={isLeave} 
          orders={Number(formValues.orders_received) || 0} 
          pending={Number(formValues.pending_work) || 0} 
        />
      </div>

      <EntryForm 
        key={date}
        defaultValues={defaultFormValues}
        onSubmit={handleSubmit}
        isLeave={isLeave}
        isSubmitting={isSubmitting}
        onChange={setFormValues}
        layout={layout}
      />
    </div>
  )
}
