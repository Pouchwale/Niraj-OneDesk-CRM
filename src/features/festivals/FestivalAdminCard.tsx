/**
 * Admin Panel → Festivals (6 Nov 2026): where the festival settings stand,
 * and the way to change them for everyone.
 */

import { Link } from 'react-router-dom'
import { PartyPopper, Settings2 } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { longDate, missingDates, upcomingFestivals } from './festival-calendar'
import { useFestivals } from './useFestivals'

export function FestivalAdminCard() {
  const { config, today, festivals, primary } = useFestivals()
  const next = upcomingFestivals(today, festivals, 400)[0] ?? null
  const nextYear = Number(today.slice(0, 4)) + 1
  const missing = missingDates(festivals, nextYear).length

  return (
    <GlassCard className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6" data-testid="festival-admin-card">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-semibold">
          <PartyPopper className="h-4 w-4" /> Festivals and celebrations
        </h3>
        <p className="text-sm text-muted-foreground">Robi’s festival greetings, full-screen celebrations, sounds, music and festival dates, for everyone.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant={config.enabled ? 'default' : 'secondary'}>{config.enabled ? 'On' : 'Off'}</Badge>
          {config.enabled && <Badge variant="outline">{config.autoCelebrate ? 'Celebrates automatically' : 'Only when asked'}</Badge>}
          {primary ? (
            <Badge variant="outline">
              Today: {primary.festival.emoji} {primary.festival.name}
            </Badge>
          ) : next ? (
            <Badge variant="outline">
              Next: {next.festival.emoji} {next.festival.name}, {longDate(next.start)}
            </Badge>
          ) : null}
          {missing > 0 && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
              {missing} dates missing for {nextYear}
            </Badge>
          )}
        </div>
      </div>
      <Button asChild className="shrink-0 gap-1.5">
        <Link to="/festivals?tab=admin">
          <Settings2 className="h-4 w-4" /> Festival settings
        </Link>
      </Button>
    </GlassCard>
  )
}
