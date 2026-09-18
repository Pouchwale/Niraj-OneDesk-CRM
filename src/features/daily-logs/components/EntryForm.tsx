import React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { motion } from 'motion/react'
import {
  PhoneCall, Users, ShoppingCart, Briefcase, Check, Package, Printer,
  Palette, Truck, RefreshCw,
} from 'lucide-react'
import { GlassCard } from '@/components/shared/GlassCard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { DeskLayout, EntryField, EntrySection } from '../desk-layouts'
import { fieldsOf } from '../desk-layouts'

/** Values are keyed by field name; numbers arrive from inputs as strings. */
export type EntryFormValues = Record<string, string | number>

const ICONS: Record<EntrySection['icon'], React.ComponentType<{ className?: string }>> = {
  package: Package,
  printer: Printer,
  phone: PhoneCall,
  users: Users,
  cart: ShoppingCart,
  briefcase: Briefcase,
  palette: Palette,
  truck: Truck,
  refresh: RefreshCw,
}

const LEAD_MODES = ['Call', 'Email', 'WhatsApp', 'Referral', 'Walk-in', 'Other']

/** An empty value of the right shape for each field. */
export function blankValues(layout: DeskLayout): EntryFormValues {
  const values: EntryFormValues = {}
  for (const field of fieldsOf(layout)) {
    values[field.name] =
      field.kind === 'number' ? 0 : field.kind === 'mode' ? 'Call' : ''
  }
  return values
}

interface EntryFormProps {
  layout: DeskLayout
  defaultValues?: Partial<EntryFormValues>
  onSubmit: (data: EntryFormValues) => void
  isLeave: boolean
  isSubmitting?: boolean
  onChange?: (values: EntryFormValues) => void
}

/**
 * The daily entry form, rendered from the signed-in coordinator's desk layout.
 *
 * Driven by configuration rather than hardcoded sections: GP3 and each of the
 * four Pouchwale desks record genuinely different work, and branching in JSX
 * for every one of them would make the form impossible to follow and easy to
 * get subtly wrong.
 */
export function EntryForm({
  layout,
  defaultValues,
  onSubmit,
  isLeave,
  isSubmitting,
  onChange,
}: EntryFormProps) {
  const form = useForm<EntryFormValues>({
    defaultValues: { ...blankValues(layout), ...defaultValues },
  })

  React.useEffect(() => {
    const subscription = form.watch((value) => {
      if (onChange) onChange(value as EntryFormValues)
    })
    return () => subscription.unsubscribe()
  }, [form, onChange])

  const opacity = isLeave ? 0.5 : 1
  const pointerEvents = isLeave ? 'none' : 'auto'

  const renderField = (field: EntryField) => {
    // Full-width only matters once the grid actually has two columns.
    const wrapper = cn('space-y-2', field.fullWidth && 'sm:col-span-2')

    if (field.kind === 'text') {
      return (
        <div key={field.name} className={wrapper}>
          <Label>{field.label}</Label>
          <Textarea placeholder="Any notable achievements..." {...form.register(field.name)} />
        </div>
      )
    }

    if (field.kind === 'mode') {
      return (
        <div key={field.name} className={wrapper}>
          <Label>{field.label}</Label>
          <Controller
            control={form.control}
            name={field.name}
            render={({ field: controlled }) => (
              <Select value={String(controlled.value ?? 'Call')} onValueChange={controlled.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )
    }

    return (
      <div key={field.name} className={wrapper}>
        <Label>{field.label}</Label>
        <Input
          type={field.kind === 'number' ? 'number' : 'text'}
          placeholder={field.kind === 'currency' ? field.hint : undefined}
          {...form.register(field.name)}
        />
        {field.hint && field.kind !== 'currency' && (
          <p className="text-[10px] text-muted-foreground">{field.hint}</p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <motion.div
        animate={{ opacity }}
        style={{ pointerEvents }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {layout.sections.map((section) => {
          const Icon = ICONS[section.icon]
          return (
            <GlassCard key={section.id} className="p-6 space-y-4">
              <div className="mb-4 flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Icon className="w-5 h-5" />
                <h3 className="font-semibold">{section.title}</h3>
                {section.badge && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                    {section.badge}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{section.fields.map(renderField)}</div>
              {section.note && (
                <p className="text-[10px] text-muted-foreground">{section.note}</p>
              )}
            </GlassCard>
          )
        })}
      </motion.div>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          <Check className="mr-2 h-4 w-4" />
          {isSubmitting ? 'Saving...' : 'Save Entry'}
        </Button>
      </div>
    </form>
  )
}
