import React from 'react'
import { toast } from 'sonner'
import {
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import { getCompanies } from '@/lib/companies-api'
import { getOverduePayments } from '@/lib/overdue-api'
import { ROLE_LABEL } from '@/lib/users/roles'
import {
  blockedFromRemoval,
  changePassword,
  deleteUser,
  type ManagedUser,
} from '@/lib/users/store'
import { MIN_PASSWORD_LENGTH } from '@shared/auth'
import { useUsers } from './useUsers'
import { UserFormDialog } from './UserFormDialog'
import { clearDemoData } from '@/lib/storage-keys'

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-violet-500/10 text-violet-500 border-violet-500/30',
  team_leader: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
  coordinator: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
}

const ROLE_ORDER = ['admin', 'team_leader', 'coordinator']

/** How many accounts each person still owns, so nobody is deleted silently. */
function useOwnedCounts(): Record<string, number> {
  const [counts, setCounts] = React.useState<Record<string, number>>({})

  React.useEffect(() => {
    let cancelled = false
    Promise.all([getCompanies(), getOverduePayments()])
      .then(([companies, overdue]) => {
        if (cancelled) return
        const tally: Record<string, number> = {}
        for (const row of [...companies, ...overdue]) {
          const owner = row.assigned_coordinator_id
          if (owner) tally[owner] = (tally[owner] ?? 0) + 1
        }
        setCounts(tally)
      })
      .catch(() => {
        // A failed count must not block administration; the delete dialog just
        // says nothing about workload rather than guessing at zero.
        if (!cancelled) setCounts({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  return counts
}

export function AdminPanelPage() {
  const { user: signedIn } = useAuth()
  const users = useUsers()
  const owned = useOwnedCounts()

  const [query, setQuery] = React.useState('')
  const [editing, setEditing] = React.useState<ManagedUser | undefined>()
  const [formOpen, setFormOpen] = React.useState(false)
  const [resetting, setResetting] = React.useState<ManagedUser | undefined>()
  const [confirming, setConfirming] = React.useState<ManagedUser | undefined>()
  const [wiping, setWiping] = React.useState(false)

  const wipeDemoData = () => {
    const removed = clearDemoData()
    toast.success(`Cleared ${removed} stored ${removed === 1 ? 'item' : 'items'}. Reloading with fresh demo data.`)
    // The stores hydrate once at import; a reload is the honest way to reset.
    window.setTimeout(() => window.location.reload(), 600)
  }

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = needle
      ? users.filter((u) =>
          [u.full_name, u.username, u.email, ROLE_LABEL[u.role], u.module ?? '']
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
      : users
    return [...matched].sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        a.full_name.localeCompare(b.full_name)
    )
  }, [users, query])

  const openCreate = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  const openEdit = (target: ManagedUser) => {
    setEditing(target)
    setFormOpen(true)
  }

  const handleDelete = async (target: ManagedUser) => {
    try {
      await deleteUser(target.id)
      toast.success(`${target.full_name} removed`)
      setConfirming(undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the account')
    }
  }

  const counts = React.useMemo(() => {
    const tally: Record<string, number> = {}
    for (const u of users) tally[u.role] = (tally[u.role] ?? 0) + 1
    return tally
  }, [users])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Panel"
        subtitle="Every account on the system, with the credentials they sign in with"
        icon={<ShieldCheck className="h-6 w-6" />}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setWiping(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Reset demo data
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add user
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ROLE_ORDER.map((role) => (
          <GlassCard key={role} className="p-4 sm:p-6">
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">
              {ROLE_LABEL[role as keyof typeof ROLE_LABEL]}
            </p>
            <p className="mt-3 text-xl font-bold tabular-nums sm:text-2xl lg:text-3xl">
              {counts[role] ?? 0}
            </p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">User accounts</h3>
            <p className="text-sm text-muted-foreground">
              {users.length} accounts. Changes take effect everywhere at once.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, username, role"
              className="pl-9"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((u) => {
                const isSelf = u.id === signedIn?.id
                const blocked = blockedFromRemoval(u.id, signedIn?.id)
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium">
                          {u.full_name
                            .split(' ')
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {u.full_name}
                            {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{u.username}</TableCell>
                    <TableCell>
                      {/*
                        Nothing to show: the server keeps a hash, not the
                        password. Forgotten means set a new one, not look it up.
                      */}
                      <span className="font-mono text-sm text-muted-foreground">••••••••</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('whitespace-nowrap', ROLE_STYLE[u.role])}>
                        {ROLE_LABEL[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.module ?? <span className="opacity-50">-</span>}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {owned[u.id] ?? 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} aria-label={`Edit ${u.full_name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setResetting(u)}
                          aria-label={`Reset password for ${u.full_name}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {/* A disabled button takes no hover, so the reason sits on its wrapper. */}
                        <span title={blocked ?? undefined}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirming(u)}
                            disabled={Boolean(blocked)}
                            aria-label={`Remove ${u.full_name}`}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No account matches “{query}”.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />

      <Dialog open={wiping} onOpenChange={(open) => !open && setWiping(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset all demo data?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Uploads, follow-ups, daily entries, receipts, OTIF data, aliases, reminders, settings and
              every account added here go back to what the app ships with.
            </p>
            <p>Your sign-in and theme are kept. The page reloads afterwards.</p>
          </div>
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setWiping(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={wipeDemoData}>
              Reset everything
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <ResetPasswordDialog user={resetting} onClose={() => setResetting(undefined)} />

      <RemoveUserDialog
        user={confirming}
        ownedCount={confirming ? (owned[confirming.id] ?? 0) : 0}
        onClose={() => setConfirming(undefined)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function ResetPasswordDialog({ user, onClose }: { user?: ManagedUser; onClose: () => void }) {
  const [value, setValue] = React.useState('')
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    setValue('')
    setError(undefined)
  }, [user])

  const [saving, setSaving] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await changePassword(user.id, value)
      toast.success(`New password set for ${user.full_name}`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {user?.full_name} will sign in with this from now on. Tell them what it is — there is no
            reset email in this system.
          </p>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(undefined)
              }}
              className="font-mono"
              type="password"
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              autoFocus
            />
            {error && <p className="text-xs text-rose-500">{error}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Setting…' : 'Set password'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RemoveUserDialog({
  user,
  ownedCount,
  onClose,
  onConfirm,
}: {
  user?: ManagedUser
  ownedCount: number
  onClose: () => void
  onConfirm: (user: ManagedUser) => void
}) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {user?.full_name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>They lose access immediately and the account cannot be signed into again.</p>
          {ownedCount > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
              {ownedCount} {ownedCount === 1 ? 'account is' : 'accounts are'} still assigned to them.
              Those keep the follow-up history but will show as unassigned until someone else takes
              them on.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => user && onConfirm(user)}
          >
            Remove account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
