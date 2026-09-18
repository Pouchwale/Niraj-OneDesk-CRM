import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  X, Send, Loader2, CheckCircle2, ChevronDown, ChevronUp, Circle, MinusCircle, ListChecks, Users, MessageSquare, ArrowRightLeft,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn, todayISO } from '@/lib/utils'
import { useAuth, getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { useDailyEntries } from '@/features/daily-logs/hooks/useDailyEntries'
import { sendReminder, sendReminders } from '@/lib/reminders'
import { seesAllAccounts } from '@/lib/users/roles'

import { useAssistant } from './useAssistant'
import { useKnowledge } from './useKnowledge'
import { useTeamPlans } from './useTeamPlans'
import { greetedToday, markGreeted } from './assistant-state'
import { composeNudge, type Nudge, type NudgeAction } from './proactive'
import { useFocusedRecord, useScreen } from './screen-context'
import { RobotAvatar, type RobotMood } from './RobotAvatar'
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
  const { getEntryByDate } = useDailyEntries()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [activeTask, setActiveTask] = useState<AssistantTask | null>(null)
  const [question, setQuestion] = useState('')
  const [planOpen, setPlanOpen] = useState(true)
  const [nudge, setNudge] = useState<Nudge | null>(null)
  /** Ticks once a minute so time-of-day remarks can fire while the app sits open. */
  const [clock, setClock] = useState(() => Date.now())

  const handledRef = useRef<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const startedRef = useRef(false)
  const lastSpokeRef = useRef(0)

  const pending = tasks.length
  const { ask, isThinking, aiReady } = useKnowledge(tasks)

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
  const dailyEntryLogged = isCoordinator && user ? !!getEntryByDate(user.id, today) : null

  useEffect(() => {
    if (!user || open || isLoading || (isLeader && team.isLoading)) return
    const now = new Date(clock)
    const candidate = composeNudge({
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
      dailyEntryLogged,
      team: isLeader ? team.team : undefined,
      brokenPromises: isLeader ? team.brokenPromises : undefined,
      coordinatorName: (id) => (id ? getCoordinatorDisplayName(id) : 'Unassigned'),
    })
    if (!candidate || wasSaid(user.id, candidate, today)) return

    // A record just opened is worth interrupting for; anything else waits.
    const aboutRecord = candidate.key.startsWith('focus:') || candidate.key.startsWith('lead-focus:')
    if (!aboutRecord && Date.now() - lastSpokeRef.current < COOLDOWN_MS) return

    noteSaid(user.id, candidate, today)
    lastSpokeRef.current = Date.now()
    setNudge(candidate)
  }, [
    user, open, isLoading, isLeader, team.isLoading, team.followups, team.companies,
    team.overduePayments, team.team, team.brokenPromises, clock, today, screen, focused,
    tasks, plan, followups, companies, overduePayments, dailyEntryLogged,
  ])

  useEffect(() => {
    if (!nudge) return
    const id = window.setTimeout(() => setNudge(null), BUBBLE_MS)
    return () => window.clearTimeout(id)
  }, [nudge])

  useEffect(() => {
    if (open) setNudge(null)
  }, [open])

  /* ===== The conversation ===== */

  const greeting = useCallback((): AssistantMessage => {
    if (!user) return assistantSays('Hello.')
    const firstName = user.full_name.split(' ')[0]
    const back = greetedToday(user.id)
    const hello = back ? `Back again, ${firstName}.` : `${partOfDay()}, ${firstName}.`

    if (isCoordinator) {
      if (plan && plan.total > 0) {
        return assistantSays(
          `${hello} Today's plan: ${planProgressLine(plan)}.`,
          plan.complete
            ? 'Everything planned is dealt with. I am still watching the rest of your accounts.'
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
  const handleAsk = async () => {
    const asked = question.trim()
    if (!asked || isThinking) return

    // Earlier turns go with the question so Claude can follow "and why?".
    const history = messages
      .filter((m) => m.text.trim())
      .map((m) => ({ role: m.from === 'coordinator' ? ('user' as const) : ('assistant' as const), text: m.text }))

    setQuestion('')
    setMessages((m) => [...m, coordinatorSays(asked)])

    // Claude's words land as they are written: one message grows in place.
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

    // Answering is read-only; anything that writes comes back as an action for
    // the widget to carry out, so a failed send is reported rather than assumed.
    if (reply.action?.kind === 'remind' && user) {
      const action = reply.action
      try {
        await sendReminders({
          fromUserId: user.id,
          fromName: user.full_name,
          to: action.recipients,
          subject: action.subject,
          message: action.message,
          link: action.link,
          audience: action.audience,
        })
        toast.success(
          action.recipients.length === 1
            ? `Message sent to ${action.recipients[0].name}.`
            : `Message sent to ${action.recipients.length} coordinators.`
        )
      } catch {
        setMessages((m) => [
          ...m,
          assistantSays(`I could not send that to ${action.audience}. Try again in a moment.`),
        ])
        return
      }
    }

    // A rule answer carries its facts underneath; Claude's answer already
    // has them in the text. If Claude was asked and failed, say so.
    const facts = reply.ai ? undefined : reply.facts?.map((f) => `${f.label}: ${f.value}`).join('\n')
    const detail = reply.aiError ? `Answered from the rules — Claude did not reply: ${reply.aiError}` : facts

    setMessages((m) => {
      const index = m.findIndex((x) => x.id === draftId)
      const final: AssistantMessage = { id: draftId, from: 'assistant', text: reply.text, detail, at: new Date().toISOString() }
      if (index === -1) return [...m, final]
      const copy = [...m]
      copy[index] = final
      return copy
    })
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

  const mood: RobotMood = nudge
    ? 'talking'
    : isThinking
      ? 'thinking'
      : plan?.complete
        ? 'happy'
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

  return (
    <>
      {/* ===== A remark about what is on screen ===== */}
      <AnimatePresence>
        {!open && nudge && (
          <motion.div
            key={nudge.key}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            // Above an open account panel and clickable through its overlay:
            // the remark is usually about the record that panel shows.
            className="pointer-events-auto fixed bottom-24 right-4 z-[60] w-[min(340px,calc(100vw-2rem))] sm:right-6"
            role="status"
            aria-live="polite"
            data-testid="robi-bubble"
            data-robi=""
          >
            <div
              className={cn(
                'relative rounded-2xl border bg-background p-3.5 shadow-xl',
                nudge.tone === 'warn'
                  ? 'border-amber-500/50'
                  : nudge.tone === 'success'
                    ? 'border-emerald-500/50'
                    : 'border-border'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 text-primary">
                  <RobotAvatar mood="talking" size={30} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-foreground">{nudge.text}</p>
                  {nudge.detail && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{nudge.detail}</p>
                  )}
                  {nudge.actions.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {nudge.actions.map((action, index) => (
                        <Button
                          key={`${action.kind}-${index}`}
                          size="sm"
                          variant={index === 0 && action.kind !== 'snooze_task' ? 'default' : 'outline'}
                          className="h-8"
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
                  className="-mr-1 -mt-1 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div
                className={cn(
                  'absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 border-b border-r bg-background',
                  nudge.tone === 'warn'
                    ? 'border-amber-500/50'
                    : nudge.tone === 'success'
                      ? 'border-emerald-500/50'
                      : 'border-border'
                )}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== The panel ===== */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={cn(
              'pointer-events-auto fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl',
              'bottom-24 right-4 w-[calc(100vw-2rem)] max-w-[420px] h-[min(640px,calc(100vh-8rem))]',
              'sm:right-6'
            )}
            role="dialog"
            aria-label="Follow-up assistant"
            data-robi=""
          >
            <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <RobotAvatar mood={mood} size={30} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-none">{ROBOT_NAME}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground" data-testid="robi-status">
                  {statusLine}
                  {aiReady && <span title="Replies are written by Claude from the live records"> · AI on</span>}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
              />
            )}

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn('flex', message.from === 'coordinator' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                      message.from === 'coordinator'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-bl-sm bg-muted text-foreground'
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                    {message.detail && (
                      <p className="mt-1.5 text-xs opacity-75 leading-relaxed">{message.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border bg-muted/20 p-3 space-y-2">
              {activeTask && (
                <div className="flex flex-wrap gap-2">
                  {activeTask.actions.map((action) => (
                    <Button
                      key={action.intent}
                      size="sm"
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
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleAsk()
                }}
              >
                <Input
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask me anything — a customer, an invoice, what is owed…"
                  className="h-9 text-sm"
                  disabled={isThinking}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={isThinking || !question.trim()}
                  aria-label="Ask the assistant"
                >
                  {isThinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== The robot itself ===== */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? 'Hide follow-up assistant' : 'Open follow-up assistant'}
        title={open ? `Hide ${ROBOT_NAME}` : `Talk to ${ROBOT_NAME}`}
        className={cn(
          'pointer-events-auto fixed bottom-6 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors sm:right-6',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
        data-robi=""
      >
        {open ? <ChevronDown className="h-6 w-6" /> : <RobotAvatar mood={mood} size={36} />}

        {!open && pending > 0 && (
          <Badge
            className="absolute -right-1 -top-1 h-6 min-w-6 justify-center rounded-full border-2 border-background bg-rose-500 px-1.5 text-xs text-white hover:bg-rose-500"
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

function PlanSection({ plan, expanded, onToggle, onOpen, onSkip, onUnskip }: PlanSectionProps) {
  return (
    <div className="border-b border-border bg-muted/20" data-testid="robi-plan">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <ListChecks className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Today's plan</span>
        <span
          className={cn(
            'ml-auto text-xs tabular-nums',
            // Green for work actually done, not for a list that emptied itself.
            plan.done === plan.total
              ? 'font-medium text-emerald-700 dark:text-emerald-400'
              : 'text-muted-foreground'
          )}
        >
          {plan.done}/{plan.total} done
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            plan.done === plan.total ? 'bg-emerald-500' : 'bg-primary'
          )}
          style={{ width: `${Math.round((plan.done / plan.total) * 100)}%` }}
        />
      </div>
      {expanded && (
        <ul className="max-h-52 space-y-1 overflow-y-auto px-3 pb-3 pt-2">
          {plan.items.map((item) => (
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
        'flex items-start gap-2.5 rounded-xl px-2 py-1.5',
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
        </p>
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{item.message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.status === 'open' && (
          <>
            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onOpen}>
              Open
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSkip}>
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
}: {
  team: TeamPlan[]
  expanded: boolean
  onToggle: () => void
  /** Starts a message to one coordinator, or to all of them. */
  onMessage: (who: string) => void
}) {
  const withPlans = team.filter((t) => t.plan.total > 0)
  const done = withPlans.reduce((sum, t) => sum + t.plan.done, 0)
  const total = withPlans.reduce((sum, t) => sum + t.plan.total, 0)
  const rows = [...team].sort((a, b) => b.plan.open - a.plan.open || b.plan.total - a.plan.total)

  return (
    <div className="border-b border-border bg-muted/20" data-testid="robi-team">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <Users className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Team today</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {total > 0 ? `${done}/${total} done` : 'nothing planned'}
        </span>
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
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
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
          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => onMessage('the team')}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-muted"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Message the whole team
            </button>
          </div>
        </>
      )}
    </div>
  )
}
