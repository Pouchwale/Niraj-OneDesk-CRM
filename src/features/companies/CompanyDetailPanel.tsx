import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Building2, Phone, Mail, Calendar, IndianRupee, Clock, UserCheck, Shuffle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { reassignCompany } from '@/lib/companies-api'
import { getAssignableOwners, getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { FollowUpTimeline } from './FollowUpTimeline'
import { cn } from '@/lib/utils'
import type { Company } from '@/lib/types'
import { differenceInDays, parseISO } from 'date-fns'
import { clearFocusedRecord, setFocusedRecord } from '@/features/assistant/screen-context'
import { Send } from 'lucide-react'
import { SendReminderDialog } from '@/features/messaging/SendReminderDialog'
import { NoFollowupControl } from '@/components/shared/NoFollowupControl'

interface CompanyDetailPanelProps {
  company: Company | null
  open: boolean
  onClose: () => void
  isAdmin?: boolean
  currentUserId?: string
  /** Called after a follow-up is saved so the parent list can refresh. */
  onFollowupSaved?: () => void
  /** Called after the account itself changes (reassignment), for the same reason. */
  onChanged?: () => void
}

function getStatusColor(status?: string) {
  switch (status?.toLowerCase()) {
    case 'current':
      return 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20'
    case 'upcoming':
      return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20'
    case 'overdue':
      return 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20'
    case 'critical':
      return 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20'
    case 'paid':
      return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20'
    default:
      return 'bg-muted text-muted-foreground hover:bg-muted/80'
  }
}

export function CompanyDetailPanel({
  company,
  open,
  onClose,
  isAdmin,
  currentUserId,
  onFollowupSaved,
  onChanged,
}: CompanyDetailPanelProps) {
  const [isReassigning, setIsReassigning] = useState(false)
  const [showExtraFields, setShowExtraFields] = useState(false)
  const [isReminderOpen, setIsReminderOpen] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)
  const coordinators = getAssignableOwners()

  // Tell the robot which account is on screen, so it can speak to it.
  useEffect(() => {
    if (!open || !company) return
    setFocusedRecord({ type: 'company', id: company.id, name: company.name })
    return () => clearFocusedRecord(company.id)
  }, [open, company])

  if (!company) return null

  const handleReassign = async (newCoordinatorId: string) => {
    try {
      setIsReassigning(true)
      await reassignCompany(company.id, newCoordinatorId, currentUserId ?? "admin")
      toast.success('Company reassigned successfully')
      onChanged?.()
    } catch (error) {
      console.error('Failed to reassign:', error)
      toast.error('Failed to reassign company')
    } finally {
      setIsReassigning(false)
    }
  }

  const dueDate = company.due_date ? parseISO(company.due_date) : null
  const daysOverdue = dueDate ? differenceInDays(new Date(), dueDate) : 0
  const isOverdue = daysOverdue > 0

  const extraFields = company.extra_fields as Record<string, string> | null
  const hasExtraFields = extraFields && Object.keys(extraFields).length > 0

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-[40vw] flex flex-col p-0 gap-0">
        <SheetHeader className="p-6 pb-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-start justify-between gap-4 mr-6">
            <div className="flex flex-col gap-1">
              <SheetTitle className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6 text-primary" />
                {company.name}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {company.invoice_no && (
                  <Badge variant="outline" className="font-mono text-xs">
                    Invoice {company.invoice_no}
                  </Badge>
                )}
                {company.sap_bp_code && (
                  <Badge variant="outline" className="font-mono">
                    {company.sap_bp_code}
                  </Badge>
                )}
                {company.status && (
                  <Badge className={cn("uppercase text-xs font-bold", getStatusColor(company.status))}>
                    {company.status}
                  </Badge>
                )}
              </div>
            </div>

            {currentUserId && company.status !== 'paid' && (
              <Button
                size="sm"
                className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setIsReminderOpen(true)}
              >
                <Send className="w-4 h-4 mr-2" />
                Send reminder
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 flex flex-col gap-6">
            {/* Company Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <UserCheck className="w-4 h-4" /> Contact Person
                </p>
                <p className="font-medium">{company.contact_person || 'N/A'}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Phone
                </p>
                <p className="font-medium">{company.contact_number || 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email
                </p>
                <p className="font-medium truncate" title={company.email || ''}>{company.email || 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Payment Terms
                </p>
                <p className="font-medium">{company.payment_terms || 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <IndianRupee className="w-4 h-4" /> Total Amount
                </p>
                <p className="font-medium text-lg text-primary">
                  {company.total_amount != null ? formatCurrency(company.total_amount) : 'N/A'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Invoice Date
                </p>
                <p className="font-medium">{company.invoice_date ? formatDate(company.invoice_date) : 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Due Date
                </p>
                <p className="font-medium">{company.due_date ? formatDate(company.due_date) : 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Days Overdue
                </p>
                <p className={cn("font-medium", isOverdue && "text-red-500 font-bold")}>
                  {daysOverdue > 0 ? `${daysOverdue} days` : 'Not overdue'}
                </p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <p className="text-sm text-muted-foreground">Module</p>
                <p className="font-medium">{company.module || 'N/A'}</p>
              </div>

              {company.remarks && (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-sm text-muted-foreground">Remarks</p>
                  <p className="font-medium text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md border border-border/50">
                    {company.remarks}
                  </p>
                </div>
              )}
            </div>

            {hasExtraFields && (
              <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50">
                <button 
                  onClick={() => setShowExtraFields(!showExtraFields)}
                  className="w-full flex items-center justify-between p-3 bg-muted/20 hover:bg-muted/40 transition-colors text-sm font-medium"
                >
                  Additional Fields
                  {showExtraFields ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showExtraFields && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/50">
                    {Object.entries(extraFields).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                        <p className="font-medium text-sm">{String(value) || 'N/A'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/*
              The same decision as on the Overdue screen, because it is the same
              customer: most of these have an ageing row too, and setting one
              aside without the other would leave the balance being chased from
              the other list. One control, both books.
            */}
            {currentUserId && company.status !== 'paid' && (
              <>
                <Separator className="bg-border/50" />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Worth chasing?</p>
                  <p className="text-xs text-muted-foreground">
                    Setting this aside drops it from the lists and takes the balance out of what is
                    owed, for you and for the team leader.
                  </p>
                  <NoFollowupControl
                    entityType="company"
                    entityId={company.id}
                    bpCode={company.sap_bp_code}
                    name={company.name}
                    amount={company.total_amount || 0}
                    record={company}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    onChanged={() => onChanged?.()}
                  />
                </div>
              </>
            )}

            {isAdmin && (
              <>
                <Separator className="bg-border/50" />
                <div className="bg-card/50 border border-border/50 p-4 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Shuffle className="w-4 h-4" />
                    Assignment
                  </div>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Current Coordinator</p>
                      <p className="font-medium">
                        {company.assigned_coordinator_id ? getCoordinatorDisplayName(company.assigned_coordinator_id) : 'Unassigned'}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Select 
                        disabled={isReassigning}
                        onValueChange={handleReassign}
                        value={company.assigned_coordinator_id || undefined}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Reassign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {coordinators.map(coord => (
                            <SelectItem key={coord.id} value={coord.id}>
                              {coord.full_name || coord.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator className="bg-border/50" />
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                Follow-up Timeline
              </h3>
              <div className="min-h-[300px]">
                <FollowUpTimeline
                  company={company}
                  onCompanyChanged={() => {
                    setTimelineKey((k) => k + 1)
                    onChanged?.()
                  }}
                  entityId={company.id}
                  entityType="company"
                  coordinatorId={currentUserId}
                  isAdmin={isAdmin}
                  companyTotalAmount={company.total_amount}
                  onFollowupSaved={onFollowupSaved}
                  refreshKey={timelineKey}
                />
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>

      <SendReminderDialog
        open={isReminderOpen}
        onClose={() => setIsReminderOpen(false)}
        coordinatorId={currentUserId ?? ''}
        coordinatorName={currentUserId ? getCoordinatorDisplayName(currentUserId) : 'the team'}
        onSent={() => {
          setTimelineKey((k) => k + 1)
          onFollowupSaved?.()
        }}
        target={{
          entityType: 'company',
          entityId: company.id,
          customerName: company.name,
          contactPerson: company.contact_person,
          contactNumber: company.contact_number,
          email: company.email,
          amount: company.total_amount,
          dueDate: company.due_date,
          invoiceDate: company.invoice_date,
          paymentTerms: company.payment_terms,
          bpCode: company.sap_bp_code,
          daysOverdue: Math.max(0, daysOverdue),
          isSettled: company.status === 'paid',
        }}
      />
    </Sheet>
  )
}
