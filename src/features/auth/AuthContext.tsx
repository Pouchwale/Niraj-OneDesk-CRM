import React, { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Profile, TeamModule } from '@/lib/types'
import { currentSession, signIn as requestSignIn, signOut as requestSignOut } from '@/lib/auth-api'
import { hydrateRoster, listUsers, subscribeToUsers, type ManagedUser } from '@/lib/users/store'
import { stopSharedData, useSharedData } from '@/lib/shared-data'
import { administersSystem, seesAllAccounts } from '@/lib/users/roles'
import { ownerOf, type Owner, type OwnedRow } from '@/lib/owner'

/**
 * Who is signed in.
 *
 * The browser no longer decides. It used to: the roster and the passwords sat
 * in localStorage and the session was `{"id":"admin-0"}` beside them, so anyone
 * who opened the developer tools could be the administrator. Now the server
 * checks the password, hands back a signed cookie the browser cannot forge, and
 * this asks it who that cookie belongs to.
 */

/** The roster, live — names, roles and teams, cached from the server. */
const roster = (): ManagedUser[] => listUsers()

/** Coordinators on one team, in roster order. */
export function getTeamCoordinators(module: TeamModule): ManagedUser[] {
  return roster().filter((p) => p.role === 'coordinator' && p.module === module)
}

export function getCoordinatorDisplayName(id: string): string {
  return roster().find((p) => p.id === id)?.full_name ?? 'Unknown'
}

/** The user's name, or undefined when nobody on the roster has that id. */
export function findUserName(id: string): string | undefined {
  return roster().find((p) => p.id === id)?.full_name
}

/** Who a row belongs to, named the way every screen names it (see lib/owner). */
export function rowOwner(row: OwnedRow): Owner {
  return ownerOf(row, findUserName, findUserIdByName)
}

/** The user whose full name this is exactly (ignoring case and spacing), if any. */
export function findUserIdByName(name: string): string | undefined {
  const wanted = name.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!wanted) return undefined
  return roster().find((p) => (p.full_name ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === wanted)?.id
}

export function getAllCoordinators(): ManagedUser[] {
  return roster().filter((p) => p.role === 'coordinator')
}

/**
 * Everyone an account can be booked against.
 *
 * The team leader owns accounts directly as well as running the coordinators,
 * and uploaded sheets name her in the coordinator column, so she has to be a
 * legitimate assignment target. She comes last so a coordinator always wins an
 * otherwise equal match. The administrator account is deliberately absent: it
 * runs the CRM rather than chasing payments.
 */
export function getAssignableOwners(): ManagedUser[] {
  return [
    ...roster().filter((p) => p.role === 'coordinator'),
    ...roster().filter((p) => p.role === 'team_leader'),
  ]
}

/** Where rows with no usable coordinator are parked until someone reassigns. */
export function getFallbackOwner(): ManagedUser | undefined {
  const leader = roster().find((p) => p.role === 'team_leader')
  return leader ?? roster().find((p) => p.role === 'admin')
}

/** The roster as it stands. */
export function getRoster(): ManagedUser[] {
  return roster()
}

interface AuthContextType {
  user: Profile | null
  /** True until the server has said whether this browser has a session. */
  loading: boolean
  /** The server could not be reached, so nobody can sign in until it is back. */
  offline: boolean
  /**
   * The system owner: every module, plus user accounts and credentials.
   *
   * Narrower than it used to be. Everything the operations head could already
   * reach hangs off `canManageTeam`, so splitting her out into her own role did
   * not quietly take her team away from her.
   */
  isAdmin: boolean
  isTeamLeader: boolean
  /** Sees the whole book rather than only their own accounts. */
  canManageTeam: boolean
  isCoordinator: boolean
  login: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** How often to re-check the session, so an expired one does not linger. */
const RECHECK_MS = 5 * 60_000

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  // Re-render when the roster changes, so a name edited in the admin panel
  // appears everywhere at once.
  useSyncExternalStore(subscribeToUsers, listUsers, listUsers)

  const check = useCallback(async () => {
    try {
      const session = await currentSession()
      setOffline(false)
      if (session) {
        hydrateRoster(session.roster)
        // The records live on the office machine; pick up this account's share
        // of them before any screen asks. Nothing is drawn until it lands.
        await useSharedData()
        setUser(session.user)
      } else {
        setUser(null)
      }
    } catch {
      // The server is unreachable: say so rather than letting somebody in on
      // the strength of a cached roster.
      setOffline(true)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  /*
   * A session expires, and somebody else can end it. Re-checking on a timer and
   * whenever the tab is looked at again means an expired session shows the
   * login page rather than a screen of buttons that all fail.
   */
  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(check, RECHECK_MS)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [user, check])

  const login = useCallback(async (username: string, password: string) => {
    const session = await requestSignIn(username.trim(), password)
    if (!session.user) throw new Error("The server did not say who signed in. Try again.")
    hydrateRoster(session.roster)
    await useSharedData()
    setUser(session.user)
    setOffline(false)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await requestSignOut()
    } finally {
      // Stop watching, and forget this account's share of the records.
      stopSharedData()
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        offline,
        isAdmin: administersSystem(user?.role),
        isTeamLeader: user?.role === 'team_leader',
        canManageTeam: seesAllAccounts(user?.role),
        isCoordinator: user?.role === 'coordinator',
        login,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
