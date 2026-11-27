/**
 * Robi's pop-up in the middle of the screen (27 Nov 2026, the user's request:
 * "a good minimal aesthetic popup notification with Robi").
 *
 * A message from the administrator or the team leader pops up right away, or
 * the next time the person opens the CRM; the first time each day it also
 * brings the payments falling due. "Got it" marks all of it read, and it stays
 * in the bell. Everyone messaged gets it: coordinators, team leaders and the
 * administrator. What goes in it: src/lib/robi-popup.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bell, CalendarClock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthContext'
import { subscribeToDemoStore } from '@/lib/demo-companies'
import { getNotifications, markAllAsRead, NOTIFICATIONS_READ_EVENT, type AppNotification } from '@/lib/notifications'
import { greetingFor, robiPopupContent, type RobiPopupContent } from '@/lib/robi-popup'
import { seesAllAccounts } from '@/lib/users/roles'
import { cn, todayISO } from '@/lib/utils'
import { RobiBuddy } from './RobiBuddy'

const MORNING_KEY = 'crm.robi-popup.morning'
/** Payments listed in the pop-up; the rest wait in the bell. */
const DUE_SHOWN = 4

function morningShownOn(userId: string): string | null {
  try {
    return localStorage.getItem(`${MORNING_KEY}.${userId}`)
  } catch {
    return null
  }
}
function rememberMorning(userId: string, day: string): void {
  try {
    localStorage.setItem(`${MORNING_KEY}.${userId}`, day)
  } catch {
    // Private mode: the morning pop-up may show again; nothing is lost.
  }
}

const senderOf = (n: AppNotification) => n.title.replace(/^Message from\s+/i, '') || 'Your team'
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
const timeOf = (iso: string) => {
  const d = new Date(iso)
  const today = d.toDateString() === new Date().toDateString()
  return today
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function RobiPopup() {
  const { user } = useAuth()
  const [content, setContent] = useState<RobiPopupContent | null>(null)
  const shown = useRef(false)
  const okRef = useRef<HTMLButtonElement>(null)

  const check = useCallback(async () => {
    if (!user || shown.current) return
    const notifications = await getNotifications(user.id, seesAllAccounts(user.role))
    const next = robiPopupContent(notifications, todayISO(), new Date(), morningShownOn(user.id))
    if (next) {
      shown.current = true
      setContent(next)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    // A moment after the CRM opens, so the page is there behind it; then on every server update and once a minute.
    const first = window.setTimeout(() => void check(), 1500)
    const every = window.setInterval(() => void check(), 60_000)
    const unsubscribe = subscribeToDemoStore(() => void check())
    const onRead = () => void check()
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(every)
      unsubscribe()
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead)
    }
  }, [user, check])

  useEffect(() => {
    if (content) window.setTimeout(() => okRef.current?.focus(), 350)
  }, [content])

  const gotIt = async () => {
    if (!user || !content) return
    const ids = [...content.messages, ...content.due].map((n) => n.id)
    if (content.morning) rememberMorning(user.id, todayISO())
    setContent(null)
    shown.current = false
    await markAllAsRead(ids, user.id)
  }

  const firstName = (user?.full_name ?? '').split(/\s+/)[0]
  const now = new Date()
  const title = content?.morning ? `${greetingFor(now)}${firstName ? `, ${firstName}` : ''}` : content?.messages.length === 1 ? 'A message for you' : 'Messages for you'
  const subtitle = content?.morning
    ? now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'From your team, just now'

  return (
    <AnimatePresence>
      {content && (
        <motion.div
          key="robi-popup"
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="robi-popup-title"
          onKeyDown={(e) => e.key === 'Escape' && void gotIt()}
          data-testid="robi-popup"
        >
          <motion.div
            className="relative w-full max-w-[420px] rounded-[28px] bg-background px-6 pb-5 pt-16 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5 dark:ring-white/10"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            {/* Robi sits on the card's top edge. */}
            <div className="absolute -top-14 left-1/2 -translate-x-1/2">
              <RobiBuddy size={104} mood={content.messages.length ? 'talking' : 'happy'} aura />
            </div>

            <div className="text-center">
              <h2 id="robi-popup-title" className="text-xl font-semibold tracking-tight">
                {title}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            </div>

            <div className="mt-5 max-h-[52vh] space-y-3 overflow-y-auto pr-0.5">
              {content.messages.map((m) => {
                const from = senderOf(m)
                return (
                  <div key={m.id} className="rounded-2xl bg-muted/60 p-3.5" data-testid="robi-popup-message">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initialsOf(from)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{from}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeOf(m.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{m.message}</p>
                  </div>
                )
              })}

              {content.due.length > 0 && (
                <div className="rounded-2xl border border-border/70 p-3.5" data-testid="robi-popup-due">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Payments to chase
                  </p>
                  <ul className="mt-2 space-y-2">
                    {content.due.slice(0, DUE_SHOWN).map((n) => (
                      <li key={n.id} className="flex gap-2.5 text-sm leading-snug">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} />
                        <span className="line-clamp-2">{n.message}</span>
                      </li>
                    ))}
                  </ul>
                  {content.due.length > DUE_SHOWN && (
                    <p className="mt-2 text-xs text-muted-foreground">+{content.due.length - DUE_SHOWN} more in your notifications</p>
                  )}
                </div>
              )}
            </div>

            <Button ref={okRef} className="mt-5 h-11 w-full rounded-full text-[15px]" onClick={() => void gotIt()} data-testid="robi-popup-ok">
              Got it
            </Button>
            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Bell className="h-3.5 w-3.5" /> Kept in your notifications
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
