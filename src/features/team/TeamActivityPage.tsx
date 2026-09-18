import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { CalendarCheck, IndianRupee, PhoneCall, Users } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { GlassCard } from '@/components/shared/GlassCard'
import { KpiCard } from '@/components/shared/KpiCard'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatCurrency, todayISO } from '@/lib/utils'
import { getTeamCoordinators } from '@/features/auth/AuthContext'
import { useDailyEntries } from '@/features/daily-logs/hooks/useDailyEntries'
import type { Profile, TeamModule } from '@/lib/types'
import {
  contactEffort,
  deskThroughput,
  submissionTrend,
  summariseTeam,
  type CoordinatorActivity,
} from './team-activity'
import { deskFor, fieldsOf } from '@/features/daily-logs/desk-layouts'
import {
  ContactEffortChart,
  DeskThroughputCharts,
  ErrorsChart,
  SubmissionTrendChart,
} from './TeamCharts'

const TEAMS: TeamModule[] = ['GP3', 'Pouchwale']

const STATUS_STYLES: Record<CoordinatorActivity['todayStatus'], { label: string; className: string }> = {
  green: { label: 'On track', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  red: { label: 'Behind', className: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
  leave: { label: 'On leave', className: 'bg-violet-500/10 text-violet-500 border-violet-500/20' },
  missing: { label: 'Not submitted', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
}

/**
 * One module for both teams, rather than a page each.
 *
 * The two are read the same way and compared against each other constantly, so
 * splitting them across separate nav items made the obvious question - how do
 * they stack up - the awkward one to answer.
 */
export function TeamActivityPage() {
  const { entries } = useDailyEntries()
  const [tab, setTab] = useState<TeamModule>('GP3')
  const today = todayISO()

  const summaries = useMemo(() => {
    return Object.fromEntries(
      TEAMS.map((team) => [team, summariseTeam(getTeamCoordinators(team), entries, today)])
    ) as Record<TeamModule, ReturnType<typeof summariseTeam>>
  }, [entries, today])

  /** Chart series per team, derived once from the same entries. */
  const charts = useMemo(() => {
    return Object.fromEntries(
      TEAMS.map((team) => {
        const roster = getTeamCoordinators(team)
        // A desk only appears in the contact chart if it actually logs calls
        // and emails; the artworks and dispatch desks do not.
        const recordsContact = (profile: Profile) =>
          fieldsOf(deskFor(profile)).some((field) => field.name === 'overdue_calls')

        return [
          team,
          {
            submissions: submissionTrend(roster, entries, today),
            contact: contactEffort(roster, entries, today, recordsContact),
            contactExcluded: roster.length - roster.filter(recordsContact).length,
            throughput: deskThroughput(roster, entries, today, (p) => deskFor(p).headline),
          },
        ]
      })
    ) as Record<TeamModule, {
      submissions: ReturnType<typeof submissionTrend>
      contact: ReturnType<typeof contactEffort>
      contactExcluded: number
      throughput: ReturnType<typeof deskThroughput>
    }>
  }, [entries, today])

  const active = summaries[tab]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="Team Activity"
        subtitle="Coordinator performance, from the daily entries they submit"
        icon={<Users size={24} />}
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TeamModule)} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {TEAMS.map((team) => (
              <TabsTrigger key={team} value={team}>
                Team {team}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {summaries[team].headcount}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <p className="text-xs text-muted-foreground">Last {active.windowDays} days</p>
        </div>

        {TEAMS.map((team) => {
          const summary = summaries[team]
          const expectedToday = summary.headcount - summary.onLeaveToday

          return (
            <TabsContent key={team} value={team} className="space-y-4">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <KpiCard
                  title="Submitted today"
                  value={`${summary.submittedToday}/${Math.max(expectedToday, 0)}`}
                  hint={
                    summary.onLeaveToday > 0
                      ? `${summary.onLeaveToday} on leave`
                      : summary.submittedToday >= expectedToday
                        ? 'Everyone has reported'
                        : `${expectedToday - summary.submittedToday} still to file`
                  }
                  icon={CalendarCheck}
                  color={summary.submittedToday >= expectedToday ? 'emerald' : 'amber'}
                />
                <KpiCard
                  title="Sales logged"
                  value={formatCurrency(summary.totalSales, true)}
                  hint={`${summary.totalOrders} order${summary.totalOrders === 1 ? '' : 's'} received`}
                  icon={IndianRupee}
                  color="blue"
                />
                <KpiCard
                  title="Payment collected"
                  value={formatCurrency(summary.totalCollected, true)}
                  hint="Reported on the daily entries"
                  icon={IndianRupee}
                  color="emerald"
                />
                <KpiCard
                  title="Customer contact"
                  value={String(summary.totalCalls + summary.totalEmails)}
                  hint={`${summary.totalCalls} calls · ${summary.totalEmails} emails`}
                  icon={PhoneCall}
                  color="violet"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SubmissionTrendChart
                  points={charts[team].submissions}
                  headcount={summary.headcount}
                />
                <ContactEffortChart
                  rows={charts[team].contact}
                  excludedCount={charts[team].contactExcluded}
                />
              </div>

              <DeskThroughputCharts series={charts[team].throughput} />

              <ErrorsChart
                rows={summary.coordinators.map((person) => ({
                  name: person.name,
                  errors: person.errorCount,
                }))}
              />

              <GlassCard className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">Team {team}</h2>
                  {summary.totalPending > 0 && (
                    <span className="text-xs text-amber-500">
                      {summary.totalPending} task{summary.totalPending === 1 ? '' : 's'} pending
                      across the team
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">Coordinator</th>
                        <th className="py-2 font-medium">Today</th>
                        <th className="py-2 text-right font-medium">Entries</th>
                        <th className="py-2 text-right font-medium">Calls</th>
                        <th className="py-2 text-right font-medium">Emails</th>
                        <th className="py-2 text-right font-medium">Leads</th>
                        <th className="py-2 text-right font-medium">Orders</th>
                        <th className="py-2 text-right font-medium">Sales</th>
                        <th className="py-2 text-right font-medium">Collected</th>
                        <th className="py-2 text-right font-medium">Pending</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {summary.coordinators.map((person) => {
                        const style = STATUS_STYLES[person.todayStatus]
                        return (
                          <tr key={person.coordinatorId} className="hover:bg-muted/30">
                            <td className="py-2.5 font-medium text-foreground">{person.name}</td>
                            <td className="py-2.5">
                              <Badge variant="outline" className={cn('text-[10px]', style.className)}>
                                {style.label}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                              {person.entriesSubmitted}
                              {person.daysOnLeave > 0 && (
                                <span className="ml-1 text-[10px] text-violet-500">
                                  +{person.daysOnLeave}L
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-muted-foreground">{person.calls}</td>
                            <td className="py-2.5 text-right tabular-nums text-muted-foreground">{person.emails}</td>
                            <td className="py-2.5 text-right tabular-nums text-muted-foreground">{person.freshLeads}</td>
                            <td className="py-2.5 text-right tabular-nums text-muted-foreground">{person.orders}</td>
                            <td className="py-2.5 text-right tabular-nums text-foreground">
                              {person.salesAmount > 0 ? formatCurrency(person.salesAmount, true) : '—'}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-foreground">
                              {person.paymentCollected > 0
                                ? formatCurrency(person.paymentCollected, true)
                                : '—'}
                            </td>
                            <td
                              className={cn(
                                'py-2.5 text-right tabular-nums',
                                person.pendingWork > 0 ? 'text-amber-500' : 'text-muted-foreground'
                              )}
                            >
                              {person.pendingWork}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {summary.submittedToday === 0 && summary.coordinators.every((c) => c.entriesSubmitted === 0) && (
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    Nobody on this team has submitted a daily entry in the last{' '}
                    {summary.windowDays} days. Figures appear here as they file them.
                  </p>
                )}
              </GlassCard>
            </TabsContent>
          )
        })}
      </Tabs>
    </motion.div>
  )
}
