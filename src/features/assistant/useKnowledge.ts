import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuth, getAllCoordinators } from '@/features/auth/AuthContext'
import { getCompanies } from '@/lib/companies-api'
import { getOverduePayments } from '@/lib/overdue-api'
import { demoCompanyStore } from '@/lib/demo-companies'
import type { Followup } from '@/lib/types'
import { getFollowupCommitments } from '@/lib/followups-api'
import { todayISO } from '@/lib/utils'
import { waitingFor } from './daily-plan'
import { askAssistant, buildAiContext, type AssistantAnswer, type SystemSnapshot } from './knowledge'
import { teamPlans } from './plan-store'
import { getAiStatus, streamAiReply, type AiStatus } from './ai-client'
import { buildAiRequest, type AiTurn } from './ai-prompt'
import type { AssistantTask } from './types'

type Knowledge = Omit<SystemSnapshot, 'tasks'>

async function loadFollowups(): Promise<Followup[]> {
  return demoCompanyStore.getAllFollowups()
}

/**
 * Answers the rules keep for themselves even when Claude is available: they
 * either do something (send a reminder) or refuse to, and the wording that
 * confirms the outcome must stay exact.
 */
const RULES_ONLY_INTENTS = new Set(['remind', 'remind_denied', 'remind_ambiguous', 'sent', 'help'])

/**
 * Gives the assistant everything it needs to answer questions.
 *
 * The ledger is fetched lazily - the first time somebody actually asks - so
 * opening the widget just to work through nudges does not pull it for nothing,
 * and then cached until something changes underneath.
 *
 * With a Claude key configured on the server, the rule engine still runs
 * first: its figures are exact and its side effects stay with it. Claude then
 * writes the reply from the same live facts, streaming it word by word.
 * Without a key, or if Claude cannot answer, the rule engine's answer stands.
 */
export function useKnowledge(tasks: AssistantTask[]) {
  const { user } = useAuth()
  const [isThinking, setIsThinking] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [aiModel, setAiModel] = useState<string | null>(null)
  const [aiKeyError, setAiKeyError] = useState<string | null>(null)

  const cache = useRef<Knowledge | null>(null)
  const inflight = useRef<Promise<Knowledge> | null>(null)

  const applyStatus = useCallback((status: AiStatus) => {
    setAiReady(status.configured)
    setAiModel(status.model)
    setAiKeyError(status.keyError)
  }, [])

  useEffect(() => {
    let cancelled = false
    getAiStatus().then((status) => {
      if (!cancelled) applyStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [applyStatus])

  const load = useCallback(async (): Promise<Knowledge> => {
    const [companies, overduePayments, followups, commitments] = await Promise.all([
      getCompanies(),
      getOverduePayments(),
      loadFollowups(),
      // The promises the team logged, the same set the dashboard counts.
      getFollowupCommitments(),
    ])

    const today = todayISO()
    const roster = getAllCoordinators()
    const role = user?.role ?? 'coordinator'

    // A coordinator's own plan rides along so "what should I do first" and
    // Claude's answers agree with the plan in the widget.
    const myPlan =
      role === 'coordinator' && user
        ? teamPlans([{ id: user.id, full_name: user.full_name }], companies, overduePayments, followups, today)[0]
        : undefined

    const built: Knowledge = {
      role,
      userId: user?.id ?? '',
      userName: user?.full_name ?? '',
      today,
      companies,
      overduePayments,
      followups,
      commitments,
      coordinators: roster.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        username: c.username,
        // Carried so "tell the GP3 team" can be addressed as a group.
        module: c.module,
      })),
      // The team's plans for today, so "how is Pragati doing" can say how
      // far through hers she is. Coordinators see their own in the widget.
      teamPlans:
        role === 'coordinator'
          ? undefined
          : Object.fromEntries(
              teamPlans(roster, companies, overduePayments, followups, today).map((t) => [
                t.coordinatorId,
                {
                  done: t.plan.done,
                  total: t.plan.total,
                  open: t.plan.open,
                  carriedOver: t.plan.carriedOver,
                  oldestCarried: t.plan.oldestCarried,
                  date: t.plan.date,
                  // The tasks themselves, so "what should Diya do first" is
                  // answered from her real plan rather than imagined.
                  items: t.plan.items.map((item) => ({
                    account: item.entityName ?? 'Account',
                    status: item.status,
                    nudge: item.message,
                  })),
                },
              ])
            ),
      myPlan: myPlan
        ? {
            done: myPlan.plan.done,
            total: myPlan.plan.total,
            carriedOver: myPlan.plan.carriedOver,
            oldestCarried: myPlan.plan.oldestCarried,
            date: myPlan.plan.date,
            items: myPlan.plan.items.map((item) => ({
              account: item.entityName ?? 'Account',
              status: item.status,
              nudge: item.message,
              // How long this one has been waiting, where it is not new.
              waiting: waitingFor(item, myPlan.plan.date),
            })),
          }
        : undefined,
    }
    cache.current = built
    return built
  }, [user])

  // A logged follow-up or a posted match changes the answers, so drop the cache
  // rather than quoting a figure that was true a minute ago.
  useEffect(() => {
    cache.current = null
  }, [tasks.length, user?.id])

  const ask = useCallback(
    async (
      question: string,
      history: AiTurn[] = [],
      onText?: (delta: string) => void
    ): Promise<AssistantAnswer> => {
      setIsThinking(true)
      try {
        let knowledge = cache.current
        if (!knowledge) {
          // Shared so two quick questions do not fetch the ledger twice.
          inflight.current = inflight.current ?? load()
          try {
            knowledge = await inflight.current
          } finally {
            inflight.current = null
          }
        }
        const snapshot: SystemSnapshot = { ...knowledge, tasks }
        const rule = askAssistant(question, snapshot)
        if (RULES_ONLY_INTENTS.has(rule.intent)) return rule

        // Asked again rather than trusted from page load, so a key replaced
        // or refused since then is noticed without anybody reloading.
        const status = await getAiStatus()
        applyStatus(status)
        if (!status.configured) return rule
        // The server already knows the key is refused: say so at once rather
        // than wait on a call that cannot succeed.
        if (status.keyError) return { ...rule, aiError: status.keyError }

        try {
          const request = buildAiRequest({
            question,
            context: buildAiContext(question, snapshot),
            ruleAnswer: rule.intent === 'unknown' ? null : rule,
            history,
          })
          const reply = await streamAiReply(request, onText ?? (() => undefined))
          if (reply.refused || !reply.text.trim()) return rule
          return {
            intent: rule.intent === 'unknown' ? 'ai' : rule.intent,
            text: reply.text.trim(),
            followUps: rule.followUps,
            action: rule.action,
            ai: true,
          }
        } catch (err) {
          // Claude was unavailable: the rules still answer, and the person is
          // told why the reply is the terse one.
          console.error('AI reply failed:', err)
          return { ...rule, aiError: err instanceof Error ? err.message : 'The AI did not answer.' }
        }
      } catch {
        return {
          intent: 'error',
          text: 'I could not read the records just now. Try again in a moment.',
        }
      } finally {
        setIsThinking(false)
      }
    },
    [load, tasks, applyStatus]
  )

  return { ask, isThinking, aiReady, aiModel, aiKeyError }
}
