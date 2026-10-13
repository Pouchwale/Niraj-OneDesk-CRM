import React from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TeamModule, UserRole } from '@/lib/types'
import { ASSIGNABLE_ROLES, ROLE_BLURB, ROLE_LABEL, takesTeam } from '@/lib/users/roles'
import {
  createUser,
  editUser,
  validateDraft,
  type ManagedUser,
  type UserDraft,
} from '@/lib/users/store'
import { MIN_PASSWORD_LENGTH } from '@shared/auth'

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The account being edited, or undefined when creating one. */
  user?: ManagedUser
}

const EMPTY: UserDraft = {
  full_name: '',
  username: '',
  email: '',
  password: '',
  role: 'coordinator',
  module: 'GP3',
  desk: null,
}

/** A suggested username and email, so the common case needs no typing. */
function derive(fullName: string) {
  const slug = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (!slug.length) return { username: '', email: '' }
  const username = slug[0]
  return { username, email: `${username}@gp3.com` }
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const editing = Boolean(user)
  const [draft, setDraft] = React.useState<UserDraft>(EMPTY)
  const [errors, setErrors] = React.useState<Partial<Record<keyof UserDraft, string>>>({})
  // Whether the administrator has typed a username of their own; once they
  // have, retyping the name must not overwrite it.
  const [touchedLogin, setTouchedLogin] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setTouchedLogin(Boolean(user))
    setDraft(
      user
        ? {
            full_name: user.full_name,
            username: user.username,
            email: user.email,
            // Passwords are hashed on the server, so there is nothing to show.
            // Left blank, the account keeps the one it has.
            password: '',
            role: user.role,
            module: user.module,
            desk: user.desk ?? null,
          }
        : EMPTY
    )
  }, [open, user])

  const set = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const onNameChange = (value: string) => {
    setDraft((current) => {
      const next = { ...current, full_name: value }
      if (!touchedLogin) {
        const suggested = derive(value)
        next.username = suggested.username
        next.email = suggested.email
      }
      return next
    })
    setErrors((current) => ({ ...current, full_name: undefined, username: undefined, email: undefined }))
  }

  const [saving, setSaving] = React.useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    // On the edit form a blank password means "keep the current one".
    const found = validateDraft(draft, { exceptId: user?.id, requirePassword: !user })
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    setSaving(true)
    try {
      if (user) {
        await editUser(user.id, draft)
        toast.success(`${draft.full_name.trim()} updated`)
      } else {
        await createUser(draft)
        toast.success(`${draft.full_name.trim()} can now sign in as ${draft.username.trim().toLowerCase()}`)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the account')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof UserDraft, label: string, node: React.ReactNode, hint?: string) => (
    <div className="space-y-2">
      <Label htmlFor={`user-${key}`}>{label}</Label>
      {node}
      {errors[key] ? (
        <p className="text-xs text-rose-500">{errors[key]}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )

  const invalid = (key: keyof UserDraft) => (errors[key] ? 'border-rose-500/60' : undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${user?.full_name}` : 'Add a user'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {field(
            'full_name',
            'Full name',
            <Input
              id="user-full_name"
              value={draft.full_name}
              onChange={(e) => onNameChange(e.target.value)}
              className={invalid('full_name')}
              placeholder="Riya Shah"
              autoFocus
            />,
            editing
              ? undefined
              : 'Uploaded sheets are matched against this name, so spell it as the sheets do.'
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              'username',
              'Username',
              <Input
                id="user-username"
                value={draft.username}
                onChange={(e) => {
                  setTouchedLogin(true)
                  set('username', e.target.value)
                }}
                className={invalid('username')}
                placeholder="riya"
              />
            )}
            {field(
              'password',
              editing ? 'New password' : 'Password',
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) => set('password', e.target.value)}
                className={cn('font-mono', invalid('password'))}
                placeholder={editing ? 'Leave blank to keep it' : `At least ${MIN_PASSWORD_LENGTH} characters`}
              />,
              editing ? 'Only filled in if you are changing it.' : undefined
            )}
          </div>

          {field(
            'email',
            'Email',
            <Input
              id="user-email"
              type="email"
              value={draft.email}
              onChange={(e) => {
                setTouchedLogin(true)
                set('email', e.target.value)
              }}
              className={invalid('email')}
              placeholder="riya@gp3.com"
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field(
              'role',
              'Role',
              <Select value={draft.role} onValueChange={(value) => set('role', value as UserRole)}>
                <SelectTrigger id="user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>,
              ROLE_BLURB[draft.role]
            )}

            {takesTeam(draft.role) &&
              field(
                'module',
                'Team',
                <Select
                  value={draft.module ?? ''}
                  onValueChange={(value) => set('module', value as TeamModule)}
                >
                  <SelectTrigger id="user-module" className={invalid('module')}>
                    <SelectValue placeholder="Pick a team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GP3">Team GP3</SelectItem>
                    <SelectItem value="Pouchwale">Team Pouchwale</SelectItem>
                  </SelectContent>
                </Select>
              )}
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
