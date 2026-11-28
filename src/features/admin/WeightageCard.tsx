/**
 * Admin Panel → Final score weightage (27 Nov 2026, the user's request: "in the
 * admin panel give me the indexing of each to change in future").
 *
 * From 28 Nov 2026 each person has one final score (src/lib/weightage.ts). The
 * administrator keeps a weightage for a whole team or for particular people:
 * groups (e.g. GP3 "Performance") holding any of the items - every CRM score,
 * CAPA and FMS - each with its share of the whole score, adding up to 100%. A
 * person's own weightage beats their team's. Or, instead of groups, a CAPA
 * deduction: 100 less N for each CAPA assigned (Vishva).
 * Open weeks and months use the weightage as it stands; locked ones keep theirs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Scale, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAllCoordinators } from '@/features/auth/AuthContext'
import { getScoreHistory, saveWeighting } from '@/lib/score-history-api'
import { cn, formatDate } from '@/lib/utils'
import {
  checkWeightPlan,
  DEFAULT_WEIGHTING,
  groupShare,
  planTotal,
  WEIGHT_ITEMS,
  weightItemLabel,
  type WeightItem,
  type WeightingSetting,
  type WeightPlan,
} from '@/lib/weightage'

const selectClass = 'h-8 rounded-md border border-border bg-background px-2 text-sm'

/** The editor's copy of a plan: shares as typed. */
interface Draft {
  id: string
  name: string
  mode: 'team' | 'people'
  team: string
  people: Set<string>
  kind: 'groups' | 'capa'
  capaDeduction: string
  groups: { label: string; items: { item: WeightItem; share: string }[] }[]
}

const toDraft = (p: WeightPlan): Draft => ({
  id: p.id,
  name: p.name,
  mode: p.coordinatorIds?.length ? 'people' : 'team',
  team: p.team ?? '',
  people: new Set(p.coordinatorIds ?? []),
  kind: p.capaDeduction ? 'capa' : 'groups',
  capaDeduction: String(p.capaDeduction ?? 20),
  groups: p.groups.map((g) => ({ label: g.label, items: (Object.entries(g.items) as [WeightItem, number][]).map(([item, share]) => ({ item, share: String(share) })) })),
})

const fromDraft = (d: Draft) => ({
  id: d.id,
  name: d.name,
  ...(d.mode === 'team' ? { team: d.team } : { coordinatorIds: [...d.people] }),
  groups:
    d.kind === 'capa'
      ? []
      : d.groups.map((g) => ({ label: g.label, items: Object.fromEntries(g.items.filter((i) => i.share.trim() !== '').map((i) => [i.item, Number(i.share)])) })),
  capaDeduction: d.kind === 'capa' ? Number(d.capaDeduction) : null,
})

