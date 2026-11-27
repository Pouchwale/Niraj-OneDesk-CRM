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
  | 'quotation_sheet'

/**
 * `defaultTeam`: a module that starts switched on only for that team's
 * coordinators (Quotation Sheet, 27 Nov 2026: "visible to all GP3 users");
 * the administrator can still switch it on or off for anyone. Every other
 * module starts on for everyone.
 */
export const APP_MODULES: readonly { id: AppModuleId; label: string; route: string | null; scores: readonly string[]; defaultTeam?: 'GP3' | 'Pouchwale' }[] = [
  { id: 'active_payments', label: 'Active Payments', route: '/companies', scores: [] },
  { id: 'overdue_payments', label: 'Overdue Payments', route: '/overdue', scores: ['kpi', 'kpi_dispute'] },
  { id: 'rfd', label: 'Ready for Dispatch', route: '/rfd', scores: [] },
  { id: 'quotations', label: 'Quotations', route: '/quotations', scores: ['quotations'] },
  { id: 'pre_sales', label: 'Pre Sales Analysis', route: '/pre-sales', scores: [] },
  { id: 'billing_issues', label: 'Billing Issues', route: '/billing-issues', scores: ['billing'] },
  { id: 'service', label: 'Service', route: '/service', scores: ['service'] },
  { id: 'self_leads', label: 'Self Leads', route: '/self-leads', scores: ['self_leads'] },
  { id: 'robi_tasks', label: 'Robi tasks', route: null, scores: ['robi'] },
  // A part of Quotations (?part=sheet), so no page of its own here: Quotations hides it when off.
  { id: 'quotation_sheet', label: 'Quotation Sheet', route: null, scores: [], defaultTeam: 'GP3' },
]

export const APP_MODULE_IDS: readonly AppModuleId[] = APP_MODULES.map((m) => m.id)

/** One coordinator's switched-off modules (absent: everything on). */
export interface ModuleAccess {
  coordinatorId: string
  off: AppModuleId[]
  /** Team-default modules (defaultTeam) switched on for someone outside that team. */
  on?: AppModuleId[]
  by: string
  at: string
}

/** The modules switched off for a coordinator. */
export function modulesOff(access: readonly ModuleAccess[] | null | undefined, coordinatorId: string | null | undefined): Set<AppModuleId> {
  if (!coordinatorId) return new Set()
  return new Set(access?.find((a) => a.coordinatorId === coordinatorId)?.off ?? [])
}

/** The team-default modules switched on for a coordinator outside that team. */
export function modulesOn(access: readonly ModuleAccess[] | null | undefined, coordinatorId: string | null | undefined): Set<AppModuleId> {
  if (!coordinatorId) return new Set()
  return new Set(access?.find((a) => a.coordinatorId === coordinatorId)?.on ?? [])
}

/** Whether a module starts on for a coordinator of this team, before any switch. */
export function moduleOnByDefault(module: AppModuleId, team: string | null | undefined): boolean {
  const m = APP_MODULES.find((x) => x.id === module)
  return !m?.defaultTeam || m.defaultTeam === team
}

/** Whether a module is switched on for this person (anyone not a coordinator has everything). */
export function moduleOn(
  access: readonly ModuleAccess[] | null | undefined,
  user: { id: string; role: string; module?: string | null } | null | undefined,
  module: AppModuleId
): boolean {
  if (!user || user.role !== 'coordinator') return true
  if (modulesOff(access, user.id).has(module)) return false
  return modulesOn(access, user.id).has(module) || moduleOnByDefault(module, user.module)
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
