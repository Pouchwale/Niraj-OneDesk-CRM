/**
 * The Final score by groups (28 Nov 2026, the user's layout): for a period with
 * the weightage, one table per team (tabs on top) whose columns are the groups —
 * GP3's Performance, Follow-up, FMS, CAPA, or the Pouchwale people's own — and
 * the final score last. Each group cell is the points that group took off the
 * final score, so the groups add up to it. Clicking a group's heading opens its
 * items beside it (for everyone in the table); clicking again closes them.
 */

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { formatLost, groupColumns, groupScores, type GroupColumn, type GroupScore } from '@/lib/final-groups'
import type { PeriodKind, PeriodScores, ScoreEntry, ScoreModule } from '@/lib/score-history'
import { weightedDetail, weightedFinalOf, weightItemLabel, type WeightedFinal, type WeightItem } from '@/lib/weightage'
import { cn } from '@/lib/utils'
import { formatFinal, formatPart, formatScore } from './format'

const GOOD = 'text-emerald-600 dark:text-emerald-400'
const WARN = 'text-amber-600 dark:text-amber-400'
const BAD = 'text-rose-600 dark:text-rose-400'
const TH = 'px-2 py-2 text-right text-[11px] font-medium xl:text-xs'
const TD = 'px-2 py-2 text-right text-[13px] tabular-nums xl:text-sm'
const NAME_TD = 'truncate px-3 py-2 text-left text-[13px] font-medium xl:text-sm'
const FINAL_COL = 'border-l border-border/60 bg-primary/5 font-semibold'
/** An opened group's item columns: tinted so they read as inside the group. */
const ITEM_COL = 'bg-muted/40'

export interface GroupPerson {
  id: string
  name: string
  /** The users' module, GP3 or Pouchwale. */
  team: string | null
}

interface Row {
  person: GroupPerson
  team: string
  final: WeightedFinal
  groups: GroupScore[]
}

const outside = (item: WeightItem) => item === 'capa' || item === 'fms'
const finalTone = (score: number | null) => (score === null ? 'text-muted-foreground' : score >= 80 ? GOOD : score >= 50 ? WARN : BAD)
/** A group or item's colour by how much of its share it lost. */
function lostTone(lost: number | null | undefined, share: number | null | undefined): string {
  if (lost === null || lost === undefined) return 'text-muted-foreground'
  if (!share) return lost === 0 ? GOOD : BAD
  const part = lost / share
  return part <= 0.2 ? GOOD : part <= 0.5 ? WARN : BAD
}
const average = (list: (number | null | undefined)[]) => {
  const xs = list.filter((x): x is number => typeof x === 'number')
  return xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10 : null
}
const shareText = (share: number | null) => (share === null ? '' : ` ${share}%`)

/** An item's own score, as the module pages write it (minus scoring). */
function itemScoreText(entries: readonly ScoreEntry[], personId: string, item: WeightItem): string {
  if (outside(item)) return 'not connected yet'
  const e = entries.find((x) => x.coordinatorId === personId && x.module === item)
  if (e?.na) return 'N/A'
  if (!e || e.score === null || e.score === undefined) return 'no score'
  return formatScore(item as ScoreModule, e.score)
}

function groupTitle(g: GroupScore, entries: readonly ScoreEntry[], personId: string): string {
  if (g.share === null) return `CAPA: 100 less a set number of points for each CAPA assigned (the CAPA app is not connected yet). Takes off ${formatLost(g.lost)}.`
  const items = g.items.map((i) => `${weightItemLabel(i.item)} ${itemScoreText(entries, personId, i.item)} × ${i.share}% → ${formatLost(i.lost)}`)
  return `${g.label} ${g.share}%: ${items.join(' · ')}. Takes off ${formatLost(g.lost)} from the final score.`
}

