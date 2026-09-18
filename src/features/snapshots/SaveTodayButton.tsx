import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getCoordinatorDisplayName, useAuth } from '@/features/auth/AuthContext'
import { saveTodaysOverdue } from '@/lib/snapshots-api'
import { formatCurrency } from '@/lib/utils'

/**
 * Freezes today's Overdue book for the weekly coordinator score.
 *
 * Shown on the Overdue screen and in Weekly KPI, to the team leader and the
 * administrator only. It saves what the Overdue screen holds right now, so it
 * is worth pressing after the morning's Excel file has been synced.
 */
export function SaveTodayButton({
  onSaved,
  variant = 'outline',
}: {
  onSaved?: () => void
  variant?: 'default' | 'outline'
}) {
  const { user, canManageTeam } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  if (!user || !canManageTeam) return null

  const save = async () => {
    setSaving(true)
    try {
      const day = await saveTodaysOverdue(
        { id: user.id, name: getCoordinatorDisplayName(user.id) },
        getCoordinatorDisplayName
      )
      toast.success("Today's Overdue data is saved", {
        description: `${day.rowCount} rows · ${day.coordinatorCount} coordinators · ${formatCurrency(day.totalBalance)} · targets at ${day.percentage}%`,
        action: { label: 'Open Weekly KPI', onClick: () => navigate('/weekly-kpi') },
      })
      onSaved?.()
    } catch (err) {
      toast.error('Not saved', {
        description: err instanceof Error ? err.message : undefined,
        duration: 10_000,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Button variant={variant} onClick={save} disabled={saving} data-testid="save-today">
      <Save className="mr-2 h-4 w-4" />
      {saving ? 'Saving…' : "Save today's data"}
    </Button>
  )
}
