import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useMotionValue } from 'motion/react'
import {
  X, Send, Loader2, CheckCircle2, ChevronDown, ChevronUp, Circle, MinusCircle, ListChecks, Users, MessageSquare, ArrowRightLeft, History,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn, todayISO } from '@/lib/utils'
import { demoCompanyStore } from '@/lib/demo-companies'
import { useAuth, getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { sendReminder, sendReminders } from '@/lib/reminders'
import { seesAllAccounts } from '@/lib/users/roles'

import { useAssistant } from './useAssistant'
import { useKnowledge } from './useKnowledge'
import { splitSuggestions } from './ai-prompt'
import { useTeamPlans } from './useTeamPlans'
import { greetedToday, markGreeted } from './assistant-state'
import { composeNudges, type Nudge, type NudgeAction } from './proactive'
import { useFocusedRecord, useScreen } from './screen-context'
import { RobiBuddy, TypingDots, type RobiReaction, type RobotMood } from './RobiBuddy'
import { planProgressLine, type ResolvedPlan, type ResolvedPlanItem } from './daily-plan'
import type { TeamPlan } from './plan-store'
import type { AssistantAction, AssistantMessage, AssistantTask } from './types'

/** What the robot is called on screen. */
export const ROBOT_NAME = 'Robi'

/** How long a remark stays on screen before it tidies itself away. */
const BUBBLE_MS = 14_000
/** Quiet time between two remarks, so the robot never nags. */
const COOLDOWN_MS = 15_000

let messageSeq = 0
function nextId(prefix: string): string {
  messageSeq += 1
  return `${prefix}-${messageSeq}`
}

function assistantSays(text: string, detail?: string, task?: AssistantTask): AssistantMessage {
  return { id: nextId('a'), from: 'assistant', text, detail, task, at: new Date().toISOString() }
}

function coordinatorSays(text: string): AssistantMessage {
  return { id: nextId('c'), from: 'coordinator', text, at: new Date().toISOString() }
}

/** A message to the team, shown before it goes: who gets it, the words, Send / Cancel. */
function DraftCard({
  draft,
  state,
  onSend,
  onCancel,
}: {
  draft: NonNullable<AssistantMessage['draft']>
  state?: AssistantMessage['sendState']
  onSend: (wording: string) => void
  onCancel: () => void
}) {
  const [wording, setWording] = useState(draft.message)
  const to =
    draft.recipients.length === 1
      ? draft.recipients[0].name
      : `${draft.audience} — ${draft.recipients.length} coordinators`
  const settled = state === 'sent' || state === 'cancelled'

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-border bg-background p-2.5 text-foreground" data-testid="robi-draft">
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">To:</span> {to}
        {draft.recipients.length > 1 && (
          <div className="mt-0.5 line-clamp-2">{draft.recipients.map((r) => r.name).join(', ')}</div>
        )}
        {draft.subject && (
          <div className="mt-0.5">
            <span className="font-medium text-foreground">About:</span> {draft.subject}
          </div>
        )}
      </div>
      {settled ? (
        <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-sm">{draft.message}</p>
      ) : (
        <textarea
          value={wording}
          onChange={(e) => setWording(e.target.value)}
          rows={Math.min(6, Math.max(2, Math.ceil(wording.length / 42)))}
          className="w-full resize-none rounded-lg border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Message"
          data-testid="robi-draft-text"
        />
      )}
      {state === 'sent' ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Sent — it is in their notifications.
        </p>
      ) : state === 'cancelled' ? (
        <p className="text-xs text-muted-foreground">Not sent.</p>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 px-3 text-xs" disabled={state === 'sending' || !wording.trim()} onClick={() => onSend(wording)} data-testid="robi-draft-send">
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {state === 'sending' ? 'Sending…' : state === 'failed' ? 'Try again' : 'Send'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" disabled={state === 'sending'} onClick={onCancel}>
            Cancel
          </Button>
          {state === 'failed' && <span className="text-xs text-destructive">Not sent — check the connection.</span>}
        </div>
      )}
    </div>
  )
}

