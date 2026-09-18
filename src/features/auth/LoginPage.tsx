import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, Eye, EyeOff, Loader2, Lock, LogIn, ShieldCheck, User, WifiOff } from 'lucide-react'
import { useAuth } from './AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** The last username that signed in here, so a shared PC is one field to fill. */
const LAST_USER_KEY = 'crm.lastUsername'

/**
 * The way in.
 *
 * There used to be three: a sign-in where the password was only checked if you
 * typed one, a Register tab that made anybody an account, and a Demo Accounts
 * tab that signed you in as the administrator with one click. All three are
 * gone. Accounts are made in the Admin Panel, and the password is checked by
 * the server.
 *
 * What is left has to be quick for people who use it every morning: the
 * username remembered, the cursor already in the right field, Enter to submit,
 * and one plain sentence when something is wrong.
 */
export const LoginPage = () => {
  const { login, offline } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState(() => localStorage.getItem(LAST_USER_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Straight into the empty field: the username is usually already filled.
  useEffect(() => {
    const target = username ? passwordRef.current : usernameRef.current
    target?.focus()
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await login(username, password)
      localStorage.setItem(LAST_USER_KEY, username.trim())
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.')
      setPassword('')
      passwordRef.current?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-aurora transition-colors">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 p-6 lg:flex-row lg:gap-16">
        {/* Who this is, for the half of the screen a form would leave empty. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-md text-center lg:text-left"
        >
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border shadow-lg">
            <img src="/logo.png" alt="" className="h-full w-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            OneDesk CRM
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Receivables, follow-ups and the weekly score — one book for the whole team.
          </p>
          <p className="mt-6 hidden items-center justify-center gap-2 text-sm text-muted-foreground lg:flex lg:justify-start">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Your account decides what you see and what you can change.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="w-full max-w-md"
        >
          <form
            onSubmit={submit}
            className="glass space-y-5 rounded-3xl border border-border p-8 shadow-2xl"
            noValidate
          >
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
              <p className="text-sm text-muted-foreground">Use the account your administrator set up.</p>
            </div>

            {offline && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span className="text-muted-foreground">
                  The server is not answering. It runs on the office machine that holds the CRM — start
                  it, then sign in.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  ref={usernameRef}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9"
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(error)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                  className="pl-9 pr-10"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(error)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLock && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Caps Lock is on.</p>
              )}
            </div>

            {/* Announced, not just coloured: a screen reader has to hear it too. */}
            <div aria-live="polite">
              {error && (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-3 text-sm',
                    'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" /> Sign in
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Forgotten your password? Ask your administrator to set a new one.
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
