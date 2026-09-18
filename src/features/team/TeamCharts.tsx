import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GlassCard } from '@/components/shared/GlassCard'
import type { ContactEffortRow, DeskSeries, SubmissionPoint } from './team-activity'

/*
 * Palette
 * -------
 * The four categorical slots below are the validated defaults, checked for
 * lightness band, chroma, colour-vision separation and contrast against both
 * surfaces. Every series is also directly labelled or legended, so identity is
 * never carried by colour alone.
 */
const SERIES = {
  blue: 'var(--viz-1)',
  orange: 'var(--viz-2)',
  aqua: 'var(--viz-3)',
  yellow: 'var(--viz-4)',
}

const AXIS = 'var(--color-muted-foreground)'
const GRID = 'var(--color-border)'
const SURFACE = 'var(--color-background)'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: '10px',
  fontSize: '12px',
  color: 'var(--color-popover-foreground)',
} as const

/** Shared axis props: recessive, no tick lines, no axis rule. */
const axisProps = {
  stroke: AXIS,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const

function EmptyPlot({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border/60">
      <p className="max-w-xs text-center text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

/* ===== 1. Are the entries coming in? ===== */

export function SubmissionTrendChart({
  points,
  headcount,
}: {
  points: SubmissionPoint[]
  headcount: number
}) {
  const anyData = points.some((p) => p.submitted > 0 || p.onLeave > 0)

  return (
    <GlassCard className="flex h-full flex-col p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">Daily entries filed</h3>
        <span className="text-xs text-muted-foreground">
          dashed line = {headcount} expected
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        The gap between the fill and the line is the day's missing entries.
      </p>

      {!anyData ? (
        <EmptyPlot message="No entries filed in this window yet. The chart fills in as the team submits." />
      ) : (
        <div className="min-h-[220px] w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="submitted-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.blue} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIES.blue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
              <YAxis {...axisProps} allowDecimals={false} width={34} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: AXIS, strokeWidth: 1, strokeDasharray: '3 3' }}
                formatter={(value: number, name) => [value, name === 'submitted' ? 'Filed' : name]}
              />
              <ReferenceLine
                y={headcount}
                stroke={AXIS}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="submitted"
                name="Filed"
                stroke={SERIES.blue}
                strokeWidth={2}
                fill="url(#submitted-fill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  )
}

/* ===== 2. Who is doing the chasing, and how? ===== */

const CONTACT_SERIES = [
  { key: 'advanceCalls', label: 'Advance calls', color: SERIES.blue },
  { key: 'advanceEmails', label: 'Advance emails', color: SERIES.orange },
  { key: 'overdueCalls', label: 'Overdue calls', color: SERIES.aqua },
  { key: 'overdueEmails', label: 'Overdue emails', color: SERIES.yellow },
] as const

export function ContactEffortChart({
  rows,
  excludedCount,
}: {
  rows: ContactEffortRow[]
  excludedCount: number
}) {
  const anyData = rows.some((row) => row.total > 0)

  return (
    <GlassCard className="flex h-full flex-col p-5">
      <h3 className="font-semibold text-foreground">Customer contact by coordinator</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Calls and emails logged over the window
        {excludedCount > 0 && `, for the ${rows.length} whose desk records them`}.
      </p>

      {!anyData ? (
        <EmptyPlot message="No calls or emails logged yet in this window." />
      ) : (
        <div style={{ height: Math.max(180, rows.length * 44 + 50) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              barCategoryGap={14}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...axisProps} width={112} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID, fillOpacity: 0.25 }} />
              <Legend
                verticalAlign="bottom"
                height={28}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}
              />
              {CONTACT_SERIES.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stackId="contact"
                  fill={series.color}
                  // A 2px surface gap keeps adjoining segments readable, and the
                  // final segment carries the rounded end of the bar.
                  stroke={SURFACE}
                  strokeWidth={2}
                  radius={index === CONTACT_SERIES.length - 1 ? [0, 4, 4, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  )
}

/* ===== 3. Each desk's own output ===== */

export function DeskThroughputCharts({ series }: { series: DeskSeries[] }) {
  const anyData = series.some((desk) => desk.total > 0)

  return (
    <GlassCard className="p-5">
      <h3 className="font-semibold text-foreground">Desk output</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        One chart per coordinator, each on its own scale — these desks measure
        different work, so a shared axis would invent a comparison that does not exist.
      </p>

      {!anyData ? (
        <EmptyPlot message="No desk output recorded yet in this window." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {series.map((desk) => (
            <div key={desk.coordinatorId} className="rounded-lg border border-border/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{desk.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {desk.total}
                </span>
              </div>
              <p className="mb-2 text-[10px] text-muted-foreground">{desk.metricLabel}</p>
              <div className="h-[70px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={desk.points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ stroke: AXIS, strokeWidth: 1, strokeDasharray: '3 3' }}
                      labelFormatter={(label) => String(label)}
                      formatter={(value: number) => [value, desk.metricLabel]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={SERIES.aqua}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}

/* ===== 4. Quality: the one measure every desk shares ===== */

export function ErrorsChart({ rows }: { rows: { name: string; errors: number }[] }) {
  const anyData = rows.some((row) => row.errors > 0)
  const worst = Math.max(...rows.map((row) => row.errors), 0)

  return (
    <GlassCard className="p-5">
      <h3 className="font-semibold text-foreground">Errors logged</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        The one measure every desk records, so it is the one that compares fairly.
      </p>

      {!anyData ? (
        <EmptyPlot message="No errors logged in this window." />
      ) : (
        <div style={{ height: Math.max(160, rows.length * 36 + 30) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
              barCategoryGap={12}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...axisProps} width={112} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID, fillOpacity: 0.25 }} />
              <Bar dataKey="errors" name="Errors" radius={[0, 4, 4, 0]}>
                {rows.map((row) => (
                  // Emphasis, not categorical: the worst offender is the point,
                  // the rest are context.
                  <Cell
                    key={row.name}
                    fill={row.errors === worst && worst > 0 ? SERIES.orange : SERIES.blue}
                    fillOpacity={row.errors === worst && worst > 0 ? 1 : 0.45}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  )
}