function partOfDay(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

/** Where a record lives, so "open" lands on it with its panel open. */
function recordPath(item: { entityType?: string; entityId?: string }): string | null {
  if (!item.entityType || !item.entityId) return null
  return item.entityType === 'overdue_payment'
    ? `/overdue?payment=${item.entityId}`
    : `/companies?company=${item.entityId}`
}

/* ===== What has already been said ===== */

function saidKey(userId: string): string {
  return `crm.assistant.said.${userId}`
}

interface SaidLog {
  /** Remarks made this session, by key. */
  session: string[]
  /** Remarks made once a day, by key, with the day they were made. */
  daily: Record<string, string>
}

function readSaid(userId: string): SaidLog {
  try {
    const session = JSON.parse(sessionStorage.getItem(saidKey(userId)) ?? '[]') as string[]
    const daily = JSON.parse(localStorage.getItem(saidKey(userId)) ?? '{}') as Record<string, string>
    return { session: Array.isArray(session) ? session : [], daily: daily && typeof daily === 'object' ? daily : {} }
  } catch {
    return { session: [], daily: {} }
  }
}

function wasSaid(userId: string, nudge: Nudge, today: string): boolean {
  const log = readSaid(userId)
  if (nudge.daily) return log.daily[nudge.key] === today
  return log.session.includes(nudge.key)
}

function noteSaid(userId: string, nudge: Nudge, today: string): void {
  const log = readSaid(userId)
  try {
    if (nudge.daily) {
      // Keep only today's marks; yesterday's are irrelevant.
      const daily = Object.fromEntries(Object.entries(log.daily).filter(([, day]) => day === today))
      daily[nudge.key] = today
      localStorage.setItem(saidKey(userId), JSON.stringify(daily))
    } else {
      sessionStorage.setItem(saidKey(userId), JSON.stringify([...log.session, nudge.key].slice(-200)))
    }
  } catch {
    // No storage: the robot may repeat itself; nothing else breaks.
  }
}

/**
 * Robi, the follow-up robot.
 *
 * Rule-driven rather than model-driven: every prompt comes from the
 * coordinator's own records (see rules.ts). It is read-only by design - it
 * never logs a follow-up, marks a payment or attaches proof. It points at the
 * record; the person logs what happened on that record's own timeline, and
 * the robot's plan and nudges update from that.
 *
 * It lives on every screen. It knows which one is open and which account is
 * open on it (screen-context.ts), keeps a plan of the day's follow-ups
 * (daily-plan.ts), and speaks up - in a bubble, once - when there is something
 * worth saying about what is in front of the person (proactive.ts).
 */
export function AssistantWidget() {
  const { user, isCoordinator } = useAuth()
  const navigate = useNavigate()
  const isLeader = seesAllAccounts(user?.role)

  const {
    tasks, allTasks, plan, companies, overduePayments, followups,
    isLoading, answer, skipItem, unskipItem,
  } = useAssistant(user?.id, { withPlan: isCoordinator })
  const team = useTeamPlans(isLeader)
  const screen = useScreen()
  const focused = useFocusedRecord()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [activeTask, setActiveTask] = useState<AssistantTask | null>(null)
  const [question, setQuestion] = useState('')
  const [planOpen, setPlanOpen] = useState(true)
  const [nudge, setNudge] = useState<Nudge | null>(null)
  /** The launcher is hovered: Robi smiles. */
  const [launcherHover, setLauncherHover] = useState(false)
  /** Robi hops once when it has something new to say. */
  const [hop, setHop] = useState(false)
  useEffect(() => {
    if (!nudge) return
    setHop(true)
    const id = window.setTimeout(() => setHop(false), 950)
    return () => window.clearTimeout(id)
  }, [nudge?.key])

  /* ----- Robi's reactions, chip, and the box it is typed into ----- */
  const [reaction, setReaction] = useState<RobiReaction | null>(null)
  const react = useCallback((kind: RobiReaction['kind']) => setReaction({ id: Date.now() + Math.random(), kind }), [])
  const [chip, setChip] = useState<string | null>(null)
  const chipTimer = useRef(0)
  const sayFor = useCallback((text: string, ms = 2200) => {
    setChip(text)
    window.clearTimeout(chipTimer.current)
    chipTimer.current = window.setTimeout(() => setChip(null), ms)
  }, [])
  const [inputFocused, setInputFocused] = useState(false)
  const firstName = user?.full_name.split(' ')[0] ?? ''

  // A task done: a jump and sparkles. The whole day done: confetti, once a day.
  const prevDone = useRef<number | null>(null)
  useEffect(() => {
    if (!plan || !isCoordinator || !user) {
      prevDone.current = null
      return
    }
    const prev = prevDone.current
    prevDone.current = plan.done
    if (prev === null || plan.done <= prev) return
    if (plan.complete) {
      const key = `robi.party.${user.id}`
      const today = todayISO()
      let partied = false
      try {
        partied = localStorage.getItem(key) === today
        localStorage.setItem(key, today)
      } catch {
        /* storage off: party anyway */
      }
      if (!partied) {
        react('party')
        sayFor('All done! 🎉', 3500)
        return
      }
    }
    react('celebrate')
    sayFor(['Nice!', 'One down!', 'Yes!', 'Great call!', 'Keep going!'][Math.floor(Math.random() * 5)])
  }, [plan?.done, plan?.complete, isCoordinator, user, react, sayFor])

  /* ----- where Robi sits: dragged anywhere, remembered per person ----- */
  const launcherRef = useRef<HTMLButtonElement>(null)
  const posX = useMotionValue(0)
  const posY = useMotionValue(0)
  const [dragging, setDragging] = useState(false)
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const LAUNCHER = 96
  const EDGE = { right: 20, bottom: 16 }
  const posKey = user ? `robi.pos.${user.id}` : null
  const clampPos = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(-(viewport.w - EDGE.right - LAUNCHER - 8), x)),
      y: Math.min(0, Math.max(-(viewport.h - EDGE.bottom - LAUNCHER - 8), y)),
    }),
    [viewport.w, viewport.h]
  )
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    if (!posKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(posKey) ?? 'null') as { x: number; y: number } | null
      const at = clampPos(saved?.x ?? 0, saved?.y ?? 0)
      posX.set(at.x)
      posY.set(at.y)
    } catch {
      posX.set(0)
      posY.set(0)
    }
  }, [posKey, clampPos, posX, posY])
  const savePos = (x: number, y: number) => {
    if (!posKey) return
    try {
      localStorage.setItem(posKey, JSON.stringify({ x, y }))
    } catch {
      /* storage off */
    }
  }
  // Tap opens; a real drag moves. A twitch of a few pixels is still a tap.
  const tappedAt = useRef(0)
  const dragEndAt = useRef(0)
  const toggleOpen = () => setOpen((v) => !v)

  /* ----- the panel and the bubble sit next to wherever Robi is ----- */
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const measure = useCallback(() => {
    const rect = launcherRef.current?.getBoundingClientRect() ?? null
    setAnchor(rect)
  }, [])
  useLayoutEffect(() => {
    measure()
  }, [open, nudge?.key, viewport.w, viewport.h, dragging, measure])
  /** Ticks once a minute so time-of-day remarks can fire while the app sits open. */
  const [clock, setClock] = useState(() => Date.now())

  const handledRef = useRef<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const startedRef = useRef(false)
  const lastSpokeRef = useRef(0)

  /*
   * What the badge counts is what the panel lists. With a plan, that is the
   * plan's tasks still open today; counting every raw reminder (invoices not
   * yet due, customers resting or waiting for a date) put "9+" on the button
   * over a panel holding three tasks.
   */
  const pending = plan && plan.total > 0 ? plan.open : tasks.length
  const { ask, isThinking, aiReady, aiKeyError } = useKnowledge(tasks)

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  /*
   * Clicking away closes the panel, the way any popover does — and Escape with
   * it, since a panel you can dismiss with the mouse but not the keyboard is
   * only half dismissible.
   *
   * Anything the robot put on the screen is not "away": the panel, the
   * proactive bubble and the launcher all carry `data-robi`, so the launcher
   * keeps toggling rather than closing and reopening in the same gesture.
   * Toasts are the one other exception — dismissing a notification is not a
   * decision to stop talking to the robot.
   *
   * `pointerdown` rather than `click`: it fires before focus moves, so the
   * panel is already going when the new thing takes over, instead of lingering
   * for a frame over whatever was clicked.
   */
  useEffect(() => {
    if (!open) return

    const away = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest) return
      if (target.closest('[data-robi]') || target.closest('[data-sonner-toast]')) return
      setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  /** Planned work first, then the rest of the queue by priority. */
  const orderedTasks = useMemo(() => {
    if (!plan) return tasks
    const rank = new Map(
      plan.items.filter((item) => item.status === 'open').map((item, index) => [item.taskId, index])
    )
    return [...tasks].sort(
      (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.priority - b.priority
    )
  }, [tasks, plan])

  /* ===== Speaking up ===== */

  const today = todayISO()

  useEffect(() => {
    if (!user || open || isLoading || (isLeader && team.isLoading)) return
    const now = new Date(clock)
    const candidates = composeNudges({
      role: user.role,
      userId: user.id,
      firstName: user.full_name.split(' ')[0] || user.full_name,
      today,
      minutesNow: now.getHours() * 60 + now.getMinutes(),
      screen,
      focused,
      tasks,
      plan,
      followups: isLeader ? team.followups : followups,
      companies: isLeader ? team.companies : companies,
      overduePayments: isLeader ? team.overduePayments : overduePayments,
      team: isLeader ? team.team : undefined,
      brokenPromises: isLeader ? team.brokenPromises : undefined,
      desk: isLeader ? team.desk : undefined,
      coordinatorName: (id) => (id ? getCoordinatorDisplayName(id) : 'Unassigned'),
    })
    // The first thing not said yet: Robi moves down the list rather than
    // waiting for the top line to change.
    const candidate = candidates.find((c) => !wasSaid(user.id, c, today))
    if (!candidate) return

    // One remark, then a pause before the next.
    if (Date.now() - lastSpokeRef.current < COOLDOWN_MS) return

    noteSaid(user.id, candidate, today)
    lastSpokeRef.current = Date.now()
    setNudge(candidate)
  }, [
    user, open, isLoading, isLeader, team.isLoading, team.followups, team.companies,
    team.overduePayments, team.team, team.brokenPromises, team.desk, clock, today, screen, focused,
    tasks, plan, followups, companies, overduePayments,
  ])

  useEffect(() => {
    if (!nudge) return
    const id = window.setTimeout(() => setNudge(null), BUBBLE_MS)
    return () => window.clearTimeout(id)
  }, [nudge])

  useEffect(() => {
    if (open) setNudge(null)
  }, [open])
  // Opening an account's follow-up panel clears any bubble already showing, so
  // nothing sits over the panel while the person works on it.
  useEffect(() => {
    if (focused) setNudge(null)
  }, [focused])

  /* ===== The conversation ===== */

  const greeting = useCallback((): AssistantMessage => {
    if (!user) return assistantSays('Hello.')
    const firstName = user.full_name.split(' ')[0]
    const back = greetedToday(user.id)
    const hello = back ? `Back again, ${firstName}.` : `${partOfDay()}, ${firstName}.`

    if (isCoordinator) {
      const away = demoCompanyStore.getAttendance(user.id, todayISO())?.status
      if (away === 'leave') {
        return assistantSays(`${hello} You're marked on leave today, so there's no plan.`, 'Anything still open comes back on your next working day.')
      }
      if (plan && plan.total > 0) {
        return assistantSays(
          `${hello} Today's plan${away === 'half_day' ? ' (half day)' : ''}: ${planProgressLine(plan)}.`,
          plan.complete
            ? 'Everything planned for today is dealt with. I am still watching the rest of your accounts.'
            : plan.round > 0
              ? `Your Active Payments tasks are done — I have added ${
                  plan.items.filter((i) => (i.round ?? 0) === plan.round).length
                } overdue accounts to follow up. They are in the plan above.`
              : pending > 0
              ? `${pending} item${pending === 1 ? '' : 's'} need your attention in all. I will point you at each record; log what happened there.`
              : undefined
        )
      }
      return assistantSays(
        `${hello} Nothing is planned for today — every account is current.`,
        'Ask me about any customer, invoice or colleague and I will read the live records.'
      )
    }

    if (isLeader) {
      const withPlans = team.team.filter((t) => t.plan.total > 0)
      const done = withPlans.reduce((sum, t) => sum + t.plan.done, 0)
      const total = withPlans.reduce((sum, t) => sum + t.plan.total, 0)
      return assistantSays(
        total > 0
          ? `${hello} The team has ${done} of ${total} planned follow-ups done today.`
          : `${hello} Nothing is planned for the team today.`,
        'Ask me about any customer, invoice or colleague — or say "tell the team ..." and I will put it in their notifications.'
      )
    }

    return assistantSays(
      hello,
      'Ask me about any customer, invoice or colleague and I will read the live records.'
    )
  }, [user, isCoordinator, isLeader, plan, pending, team.team])

  const presentNext = useCallback(
    (queue: AssistantTask[], skipId?: string) => {
      if (skipId) handledRef.current.add(skipId)

      const next = queue.find((t) => t.id !== skipId && !handledRef.current.has(t.id))
      if (!next) {
        setActiveTask(null)
        setMessages((m) => [
          ...m,
          assistantSays(
            'That is everything for now — nothing else needs chasing today.',
            'I will keep watching your accounts and nudge you when something moves.'
          ),
        ])
        return
      }

      setActiveTask(next)
      setMessages((m) => [...m, assistantSays(next.message, next.detail, next)])
    },
    []
  )

  // Open the conversation with a greeting the first time it is used each day.
  useEffect(() => {
    if (!open || isLoading || startedRef.current || !user) return
    startedRef.current = true
    setMessages([greeting()])
    markGreeted(user.id)
    if (isCoordinator) presentNext(orderedTasks)
  }, [open, isLoading, user, greeting, orderedTasks, presentNext, isCoordinator])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, activeTask])

  /**
   * Starts a message to a coordinator, or to all of them.
   *
   * It writes the opening of the sentence the leader would have typed and
   * leaves the cursor after it, so the panel and the chat go down exactly the
   * same path — and the leader learns the phrasing for next time.
   */
  const startMessage = useCallback((who: string) => {
    setPlanOpen(true)
    setQuestion(`Tell ${who} `)
    window.setTimeout(() => {
      inputRef.current?.focus()
      const end = inputRef.current?.value.length ?? 0
      inputRef.current?.setSelectionRange(end, end)
    }, 0)
  }, [])

  /** Lands on the record with its panel open; the logging happens there. */
  const openRecord = useCallback(
    (item: { entityType?: string; entityId?: string }) => {
      const path = recordPath(item)
      if (!path) return
      setOpen(false)
      navigate(path)
    },
    [navigate]
  )

  const runNudgeAction = async (action: NudgeAction) => {
    setNudge(null)
    switch (action.kind) {
      case 'snooze_task': {
        const task = tasks.find((t) => t.id === action.taskId) ?? allTasks.find((t) => t.id === action.taskId)
        if (task) answer(task, 'snooze')
        return
      }
      case 'open_plan':
        setPlanOpen(true)
        setOpen(true)
        return
      case 'open':
        setOpen(true)
        return
      case 'navigate':
        navigate(action.to)
        return
      case 'remind':
        if (!user) return
        try {
          await sendReminder({
            fromUserId: user.id,
            fromName: user.full_name,
            toCoordinatorId: action.toCoordinatorId,
            subject: action.subject,
            message: `${user.full_name} asked you to follow up${action.subject ? ` on ${action.subject}` : ''}.`,
          })
          toast.success(`Reminder sent to ${action.toName}.`)
        } catch {
          toast.error(`Could not send the reminder to ${action.toName}.`)
        }
    }
  }

  /**
   * Answers a typed question without disturbing the nudge in progress: the
   * conversation carries both, and the active task stays put underneath.
   */
  const handleAsk = async (typed?: string) => {
    const asked = (typed ?? question).trim()
    if (!asked || isThinking) return
    // A conversation needs the room: fold the plan away (one tap brings it back).
    setPlanOpen(false)

    // Earlier turns go with the question so Robi can follow "and why?".
    const history = messages
      .filter((m) => m.text.trim())
      .map((m) => ({
        role: m.from === 'coordinator' ? ('user' as const) : ('assistant' as const),
        text: splitSuggestions(m.text).text,
      }))

    if (typed === undefined) setQuestion('')
    setMessages((m) => [...m, coordinatorSays(asked)])

    // Robi's words land as they are written: one message grows in place.
    const draftId = nextId('a')
    const appendDelta = (delta: string) =>
      setMessages((m) => {
        const index = m.findIndex((x) => x.id === draftId)
        if (index === -1) {
          return [...m, { id: draftId, from: 'assistant' as const, text: delta, at: new Date().toISOString() }]
        }
        const copy = [...m]
        copy[index] = { ...copy[index], text: copy[index].text + delta }
        return copy
      })

    const reply = await ask(asked, history, appendDelta)

    // A message to the team is never sent from here: it comes back as a draft
    // with Send and Cancel, and only Send puts it in anybody's notifications.
    const draft =
      reply.action?.kind === 'remind'
        ? {
            recipients: reply.action.recipients,
            audience: reply.action.audience,
            subject: reply.action.subject,
            message: reply.action.message,
            link: reply.action.link,
          }
        : undefined

    // A rule answer carries its facts underneath; the AI's answer already
    // has them in the text. If the AI was asked and failed, say so.
    const facts = reply.ai || draft ? undefined : reply.facts?.map((f) => `${f.label}: ${f.value}`).join('\n')
    const detail = reply.aiError ? `Answered from the rules — the AI did not reply: ${reply.aiError}` : facts
    const { text, suggestions } = splitSuggestions(reply.text)
    const offered = [...suggestions, ...(reply.followUps ?? [])]
      .filter((s, i, all) => s.trim() && all.findIndex((t) => t.toLowerCase() === s.toLowerCase()) === i)
      .slice(0, 3)

    setMessages((m) => {
      const index = m.findIndex((x) => x.id === draftId)
      const final: AssistantMessage = {
        id: draftId,
        from: 'assistant',
        text,
        detail,
        at: new Date().toISOString(),
        suggestions: draft ? undefined : offered,
        draft,
      }
      if (index === -1) return [...m, final]
      const copy = [...m]
      copy[index] = final
      return copy
    })
  }

  /** Sends a drafted message to the team, with whatever wording the sender settled on. */
  const sendDraft = async (messageId: string, wording: string) => {
    const target = messages.find((m) => m.id === messageId)
    const draft = target?.draft
    if (!draft || !user || !wording.trim()) return
    const mark = (patch: Partial<AssistantMessage>) =>
      setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, ...patch } : x)))

    mark({ sendState: 'sending' })
    try {
      await sendReminders({
        fromUserId: user.id,
        fromName: user.full_name,
        to: draft.recipients,
        subject: draft.subject,
        message: wording.trim(),
        link: draft.link,
        audience: draft.audience,
      })
      mark({ sendState: 'sent', draft: { ...draft, message: wording.trim() } })
      toast.success(
        draft.recipients.length === 1
          ? `Message sent to ${draft.recipients[0].name}.`
          : `Message sent to ${draft.recipients.length} coordinators.`
      )
    } catch (err) {
      mark({ sendState: 'failed' })
      toast.error('Message not sent.', { description: err instanceof Error ? err.message : 'Try again in a moment.' })
    }
  }

  /**
   * The coordinator's answer to a nudge. Nothing here logs anything: "open"
   * takes them to the record to log it themselves, "later" parks the nudge.
   */
  const handleAction = (task: AssistantTask, action: AssistantAction) => {
    setMessages((m) => [...m, coordinatorSays(action.label)])
    setActiveTask(null)

    if (action.intent === 'open') {
      answer(task, 'open')
      // The nudge stays live until the record changes; the conversation moves on.
      handledRef.current.add(task.id)
      openRecord(task)
      return
    }

    answer(task, action.intent)
    setMessages((m) => [
      ...m,
      assistantSays(
        action.intent === 'snooze'
          ? `Noted — I will bring ${task.entityName ?? 'it'} back tomorrow.`
          : 'Noted.'
      ),
    ])
    presentNext(orderedTasks, task.id)
  }

  if (!user) return null

  const onLeave = isCoordinator && demoCompanyStore.getAttendance(user.id, todayISO())?.status === 'leave'
  const listening = open && (inputFocused || question.trim().length > 0)
  const mood: RobotMood = isThinking
    ? 'thinking'
    : listening
      ? 'listening'
    : nudge
      ? nudge.tone === 'warn'
        ? 'alert'
        : nudge.tone === 'success'
          ? 'happy'
          : 'talking'
      : plan?.complete
        ? 'happy'
        : onLeave
          ? 'sleepy'
          : 'idle'

  const statusLine = isLoading
    ? 'Checking your accounts...'
    : focused
      ? `Looking at ${focused.name}`
      : isCoordinator
        ? plan && plan.total > 0
          ? `Today's plan: ${planProgressLine(plan)}`
          : pending > 0
            ? `${pending} item${pending === 1 ? '' : 's'} pending`
            : 'Ask me anything'
        : isLeader
          ? team.team.length > 0
            ? `Watching ${team.team.length} coordinators`
            : 'Ask me anything'
          : 'Ask me anything'

  const toneRing =
    nudge?.tone === 'warn' ? 'ring-amber-400/60' : nudge?.tone === 'success' ? 'ring-emerald-400/60' : 'ring-border'

  /*
   * Where the panel and the bubble go: beside Robi, on whichever side has
   * the room. Above it when Robi sits low, below when high; aligned to the
   * right edge when Robi is on the right half of the screen, else the left.
   */
  const GAP = 12
  const rect = anchor ?? new DOMRect(viewport.w - EDGE.right - LAUNCHER, viewport.h - EDGE.bottom - LAUNCHER, LAUNCHER, LAUNCHER)
  const openUp = rect.top + rect.height / 2 > viewport.h / 2
  const alignRight = rect.left + rect.width / 2 > viewport.w / 2
  const clampX = (left: number, w: number) => Math.min(Math.max(8, left), Math.max(8, viewport.w - w - 8))
  const panelW = Math.min(420, viewport.w - 16)
  const roomAbove = rect.top - GAP - 8
  const roomBelow = viewport.h - rect.bottom - GAP - 8
  const vertical = (openUp ? roomAbove : roomBelow) >= 380
  const panelH = Math.min(660, vertical ? (openUp ? roomAbove : roomBelow) : viewport.h - 16)
  const panelStyle: React.CSSProperties = vertical
    ? {
        left: clampX(alignRight ? rect.right - panelW : rect.left, panelW),
        top: openUp ? rect.top - GAP - panelH : rect.bottom + GAP,
        width: panelW,
        height: panelH,
        transformOrigin: `${alignRight ? 'right' : 'left'} ${openUp ? 'bottom' : 'top'}`,
      }
    : {
        // No room above or below: beside Robi instead.
        left: clampX(alignRight ? rect.left - GAP - panelW : rect.right + GAP, panelW),
        top: Math.min(Math.max(8, rect.bottom - panelH), viewport.h - panelH - 8),
        width: panelW,
        height: panelH,
        transformOrigin: `${alignRight ? 'right' : 'left'} bottom`,
      }
  const bubbleW = Math.min(340, viewport.w - 16)
  const bubbleStyle: React.CSSProperties = {
    left: clampX(alignRight ? rect.right - bubbleW : rect.left, bubbleW),
    width: bubbleW,
    ...(openUp ? { bottom: viewport.h - rect.top + GAP } : { top: rect.bottom + GAP }),
    transformOrigin: `${alignRight ? 'right' : 'left'} ${openUp ? 'bottom' : 'top'}`,
  }
  const bubbleTail = cn(
    'absolute h-3 w-3 rotate-45 bg-background',
    openUp ? '-bottom-1.5' : '-top-1.5',
    alignRight ? 'right-9' : 'left-9'
  )

  return (
    <>
      {/* ===== A remark about what is on screen: a speech bubble from Robi ===== */}
      <AnimatePresence>
        {!open && nudge && (
          <motion.div
            key={nudge.key}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            style={bubbleStyle}
            // Above an open account panel and clickable through its overlay:
            // the remark is usually about the record that panel shows.
            className="pointer-events-auto fixed z-[60]"
            role="status"
            aria-live="polite"
            data-testid="robi-bubble"
            data-robi=""
          >
            <div className={cn('relative rounded-3xl bg-background p-4 shadow-2xl ring-1', openUp ? (alignRight ? 'rounded-br-md' : 'rounded-bl-md') : alignRight ? 'rounded-tr-md' : 'rounded-tl-md', toneRing)}>
              <div className={bubbleTail} aria-hidden="true" />
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{ROBOT_NAME}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-foreground">{nudge.text}</p>
                  {nudge.detail && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{nudge.detail}</p>
                  )}
                  {nudge.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nudge.actions.map((action, index) => (
                        <Button
                          key={`${action.kind}-${index}`}
                          size="sm"
                          variant={index === 0 && action.kind !== 'snooze_task' ? 'default' : 'outline'}
                          className="h-8 rounded-full px-3.5"
                          onClick={() => runNudgeAction(action)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setNudge(null)}
                  aria-label="Dismiss"
                  className="-mr-1.5 -mt-1.5 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== The panel ===== */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            style={panelStyle}
            className="pointer-events-auto fixed z-[60] flex flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-2xl"
            role="dialog"
            aria-label="Follow-up assistant"
            data-robi=""
          >
            {/* Robi's screen: the face, the name, what it is doing. */}
            <div className="robi-header relative flex items-center gap-3 px-4 pb-3 pt-3.5">
              <button
                type="button"
                className="-my-1 -ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Boop Robi"
                title="Boop!"
                onClick={() => {
                  react('boop')
                  sayFor(['Boop!', 'Hehe', `Hi ${firstName}!`, '♥', 'Tickles!'][Math.floor(Math.random() * 5)], 1600)
                }}
              >
                <RobiBuddy mood={mood} size={84} interactive reaction={reaction} say={chip} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold leading-none tracking-tight">{ROBOT_NAME}</span>
                  {aiReady && !aiKeyError && (
                    <span
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
                      title="Replies are written by the AI from the live records"
                    >
                      AI on
                    </span>
                  )}
                  {aiReady && aiKeyError && (
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-600" title={aiKeyError}>
                      AI off
                    </span>
                  )}
                </div>
                <div className="mt-1.5 truncate text-xs text-muted-foreground" data-testid="robi-status">
                  {statusLine}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isCoordinator && plan && plan.total > 0 && (
              <PlanSection
                plan={plan}
                expanded={planOpen}
                onToggle={() => setPlanOpen((v) => !v)}
                onOpen={openRecord}
                onSkip={skipItem}
                onUnskip={unskipItem}
              />
            )}
            {isLeader && team.team.length > 0 && (
              <TeamSection
                team={team.team}
                expanded={planOpen}
                onToggle={() => setPlanOpen((v) => !v)}
                onMessage={startMessage}
                onHistory={() => {
                  setOpen(false)
                  navigate('/admin/overview?tab=robi')
                }}
              />
            )}

            <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto bg-muted/20 px-4 py-4" aria-live="polite">
              {messages.map((message, index) => {
                const mine = message.from === 'coordinator'
                // Robi's face beside the last of its replies in a row, where the eye lands.
                const showFace = !mine && messages[index + 1]?.from !== 'assistant'
                return (
                  <div key={message.id} className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                    {!mine && (
                      <div className="w-10 shrink-0">{showFace && <RobiBuddy mood="idle" size={40} />}</div>
                    )}
                    <div
                      className={cn(
                        'max-w-[82%] rounded-3xl px-4 py-2.5 text-sm shadow-sm',
                        mine
                          ? 'rounded-br-md bg-primary text-primary-foreground'
                          : 'rounded-bl-md bg-background text-foreground ring-1 ring-border/70'
                      )}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {message.from === 'assistant' ? splitSuggestions(message.text).text : message.text}
                      </p>
                      {message.detail && (
                        <p className="mt-1.5 text-xs leading-relaxed opacity-75">{message.detail}</p>
                      )}
                      {message.draft && (
                        <DraftCard
                          draft={message.draft}
                          state={message.sendState}
                          onSend={(wording) => void sendDraft(message.id, wording)}
                          onCancel={() =>
                            setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, sendState: 'cancelled' } : x)))
                          }
                        />
                      )}
                      {message.suggestions && message.suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="robi-suggestions">
                          {message.suggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              disabled={isThinking}
                              onClick={() => void handleAsk(suggestion)}
                              className="rounded-full bg-primary/10 px-3 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {isThinking && (
                <div className="flex items-end gap-2">
                  <div className="w-10 shrink-0">
                    <RobiBuddy mood="thinking" size={40} />
                  </div>
                  <div className="rounded-3xl rounded-bl-md bg-background px-4 py-3.5 shadow-sm ring-1 ring-border/70">
                    <TypingDots />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border/70 bg-background p-3">
              {activeTask && (
                <div className="flex flex-wrap gap-2">
                  {activeTask.actions.map((action) => (
                    <Button
                      key={action.intent}
                      size="sm"
                      className="rounded-full"
                      variant={action.tone === 'primary' ? 'default' : 'outline'}
                      onClick={() => handleAction(activeTask, action)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Always available: the robot answers questions as well as
                  pointing at work. */}
              <form
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 p-1 pl-4 transition-colors focus-within:border-primary/60 focus-within:bg-background"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleAsk()
                }}
              >
                <Input
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="Ask Robi about a customer, an invoice…"
                  aria-label="Ask Robi"
                  className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  disabled={isThinking}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  disabled={isThinking || !question.trim()}
                  aria-label="Ask the assistant"
                >
                  {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Robi itself ===== */}
      <motion.button
        ref={launcherRef}
        onTap={() => {
          if (Date.now() - dragEndAt.current < 250) return
          tappedAt.current = Date.now()
          toggleOpen()
        }}
        onHoverStart={() => setLauncherHover(true)}
        onHoverEnd={() => setLauncherHover(false)}
        drag
        dragMomentum={false}
        dragElastic={0.12}
        dragConstraints={{
          left: -(viewport.w - EDGE.right - LAUNCHER - 8),
          right: 0,
          top: -(viewport.h - EDGE.bottom - LAUNCHER - 8),
          bottom: 0,
        }}
        onDragStart={() => setDragging(true)}
        onDragEnd={(_e, info) => {
          setDragging(false)
          dragEndAt.current = Date.now()
          const moved = Math.hypot(info.offset.x, info.offset.y)
          const at = clampPos(posX.get(), posY.get())
          posX.set(at.x)
          posY.set(at.y)
          if (moved < 8) {
            if (Date.now() - tappedAt.current > 250) toggleOpen()
            return
          }
          savePos(at.x, at.y)
          react('boop')
          sayFor(['Here is good!', 'Comfy.', 'New spot!'][Math.floor(Math.random() * 3)], 1500)
        }}
        whileHover={{ scale: 1.05, rotate: -3 }}
        whileTap={{ scale: 0.92, rotate: 0 }}
        whileDrag={{ scale: 1.1, rotate: 6, cursor: 'grabbing' }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        style={{ x: posX, y: posY, right: EDGE.right, bottom: EDGE.bottom, width: LAUNCHER, height: LAUNCHER, touchAction: 'none' }}
        aria-label={open ? 'Hide follow-up assistant' : 'Open follow-up assistant'}
        title={open ? `Hide ${ROBOT_NAME}` : `Talk to ${ROBOT_NAME} · drag me anywhere`}
        className={cn(
          'pointer-events-auto fixed z-[60] flex cursor-grab items-center justify-center rounded-full',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          hop && !open && 'robi-hop'
        )}
        data-robi=""
      >
        {open ? (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-border">
            <ChevronDown className="h-6 w-6" />
          </span>
        ) : (
          <RobiBuddy
            mood={mood}
            size={LAUNCHER}
            interactive
            aura
            hovered={launcherHover}
            dragging={dragging}
            reaction={reaction}
            say={chip ?? (launcherHover && !dragging ? `Hi ${firstName}!` : null)}
            className="robi-launcher-buddy"
          />
        )}

        {!open && pending > 0 && (
          <Badge
            className="absolute right-2 top-2 h-6 min-w-6 justify-center rounded-full border-2 border-background bg-rose-500 px-1.5 text-xs text-white hover:bg-rose-500"
            aria-label={`${pending} follow-ups pending`}
          >
            {pending > 9 ? '9+' : pending}
          </Badge>
        )}
      </motion.button>
    </>
  )
}

/* ===== Today's plan ===== */

interface PlanSectionProps {
  plan: ResolvedPlan
  expanded: boolean
  onToggle: () => void
  onOpen: (item: ResolvedPlanItem) => void
  onSkip: (taskId: string) => void
  onUnskip: (taskId: string) => void
}

/** A small ring that fills as the day's tasks are done. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  const share = total > 0 ? done / total : 0
  const complete = total > 0 && done === total
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - share)}
        className={cn('transition-[stroke-dashoffset] duration-500', complete ? 'stroke-emerald-500' : 'stroke-primary')}
      />
    </svg>
  )
}

function PlanSection({ plan, expanded, onToggle, onOpen, onSkip, onUnskip }: PlanSectionProps) {
  const complete = plan.done === plan.total
  return (
    <div className="border-b border-border/70 bg-background" data-testid="robi-plan">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expanded}
      >
        <div className="relative">
          <ProgressRing done={plan.done} total={plan.total} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums">
            {plan.total > 0 ? Math.round((plan.done / plan.total) * 100) : 0}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Today's plan</p>
          <p
            className={cn(
              'text-xs tabular-nums',
              // Green for work actually done, not for a list that emptied itself.
              complete ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
            )}
          >
            {plan.done}/{plan.total} done{complete ? ' · all done' : ` · ${plan.open} to go`}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto px-3 pb-3">
          {/* Work still to do first, so a new task is not buried under finished ones. */}
          {[...plan.items]
            .sort((a, b) => Number(a.status !== 'open' && a.status !== 'skipped') - Number(b.status !== 'open' && b.status !== 'skipped'))
            .map((item) => (
            <PlanRow
              key={item.taskId}
              item={item}
              onOpen={() => onOpen(item)}
              onSkip={() => onSkip(item.taskId)}
              onUnskip={() => onUnskip(item.taskId)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function PlanRow({
  item,
  onOpen,
  onSkip,
  onUnskip,
}: {
  item: ResolvedPlanItem
  onOpen: () => void
  onSkip: () => void
  onUnskip: () => void
}) {
  /*
   * A moved account gets its own mark, never the tick. It was not done; it
   * belongs to another coordinator now, and showing it as finished work is
   * the whole fault this status exists to prevent.
   */
  const Icon =
    item.status === 'done'
      ? CheckCircle2
      : item.status === 'moved'
        ? ArrowRightLeft
        : item.status === 'closed' || item.status === 'skipped'
          ? MinusCircle
          : Circle
  return (
    <li
      className={cn(
        'flex items-start gap-2.5 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60',
        item.status !== 'open' && item.status !== 'skipped' && 'opacity-60'
      )}
      data-status={item.status}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          item.status === 'done'
            ? 'text-emerald-600 dark:text-emerald-400'
            : item.status === 'skipped'
              ? 'text-muted-foreground'
              : 'text-primary'
        )}
      />
      <div className="min-w-0 flex-1">
        {/* Struck through only for work that was actually done. */}
        <p className={cn('truncate text-sm font-medium', item.status === 'done' && 'line-through')}>
          {item.entityName ?? 'Account'}
          {/* From Overdue Payments: four a day, and any extra rounds after them. */}
          {item.entityType === 'overdue_payment' && (
            <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 py-px align-middle text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">
              Overdue
            </span>
          )}
        </p>
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{item.message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.status === 'open' && (
          <>
            <Button size="sm" className="h-7 rounded-full px-3 text-xs" onClick={onOpen}>
              Open
            </Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-xs" onClick={onSkip}>
              Later
            </Button>
          </>
        )}
        {item.status === 'skipped' && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onUnskip}>
            Undo
          </Button>
        )}
        {item.status === 'done' && <span className="text-xs text-muted-foreground">Done</span>}
        {item.status === 'moved' && (
          <span className="text-xs text-muted-foreground">Reassigned</span>
        )}
        {item.status === 'closed' && (
          <span className="text-xs text-muted-foreground">No longer due</span>
        )}
      </div>
    </li>
  )
}

/* ===== The team's day (leaders) ===== */

function TeamSection({
  team,
  expanded,
  onToggle,
  onMessage,
  onHistory,
}: {
  team: TeamPlan[]
  expanded: boolean
  onToggle: () => void
  /** Starts a message to one coordinator, or to all of them. */
  onMessage: (who: string) => void
  /** Opens the record of past days: who did what, and what slipped. */
  onHistory: () => void
}) {
  const withPlans = team.filter((t) => t.plan.total > 0)
  const done = withPlans.reduce((sum, t) => sum + t.plan.done, 0)
  const total = withPlans.reduce((sum, t) => sum + t.plan.total, 0)
  const rows = [...team].sort((a, b) => b.plan.open - a.plan.open || b.plan.total - a.plan.total)

  return (
    <div className="border-b border-border/70 bg-background" data-testid="robi-team">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expanded}
      >
        <div className="relative">
          <ProgressRing done={done} total={total} />
          <Users className="absolute inset-0 m-auto h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Team today</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {total > 0 ? `${done}/${total} done across ${withPlans.length} coordinators` : 'nothing planned'}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <>
          <ul className="max-h-52 space-y-1.5 overflow-y-auto px-4 pb-2">
            {rows.map((member) => (
              <li key={member.coordinatorId} className="group flex items-center gap-3 text-sm">
                <span className="w-28 truncate">{member.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  {member.plan.total > 0 && (
                    <div
                      className={cn('h-full rounded-full', member.plan.open === 0 ? 'bg-emerald-500' : 'bg-primary')}
                      style={{ width: `${Math.round((member.plan.done / member.plan.total) * 100)}%` }}
                    />
                  )}
                </div>
                <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                  {member.plan.total > 0 ? `${member.plan.done}/${member.plan.total}` : 'no plan'}
                </span>
                {/* The message goes through the same sentence a leader would
                    type, so the panel and the chat cannot behave differently. */}
                <button
                  type="button"
                  onClick={() => onMessage(member.name)}
                  aria-label={`Message ${member.name}`}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <button
              type="button"
              onClick={() => onMessage('the team')}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-muted"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Message the whole team
            </button>
            <button
              type="button"
              onClick={onHistory}
              data-testid="robi-history-link"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-muted"
            >
              <History className="h-3.5 w-3.5" /> Task history
            </button>
          </div>
        </>
      )}
    </div>
  )
}
