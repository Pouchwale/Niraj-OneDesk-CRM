/**
 * Overview's section navigation, laid out the way CRM consoles do it: a
 * grouped side menu (Team, Activity, Decisions, Set aside) on wide screens,
 * a grouped drop-down on narrow ones. Counts that need action (approvals,
 * proofs to review) stand out; counts that are only a tally stay quiet.
 */

import type { ComponentType } from 'react'
import {
  AlertTriangle,
  BellOff,
  Bot,
  CalendarCheck,
  ClipboardCheck,
  Globe,
  History,
  LayoutDashboard,
  Scale,
  ShieldCheck,
  Target,
} from 'lucide-react'

import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface OverviewCounts {
  approvals: number
  proofs: number
  noFollowup: number
  dispute: number
  exported: number
  bankrupt: number
}

interface Item {
  value: string
  label: string
  icon: ComponentType<{ className?: string }>
  count?: (c: OverviewCounts) => number
  /** A count that asks for action, rather than a tally. */
  urgent?: boolean
  testId?: string
}

export const OVERVIEW_SECTIONS: { group: string; items: Item[] }[] = [
  {
    group: 'Team',
    items: [
      { value: 'summary', label: 'Summary', icon: LayoutDashboard },
      { value: 'scores', label: 'Scores', icon: Target, testId: 'tab-scores' },
      { value: 'attendance', label: 'Attendance', icon: CalendarCheck, testId: 'tab-attendance' },
    ],
  },
  {
    group: 'Activity',
    items: [
      { value: 'history', label: 'Follow-up history', icon: History },
      { value: 'robi', label: 'Robi task history', icon: Bot, testId: 'tab-robi' },
      { value: 'proofs', label: 'Proof checks', icon: ShieldCheck, count: (c) => c.proofs, urgent: true, testId: 'tab-proofs' },
    ],
  },
  {
    group: 'Decisions',
    items: [{ value: 'approvals', label: 'Approvals', icon: ClipboardCheck, count: (c) => c.approvals, urgent: true, testId: 'tab-approvals' }],
  },
  {
    group: 'Set aside',
    items: [
      { value: 'no-followup', label: 'No follow-up', icon: BellOff, count: (c) => c.noFollowup, testId: 'tab-no-followup' },
      { value: 'dispute', label: 'Dispute', icon: Scale, count: (c) => c.dispute, testId: 'tab-dispute' },
      { value: 'export', label: 'Export clients', icon: Globe, count: (c) => c.exported, testId: 'tab-export' },
      { value: 'bankrupt', label: 'Bankrupt', icon: AlertTriangle, count: (c) => c.bankrupt, testId: 'tab-bankrupt' },
    ],
  },
]

function Count({ n, urgent }: { n: number; urgent?: boolean }) {
  if (!n) return null
  return (
    <span
      className={cn(
        'ml-auto min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums',
        urgent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}
      aria-label={`${n} ${urgent ? 'waiting' : 'in total'}`}
    >
      {n}
    </span>
  )
}

/** Wide screens: the grouped side menu. */
export function OverviewSideNav({ counts }: { counts: OverviewCounts }) {
  return (
    // Stays put: only the section beside it scrolls (see AdminOverviewPage).
    // It scrolls on its own only on a screen too short to hold it.
    <nav
      aria-label="Overview sections"
      className="hidden w-52 shrink-0 lg:block lg:max-h-full lg:self-start lg:overflow-y-auto"
    >
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-3 backdrop-blur-sm">
        {OVERVIEW_SECTIONS.map((section) => (
          <div key={section.group} className="space-y-1">
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.group}</p>
            <TabsList
              aria-label={section.group}
              className="flex h-auto w-full flex-col items-stretch gap-0.5 overflow-visible bg-transparent p-0 backdrop-blur-none"
            >
              {section.items.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  data-testid={item.testId}
                  className={cn(
                    'h-8 w-full cursor-pointer justify-start gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-200',
                    'hover:bg-muted hover:text-foreground',
                    'data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:backdrop-blur-none'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  <Count n={item.count?.(counts) ?? 0} urgent={item.urgent} />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        ))}
      </div>
    </nav>
  )
}

/** Narrow screens: the same sections as a grouped drop-down. */
export function OverviewMobileNav({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: OverviewCounts }) {
  return (
    <div className="lg:hidden">
      <label htmlFor="overview-section" className="mb-1 block text-xs font-medium text-muted-foreground">
        Section
      </label>
      <select
        id="overview-section"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium"
      >
        {OVERVIEW_SECTIONS.map((section) => (
          <optgroup key={section.group} label={section.group}>
            {section.items.map((item) => {
              const n = item.count?.(counts) ?? 0
              return (
                <option key={item.value} value={item.value}>
                  {item.label}
                  {n ? ` (${n})` : ''}
                </option>
              )
            })}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
