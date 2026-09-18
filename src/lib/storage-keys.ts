/**
 * Every localStorage key the app writes, in one place.
 *
 * Demo mode keeps its whole state in the browser, across sixteen keys that
 * grew up under four naming conventions. This catalogue is what "Reset demo
 * data" clears, and the list a future storage module should replace.
 */

/** Keys written exactly as listed. */
export const STORAGE_KEYS = {
  session: 'crm_user_session',
  sessionUserId: 'demo_user_id',
  theme: 'crm_theme',
  users: 'crm.users',
  settings: 'crm.settings',
  dailyEntries: 'coordinator_daily_entries',
  otifDeliveries: 'coordinator_otif_deliveries',
  otifFileName: 'coordinator_otif_filename',
  otifArchives: 'coordinator_otif_archives',
  emailProvider: 'crm.messaging.emailProvider',
  senderOrg: 'crm.messaging.senderOrg',
  aliases: 'crm_coordinator_aliases',
  demoStore: 'crm_demo_store',
  reminders: 'crm.directed_reminders',
} as const

/** Keys written per user, as `<prefix><userId>`. */
export const STORAGE_KEY_PREFIXES = ['crm.notifications.read', 'crm.assistant.'] as const

/**
 * Drops all demo-mode state, keeping the theme and the signed-in session so
 * the person who pressed the button is still looking at the app afterwards.
 *
 * Returns how many keys were removed; the caller reloads, because the stores
 * hydrate once at import and would otherwise keep serving stale data.
 */
export function clearDemoData(): number {
  if (typeof localStorage === 'undefined') return 0
  const keep = new Set<string>([STORAGE_KEYS.session, STORAGE_KEYS.sessionUserId, STORAGE_KEYS.theme])
  const exact = new Set<string>(Object.values(STORAGE_KEYS))
  const doomed: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || keep.has(key)) continue
    if (exact.has(key) || STORAGE_KEY_PREFIXES.some((p) => key.startsWith(p))) doomed.push(key)
  }

  for (const key of doomed) localStorage.removeItem(key)
  return doomed.length
}
