/**
 * Which modules each coordinator uses (Admin Panel, 16 Nov 2026, the user's
 * request). The administrator switches modules off per coordinator; a module
 * switched off is gone from that coordinator's menu and cannot be opened, and
 * its score shows N/A in the Final score and is left out of their final score
 * (the other modules' ratio shares fill 100%), in every period, locked ones
 * too. Robi tasks off: Robi makes them no daily list. Dashboard and Final
 * score are always on. Nothing is switched off unless the administrator does.
 */

export type AppModuleId =
  | 'active_payments'
  | 'overdue_payments'
  | 'rfd'
  | 'quotations'
  | 'pre_sales'
  | 'billing_issues'
  | 'service'
  | 'self_leads'
  | 'robi_tasks'

export const APP_MODULES: readonly { id: AppModuleId; label: string; route: string | null; scores: readonly string[] }[] = [
  { id: 'active_payments', label: 'Active Payments', route: '/companies', scores: [] },
  { id: 'overdue_payments', label: 'Overdue Payments', route: '/overdue', scores: ['kpi', 'kpi_dispute'] },
  { id: 'rfd', label: 'Ready for Dispatch', route: '/rfd', scores: [] },
  { id: 'quotations', label: 'Quotations', route: '/quotations', scores: ['quotations'] },
  { id: 'pre_sales', label: 'Pre Sales Analysis', route: '/pre-sales', scores: [] },
  { id: 'billing_issues', label: 'Billing Issues', route: '/billing-issues', scores: ['billing'] },
  { id: 'service', label: 'Service', route: '/service', scores: ['service'] },
  { id: 'self_leads', label: 'Self Leads', route: '/self-leads', scores: ['self_leads'] },
  { id: 'robi_tasks', label: 'Robi tasks', route: null, scores: ['robi'] },
]

export const APP_MODULE_IDS: readonly AppModuleId[] = APP_MODULES.map((m) => m.id)

/** One coordinator's switched-off modules (absent: everything on). */
export interface ModuleAccess {
  coordinatorId: string
  off: AppModuleId[]
  by: string
  at: string
}

/** The modules switched off for a coordinator. */
export function modulesOff(access: readonly ModuleAccess[] | null | undefined, coordinatorId: string | null | undefined): Set<AppModuleId> {
  if (!coordinatorId) return new Set()
  return new Set(access?.find((a) => a.coordinatorId === coordinatorId)?.off ?? [])
}

/** Whether a module is switched on for this person (anyone not a coordinator has everything). */
export function moduleOn(access: readonly ModuleAccess[] | null | undefined, user: { id: string; role: string } | null | undefined, module: AppModuleId): boolean {
  if (!user || user.role !== 'coordinator') return true
  return !modulesOff(access, user.id).has(module)
}

/** The app module a page belongs to, by its path ("/overdue/123" → overdue_payments); null for pages always on. */
export function moduleOfPath(path: string): AppModuleId | null {
  for (const m of APP_MODULES) if (m.route && (path === m.route || path.startsWith(`${m.route}/`))) return m.id
  return null
}

/** The score modules (Final score columns) switched off for a coordinator. */
export function scoreModulesOff(access: readonly ModuleAccess[] | null | undefined, coordinatorId: string): Set<string> {
  const off = modulesOff(access, coordinatorId)
  return new Set(APP_MODULES.filter((m) => off.has(m.id)).flatMap((m) => m.scores))
}

/** A switch list as saved: known modules only, each once, in the list's order. */
export function cleanModulesOff(value: unknown): AppModuleId[] {
  const list = Array.isArray(value) ? value : []
  return APP_MODULE_IDS.filter((id) => list.includes(id))
}
