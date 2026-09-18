import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { Phone, MessageCircle, Mail, Users, FileText, Calendar, Pencil, Plus, Clock, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getFollowupsForEntity } from '@/lib/followups-api'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { formatCurrency, formatRelativeDate, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Company, Followup, FollowupMode, FollowupStatus, FollowupEntityType } from '@/lib/types'
import { FOLLOWUP_STATUS_LABEL, FOLLOWUP_STATUS_STYLE } from '@/lib/followup-status'
import { AddFollowUpForm } from './AddFollowUpForm'
import { RecalculateDueDate } from './RecalculateDueDate'

interface FollowUpTimelineProps {
  /**
   * The account itself, where there is one. Only given for companies, and only
   * so the panel can offer to recompute the due date from the invoice date —
   * an ageing row has no invoice date to count from.
   */
  company?: Company
  /** Called after the due date changes, so the panel and the list catch up. */
  onCompanyChanged?: () => void
  /** Company id or overdue-payment id, depending on entityType. */
  entityId: string
  entityType?: FollowupEntityType
  coordinatorId?: string // if provided, only allow that coordinator to add entries
  isAdmin?: boolean
  /** Caps the committed amount a coordinator can promise. */
  companyTotalAmount?: number
  /** Lets the parent refresh its list when a follow-up changes status. */
  onFollowupSaved?: () => void
  /** Bumping this refetches the timeline, e.g. after a reminder is sent. */
  refreshKey?: number
}


const modeIcons: Record<FollowupMode, React.ReactNode> = {
  call: <Phone className="w-4 h-4" />,
  whatsapp: <MessageCircle className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  in_person: <Users className="w-4 h-4" />,
  other: <FileText className="w-4 h-4" />
}

export function FollowUpTimeline({ company, onCompanyChanged, entityId, entityType = 'company', coordinatorId, isAdmin, companyTotalAmount, onFollowupSaved, refreshKey = 0 }: FollowUpTimelineProps) {
  const [followups, setFollowups] = useState<Followup[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const fetchFollowups = async () => {
    setLoading(true)
    try {
      const data = await getFollowupsForEntity(entityId, entityType)
      setFollowups(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFollowups()
  }, [entityId, entityType, refreshKey])

  const handleSaved = () => {
    setIsAdding(false)
    setEditingId(null)
    fetchFollowups()
    onFollowupSaved?.()
  }

  // Check if within 24h
  const canEdit = (createdAt: string) => {
    const created = new Date(createdAt)
    const now = new Date()
    const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
    return diffHours < 24
  }

  return (
    <div className="space-y-6">
      {/*
        Above the history rather than below it: the due date is the thing the
        rest of this panel is about, and a coordinator checking whether an
        account is really late should not have to scroll past every call to
        find out what it is due from.
      */}
      {company && entityType === 'company' && (
        <RecalculateDueDate
          company={company}
          actorId={coordinatorId}
          onChanged={() => {
            fetchFollowups()
            onCompanyChanged?.()
          }}
        />
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Follow-up History</h3>
        {coordinatorId && !isAdding && (
          <Button onClick={() => setIsAdding(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Follow-Up
          </Button>
        )}
      </div>

      {isAdding && coordinatorId && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <AddFollowUpForm
            entityId={entityId}
            entityType={entityType}
            coordinatorId={coordinatorId}
            companyTotalAmount={companyTotalAmount}
            onSaved={handleSaved}
            onCancel={() => setIsAdding(false)}
          />
        </motion.div>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground animate-pulse">Loading follow-ups...</div>
      ) : followups.length === 0 ? (
        <div className="text-center py-12 bg-background/30 rounded-xl border border-border border-dashed">
          <Clock className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">No follow-ups recorded yet.</p>
        </div>
      ) : (
        <div className="relative border-l border-border ml-4 space-y-8 pb-4">
          <TooltipProvider>
            {followups.map((followup, index) => {
              const isEditing = editingId === followup.id
              
              if (isEditing && coordinatorId) {
                return (
                  <div key={followup.id} className="ml-8 relative">
                    <AddFollowUpForm
                      entityId={entityId}
                      entityType={entityType}
                      coordinatorId={coordinatorId}
                      companyTotalAmount={companyTotalAmount}
                      editingFollowup={followup}
                      onSaved={handleSaved}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )
              }
              
              return (
                <motion.div
                  key={followup.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative pl-8"
                >
                  <div className="absolute -left-[17px] top-1 bg-background border border-border p-1.5 rounded-full z-10 text-muted-foreground">
                    {modeIcons[followup.mode]}
                  </div>
                  
                  <div className="bg-background/40 hover:bg-background/60 transition-colors border border-border rounded-xl p-5 shadow-sm">
                    <div className="flex flex-wrap justify-between items-start gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <Badge className={FOLLOWUP_STATUS_STYLE[followup.status]} variant="outline">
                          {FOLLOWUP_STATUS_LABEL[followup.status]}
                        </Badge>
                        <Tooltip>
                          <TooltipTrigger className="text-sm text-muted-foreground hover:text-foreground">
                            {formatRelativeDate(followup.created_at)}
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatDate(followup.created_at)}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      
                      {(isAdmin || (coordinatorId && canEdit(followup.created_at))) && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingId(followup.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Notes</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{followup.notes}</p>
                      </div>
                      
                      {followup.customer_response && (
                        <div>
                          <p className="text-sm font-medium mb-1">Customer Response</p>
                          <p className="text-sm text-muted-foreground">{followup.customer_response}</p>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* The promise is the most consequential thing on the
                            entry, so it is the one item given a colour: a
                            label above the figure, not a sentence to parse. */}
                        {(followup.committed_date || followup.committed_amount) && (
                          <div className="flex items-start gap-2.5 rounded-md border border-sky-500/25 bg-sky-500/10 p-3 text-sm">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                Committed
                              </p>
                              <p className="mt-0.5 text-foreground">
                                {followup.committed_amount && (
                                  <strong className="font-semibold tabular-nums">
                                    {formatCurrency(followup.committed_amount)}
                                  </strong>
                                )}
                                {followup.committed_date && (
                                  <span className={cn(followup.committed_amount && 'ml-1')}>
                                    by {formatDate(followup.committed_date)}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        {followup.next_reminder_date && (
                          <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 p-3 text-sm">
                            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Next follow-up
                              </p>
                              <p className="mt-0.5 text-foreground">{formatDate(followup.next_reminder_date)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {followup.proof_attachment_url && (
                        <div>
                          <a href={followup.proof_attachment_url} target="_blank" rel="noreferrer" className="text-sm text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            View Attachment
                          </a>
                        </div>
                      )}
                      
                      <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span>Recorded by {getCoordinatorDisplayName(followup.coordinator_id)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </TooltipProvider>
        </div>
      )}
    </div>
  )
}
