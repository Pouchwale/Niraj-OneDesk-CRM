/**
 * Admin Panel → Modules per coordinator (16 Nov 2026, the user's request):
 * the administrator switches each coordinator's modules on or off. A module
 * switched off is gone from that coordinator's menu and cannot be opened; its
 * score shows N/A in the Final score and is left out of their final score, in
 * every period. Robi tasks off: no daily list. Dashboard and Final score
 * always stay on (shared/module-access.ts).
 */

import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'

import { GlassCard } from '@/components/shared/GlassCard'
import { Switch } from '@/components/ui/switch'
import { getAllCoordinators } from '@/features/auth/AuthContext'
import { useModuleAccess } from '@/features/auth/module-access'
import { demoCompanyStore } from '@/lib/demo-companies'
import { whenSaved } from '@/lib/shared-data'
import { APP_MODULES, moduleOn, moduleOnByDefault, modulesOff, modulesOn, type AppModuleId } from '../../../shared/module-access'

export function ModuleAccessCard({ userId }: { userId: string }) {
  const access = useModuleAccess()
  const coordinators = [...getAllCoordinators()].sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (coordinatorId: string, team: string | null | undefined, name: string, module: AppModuleId, on: boolean) => {
    const off = modulesOff(access, coordinatorId)
    const switchedOn = modulesOn(access, coordinatorId)
    if (on) {
      off.delete(module)
      // A module that starts on for another team only (Quotation Sheet: GP3) is switched on for them by name.
      if (!moduleOnByDefault(module, team)) switchedOn.add(module)
    } else {
      off.add(module)
      switchedOn.delete(module)
    }
    setBusy(`${coordinatorId}|${module}`)
    try {
      demoCompanyStore.setModuleAccess(coordinatorId, [...off], userId, new Date().toISOString(), [...switchedOn])
      await whenSaved()
      const label = APP_MODULES.find((m) => m.id === module)?.label ?? module
      toast.success(`${label} ${on ? 'switched on' : 'switched off'} for ${name}.`, {
        description: on ? 'Back in their menu and counted in their final score.' : 'Gone from their menu; their score shows N/A and is not counted.',
      })
    } catch (err) {
      toast.error('Not saved.', { description: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassCard className="space-y-4 p-4 sm:p-6" data-testid="module-access">
      <div className="flex items-start gap-3">
        <LayoutGrid className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h3 className="text-base font-semibold">Modules per coordinator</h3>
          <p className="text-xs text-muted-foreground">
            Switch a module off for a coordinator who doesn't use it: it leaves their menu and can't be opened, and its score shows N/A and is
            not counted in their final score (in every period). Robi tasks off means no daily list. Dashboard and Final score always stay on.
            Flexo Quotation Calculation starts on for GP3 coordinators and off for the others; switch it either way for anyone.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Coordinator</th>
              {APP_MODULES.map((m) => (
                <th key={m.id} className="px-2 py-2.5 text-center font-medium leading-tight">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {coordinators.map((c) => {
              const off = modulesOff(access, c.id)
              const name = c.full_name ?? c.id
              return (
                <tr key={c.id} data-testid="module-access-row">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {name}
                    {c.module && <span className="ml-2 text-xs font-normal text-muted-foreground">{c.module}</span>}
                    {off.size > 0 && <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">{off.size} off</span>}
                  </td>
                  {APP_MODULES.map((m) => (
                    <td key={m.id} className="px-2 py-2 text-center">
                      <Switch
                        checked={moduleOn(access, { id: c.id, role: 'coordinator', module: c.module }, m.id)}
                        disabled={busy !== null}
                        aria-label={`${m.label} for ${name}`}
                        onCheckedChange={(on) => void toggle(c.id, c.module, name, m.id, on)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}