/** The rows of every team, from the period's weightage. */
export function groupRows(period: PeriodScores, people: readonly GroupPerson[]): { teams: string[]; rows: Row[]; noPlan: GroupPerson[] } {
  const rows: Row[] = []
  const noPlan: GroupPerson[] = []
  for (const person of people) {
    const final = weightedFinalOf(period, person.id)
    if (!final.plan) {
      noPlan.push(person)
      continue
    }
    rows.push({ person, team: person.team ?? final.plan.team ?? 'Other', final, groups: groupScores(final) })
  }
  // Teams in the order of the plans (GP3's team plan first), then any other.
  const teams: string[] = []
  for (const plan of period.weighting?.plans ?? []) {
    const t = plan.team ?? rows.find((r) => r.final.plan?.id === plan.id)?.team
    if (t && rows.some((r) => r.team === t) && !teams.includes(t)) teams.push(t)
  }
  for (const r of rows) if (!teams.includes(r.team)) teams.push(r.team)
  return { teams, rows, noPlan }
}

/** The Excel sheets: one per team, every group with its items opened, then the figures behind each score. */
export function groupSheets(period: PeriodScores, people: readonly GroupPerson[]): { name: string; rows: (string | number | null)[][] }[] {
  const { teams, rows } = groupRows(period, people)
  return teams.map((team) => {
    const mine = rows.filter((r) => r.team === team)
    const cols = groupColumns(mine.map((r) => r.groups))
    const head: string[] = ['Coordinator']
    for (const c of cols) {
      head.push(`${c.label}${shareText(c.share)}`)
      for (const i of c.items) head.push(`  ${weightItemLabel(i.item)}${shareText(i.share)}`)
    }
    head.push('Final score')
    const out: (string | number | null)[][] = [head]
    for (const r of mine) {
      const line: (string | number | null)[] = [r.person.name]
      for (const c of cols) {
        const g = r.groups.find((x) => x.label === c.label)
        line.push(g ? formatLost(g.lost) : '—')
        for (const i of c.items) {
          const it = g?.items.find((x) => x.item === i.item)
          line.push(it ? `${formatLost(it.lost)} (${itemScoreText(period.entries, r.person.id, i.item)})` : '—')
        }
      }
      line.push(formatFinal(r.final.score))
      out.push(line)
    }
    out.push([], ['Details'])
    for (const r of mine) out.push([r.person.name, weightedDetail(r.final, formatPart)])
    return { name: team.slice(0, 31), rows: out }
  })
}

