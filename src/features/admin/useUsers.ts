import { useSyncExternalStore } from 'react'
import { listUsers, subscribeToUsers, type ManagedUser } from '@/lib/users/store'

/**
 * The roster, re-rendered whenever it changes.
 *
 * The store hands back the same array reference between writes, so this is
 * safe to read straight from `useSyncExternalStore` without a snapshot cache.
 */
export function useUsers(): ManagedUser[] {
  return useSyncExternalStore(subscribeToUsers, listUsers, listUsers)
}
