/**
 * Which modules a coordinator may use (Admin Panel → Modules per coordinator,
 * 16 Nov 2026; shared/module-access.ts). A module switched off for them is
 * gone from their menu, and opening its page shows a short notice instead.
 */

import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Ban } from 'lucide-react'

import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthContext'
import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { APP_MODULES, moduleOfPath, moduleOn, type AppModuleId, type ModuleAccess } from '../../../shared/module-access'

/** Every coordinator's switched-off modules, as the store holds them (a coordinator gets only their own). */
export function useModuleAccess(): ModuleAccess[] {
  return useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.moduleAccess)
}

/** Whether the signed-in person may use this module (everyone but a coordinator always may). */
export function useModuleOn(): (module: AppModuleId) => boolean {
  const { user } = useAuth()
  const access = useModuleAccess()
  return (module) => moduleOn(access, user, module)
}

/** The page, or a notice when its module is switched off for this coordinator. */
export function ModuleGate({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const on = useModuleOn()
  const module = moduleOfPath(pathname)
  // The Quotations page also holds the Quotation Sheet, which has a switch of its own.
  if (!module || on(module) || (module === 'quotations' && on('quotation_sheet'))) return <>{children}</>
  const label = APP_MODULES.find((m) => m.id === module)?.label ?? 'This module'
  return (
    <GlassCard className="mx-auto mt-10 max-w-lg space-y-3 p-6 text-center" data-testid="module-switched-off">
      <Ban className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{label} is not switched on for you</h2>
      <p className="text-sm text-muted-foreground">The administrator decides which modules each coordinator uses. Ask them if you need it.</p>
      <Button asChild variant="outline">
        <Link to="/">Back to the Dashboard</Link>
      </Button>
    </GlassCard>
  )
}