export function WeightageCard() {
  const [setting, setSetting] = useState<WeightingSetting | null>(null)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const coordinators = useMemo(() => [...getAllCoordinators()].sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '')), [])
  const nameOf = (id: string) => coordinators.find((c) => c.id === id)?.full_name ?? 'Someone no longer active'
  const teams = [...new Set(coordinators.map((c) => c.module).filter((m): m is NonNullable<typeof m> => Boolean(m)))].sort() as string[]

  const load = useCallback(async () => {
    try {
      const data = await getScoreHistory('week', 1)
      setSetting(data.weighting ?? DEFAULT_WEIGHTING)
    } catch (err) {
      toast.error('Could not load the weightage.', { description: err instanceof Error ? err.message : 'Try again.' })
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const save = async (plans: ReturnType<typeof fromDraft>[] | WeightPlan[], message: string) => {
    if (!setting) return false
    setSaving(true)
    try {
      const { weighting } = await saveWeighting({ from: setting.from, plans: plans as WeightPlan[] })
      setSetting(weighting)
      toast.success(message, { description: 'Open weeks and months from 28 Nov 2026 use it now; locked ones keep theirs.' })
      return true
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    if (!editing || !setting) return
    const plan = fromDraft(editing)
    try {
      checkWeightPlan(plan)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Check the weightage.')
      return
    }
    const exists = setting.plans.some((p) => p.id === plan.id)
    const plans = exists ? setting.plans.map((p) => (p.id === plan.id ? plan : p)) : [...setting.plans, plan]
    if (await save(plans, `${plan.name} saved.`)) setEditing(null)
  }

  const remove = async (plan: WeightPlan) => {
    if (!setting) return
    if (!window.confirm(`Remove the weightage "${plan.name}"? Its people go to their team's weightage, or have no final score until one is set.`)) return
    await save(
      setting.plans.filter((p) => p.id !== plan.id),
      `${plan.name} removed.`
    )
  }

  const startNew = () =>
    setEditing({
      id: `plan-${Date.now().toString(36)}`,
      name: '',
      mode: 'people',
      team: teams[0] ?? '',
      people: new Set(),
      kind: 'groups',
      capaDeduction: '20',
      groups: [{ label: '', items: [{ item: 'robi', share: '' }] }],
    })

  const known = (id: string) => coordinators.some((c) => c.id === id)
  const appliesTo = (p: WeightPlan) => {
    if (!p.coordinatorIds?.length) return `Whole ${p.team} team`
    // One person whose login is switched off (Vishva): her plan's name, said so.
    if (p.coordinatorIds.length === 1 && !known(p.coordinatorIds[0])) return `${p.name} (login switched off: counts once it is on again)`
    return p.coordinatorIds.map(nameOf).join(', ')
  }
  const draftTotal = editing && editing.kind === 'groups' ? planTotal(fromDraft(editing)) : null

  /* ----- the editor's small changes ----- */
  const set = (patch: Partial<Draft>) => setEditing((d) => (d ? { ...d, ...patch } : d))
  const setGroup = (gi: number, patch: Partial<Draft['groups'][number]>) =>
    setEditing((d) => (d ? { ...d, groups: d.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) } : d))
  const setItem = (gi: number, ii: number, patch: Partial<Draft['groups'][number]['items'][number]>) =>
    setEditing((d) => (d ? { ...d, groups: d.groups.map((g, i) => (i === gi ? { ...g, items: g.items.map((x, j) => (j === ii ? { ...x, ...patch } : x)) } : g)) } : d))

  return (
    <GlassCard className="space-y-4 p-6" data-testid="weightage-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Scale className="h-5 w-5 text-primary" /> Final score weightage
          </h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            From {formatDate(setting?.from ?? DEFAULT_WEIGHTING.from)} each person has one final score instead of Payments and Operations: the share of each item
            in their weightage, adding up to 100%. A person&apos;s own weightage beats their team&apos;s. No scaling: an item with no score (CAPA and FMS until
            that app is connected) counts as zero for its share.
          </p>
        </div>
        {!editing && (
          <Button size="sm" onClick={startNew} disabled={!setting} data-testid="weightage-add">
            <Plus className="mr-1.5 h-4 w-4" /> Add weightage
          </Button>
        )}
      </div>

      {!setting ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {setting.plans.map((p) => (
            <div key={p.id} className="rounded-lg border border-border/60 bg-background/40 p-4" data-testid="weightage-plan">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground" title={appliesTo(p)}>
                    {appliesTo(p)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(toDraft(p))} disabled={Boolean(editing)}>
                    Edit
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void remove(p)} disabled={Boolean(editing) || saving} aria-label={`Remove ${p.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {p.capaDeduction ? (
                <p className="mt-2 text-sm">100% by default, less {p.capaDeduction}% for each CAPA assigned.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {p.groups.map((g) => (
                    <li key={g.label} className="flex gap-2">
                      <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{groupShare(g)}%</span>
                      <span>
                        <span className="font-medium">{g.label}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          ·{' '}
                          {(Object.entries(g.items) as [WeightItem, number][]).map(([item, share]) => `${weightItemLabel(item)} ${share}%`).join(' · ')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="space-y-4 rounded-lg border border-primary/40 bg-primary/5 p-4" data-testid="weightage-editor">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input className="h-8" value={editing.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. GP3 team" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">For</span>
              <select className={cn(selectClass, 'w-full')} value={editing.mode} onChange={(e) => set({ mode: e.target.value as Draft['mode'] })}>
                <option value="team">A whole team</option>
                <option value="people">Particular people</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Worked out as</span>
              <select className={cn(selectClass, 'w-full')} value={editing.kind} onChange={(e) => set({ kind: e.target.value as Draft['kind'] })}>
                <option value="groups">Groups and shares</option>
                <option value="capa">100% less a share per CAPA</option>
              </select>
            </label>
          </div>

          {editing.mode === 'team' ? (
            <select className={selectClass} value={editing.team} onChange={(e) => set({ team: e.target.value })} aria-label="Team">
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {coordinators.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.people.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(editing.people)
                      if (e.target.checked) next.add(c.id)
                      else next.delete(c.id)
                      set({ people: next })
                    }}
                  />
                  {c.full_name}
                  {c.module ? <span className="text-xs text-muted-foreground">({c.module})</span> : null}
                </label>
              ))}
            </div>
          )}

          {editing.kind === 'capa' ? (
            <label className="flex items-center gap-2 text-sm">
              100% less
              <Input className="h-8 w-20 text-right" inputMode="decimal" value={editing.capaDeduction} onChange={(e) => set({ capaDeduction: e.target.value })} />% for each CAPA assigned
            </label>
          ) : (
            <div className="space-y-3">
              {editing.groups.map((g, gi) => {
                const share = g.items.reduce((a, i) => a + (Number(i.share) || 0), 0)
                return (
                  <div key={gi} className="rounded-md border border-border/60 bg-background/60 p-3" data-testid="weightage-group">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input className="h-8 w-56" value={g.label} onChange={(e) => setGroup(gi, { label: e.target.value })} placeholder="Group name, e.g. Performance" />
                      <span className="text-sm font-semibold tabular-nums">{Math.round(share * 100) / 100}%</span>
                      <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => set({ groups: editing.groups.filter((_, i) => i !== gi) })}>
                        Remove group
                      </Button>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {g.items.map((it, ii) => (
                        <div key={ii} className="flex items-center gap-2">
                          <select className={cn(selectClass, 'w-60')} value={it.item} onChange={(e) => setItem(gi, ii, { item: e.target.value as WeightItem })} aria-label="Item">
                            {WEIGHT_ITEMS.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.label}
                                {w.outside ? ' (other app)' : ''}
                              </option>
                            ))}
                          </select>
                          <Input className="h-8 w-20 text-right" inputMode="decimal" value={it.share} onChange={(e) => setItem(gi, ii, { share: e.target.value })} aria-label={`${weightItemLabel(it.item)} share`} />
                          <span className="text-sm text-muted-foreground">% of the final score</span>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setGroup(gi, { items: g.items.filter((_, j) => j !== ii) })} aria-label="Remove item">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setGroup(gi, { items: [...g.items, { item: 'robi', share: '' }] })}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add item
                      </Button>
                    </div>
                  </div>
                )
              })}
              <Button size="sm" variant="outline" className="h-8" onClick={() => set({ groups: [...editing.groups, { label: '', items: [{ item: 'robi', share: '' }] }] })}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add group
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {draftTotal !== null ? (
              <p className={cn('text-sm font-medium', Math.abs(draftTotal - 100) < 0.001 ? 'text-emerald-600' : 'text-amber-600')} data-testid="weightage-total">
                Total {draftTotal}%{Math.abs(draftTotal - 100) < 0.001 ? '' : ' (must be 100%)'}
              </p>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void saveDraft()} disabled={saving} data-testid="weightage-save">
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