export function GroupScoreTable({ period, people, kind }: { period: PeriodScores; people: readonly GroupPerson[]; kind: PeriodKind }) {
  const { teams, rows, noPlan } = useMemo(() => groupRows(period, people), [period, people])
  const [teamChoice, setTeam] = useState<string | null>(null)
  const team = teamChoice && teams.includes(teamChoice) ? teamChoice : teams[0] ?? null
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (label: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  const mine = rows.filter((r) => r.team === team)
  const cols: GroupColumn[] = groupColumns(mine.map((r) => r.groups))
  const missing = noPlan.filter((p) => (p.team ?? 'Other') === team)
  const several = people.length > 1

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{several ? 'Nobody has a weightage for this period (Admin Panel → Final score weightage).' : 'You have no weightage for this period yet.'}</p>
  }

  return (
    <div className="space-y-3" data-testid="group-score">
      {teams.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-muted p-0.5" role="tablist" aria-label="Team">
            {teams.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={team === t}
                data-testid="group-team-tab"
                onClick={() => setTeam(t)}
                className={cn('rounded-full px-4 py-1.5 text-sm font-medium', team === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Click a group’s heading to see the scores inside it.</p>
        </div>
      )}
      {teams.length <= 1 && <p className="text-xs text-muted-foreground">Click a group’s heading to see the scores inside it.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed lg:min-w-0" data-testid="score-table">
          <colgroup>
            <col className="w-[19%]" />
            {cols.map((c) => (
              <Fragment key={c.label}>
                <col />
                {open.has(c.label) && c.items.map((i) => <col key={i.item} />)}
              </Fragment>
            ))}
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className={cn(TH, 'text-left')}>{several ? 'Coordinator' : 'You'}</th>
              {cols.map((c) => {
                const isOpen = open.has(c.label)
                return (
                  <Fragment key={c.label}>
                    <th className={cn(TH, 'text-foreground', isOpen && 'border-l border-border/60')}>
                      <button
                        type="button"
                        onClick={() => toggle(c.label)}
                        aria-expanded={isOpen}
                        data-testid="group-col"
                        title={isOpen ? `Close ${c.label}` : `See the scores inside ${c.label}`}
                        className="inline-flex items-center justify-end gap-1 rounded px-1 py-0.5 font-semibold hover:bg-primary/10 hover:text-primary"
                      >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        <span>
                          {c.label}
                          <span className="font-normal text-muted-foreground">{shareText(c.share)}</span>
                        </span>
                      </button>
                    </th>
                    {isOpen &&
                      c.items.map((i, n) => (
                        <th key={i.item} className={cn(TH, ITEM_COL, n === c.items.length - 1 && 'border-r border-border/60')} data-testid="group-item-col" title={outside(i.item) ? `${weightItemLabel(i.item)} comes from another app, not connected yet: it counts as zero for its share.` : undefined}>
                          {weightItemLabel(i.item)}
                          <span className="font-normal">{shareText(i.share)}</span>
                        </th>
                      ))}
                  </Fragment>
                )
              })}
              <th className={cn(TH, FINAL_COL, 'text-foreground')} title="The final score: 0 at full marks; the groups’ figures add up to it.">
                Final score
              </th>
            </tr>
          </thead>
          <tbody>
            {mine.map((r) => (
              <tr key={r.person.id} className="border-t border-border/50">
                <td className={NAME_TD} title={r.person.name}>
                  {r.person.name}
                </td>
                {cols.map((c) => {
                  const g = r.groups.find((x) => x.label === c.label)
                  const isOpen = open.has(c.label)
                  return (
                    <Fragment key={c.label}>
                      <td className={cn(TD, 'font-medium', lostTone(g?.lost, g?.share), isOpen && 'border-l border-border/60')} title={g ? groupTitle(g, period.entries, r.person.id) : `${c.label} is not in ${r.person.name}’s weightage`}>
                        {g ? formatLost(g.lost) : '—'}
                      </td>
                      {isOpen &&
                        c.items.map((i, n) => {
                          const it = g?.items.find((x) => x.item === i.item)
                          const own = itemScoreText(period.entries, r.person.id, i.item)
                          return (
                            <td key={i.item} className={cn(TD, ITEM_COL, lostTone(it?.lost, it?.share), n === c.items.length - 1 && 'border-r border-border/60')} title={it ? `${weightItemLabel(i.item)}: ${own} × ${it.share}% → ${formatLost(it.lost)}` : 'Not in this person’s weightage'}>
                              {it ? (
                                <>
                                  <span className="block">{formatLost(it.lost)}</span>
                                  <span className="block text-[11px] font-normal text-muted-foreground">{own}</span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                          )
                        })}
                    </Fragment>
                  )
                })}
                <td className={cn(TD, FINAL_COL, finalTone(r.final.score))} title={weightedDetail(r.final, formatPart)}>
                  {formatFinal(r.final.score)}
                </td>
              </tr>
            ))}
            {mine.length > 1 && (
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className={NAME_TD}>Team average</td>
                {cols.map((c) => {
                  const isOpen = open.has(c.label)
                  const avg = average(mine.map((r) => r.groups.find((g) => g.label === c.label)?.lost))
                  return (
                    <Fragment key={c.label}>
                      <td className={cn(TD, lostTone(avg, c.share), isOpen && 'border-l border-border/60')}>{formatLost(avg)}</td>
                      {isOpen &&
                        c.items.map((i, n) => {
                          const a = average(mine.map((r) => r.groups.find((g) => g.label === c.label)?.items.find((x) => x.item === i.item)?.lost))
                          return (
                            <td key={i.item} className={cn(TD, ITEM_COL, lostTone(a, i.share), n === c.items.length - 1 && 'border-r border-border/60')}>
                              {formatLost(a)}
                            </td>
                          )
                        })}
                    </Fragment>
                  )
                })}
                {(() => {
                  const avg = average(mine.map((r) => r.final.score))
                  return <td className={cn(TD, FINAL_COL, finalTone(avg))}>{formatFinal(avg)}</td>
                })()}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No weightage{kind === 'week' ? ' this week' : ''}: {missing.map((p) => p.name).join(', ')} (Admin Panel → Final score weightage).
        </p>
      )}
    </div>
  )
}
