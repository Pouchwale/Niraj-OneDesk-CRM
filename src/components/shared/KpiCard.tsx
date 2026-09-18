"use client"

import * as React from "react"
import { ArrowDownRight, ArrowUpRight, ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"
import { GlassCard } from "./GlassCard"

export interface KpiCardProps {
  title: string
  value: number | string
  prefix?: string
  suffix?: string
  delta?: number | string | string
  deltaType?: string | "neutral" | "down" | "up" | string
  icon: React.ComponentType<{ className?: string }>
  color?: "emerald" | "blue" | "amber" | "rose" | "violet" | "indigo"
  className?: string
  /** One line under the figure saying what it means or what to do about it. */
  hint?: string
  /** Turns the card into a link to the page where the number can be acted on. */
  href?: string
  /**
   * Whether the movement is good news. Kept separate from the arrow direction so
   * a falling number that is welcome (overdue, disputes) reads as a green arrow
   * pointing down rather than a green arrow pointing the wrong way.
   */
  deltaGood?: boolean
}

const colorMap = {
  emerald: "text-emerald-500",
  blue: "text-blue-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
  violet: "text-violet-500",
  indigo: "text-indigo-500",
}

const glowMap = {
  emerald: "rgba(16, 185, 129, 0.2)",
  blue: "rgba(59, 130, 246, 0.2)",
  amber: "rgba(245, 158, 11, 0.2)",
  rose: "rgba(244, 63, 94, 0.2)",
  violet: "rgba(139, 92, 246, 0.2)",
  indigo: "rgba(99, 102, 241, 0.2)",
}

export function KpiCard({
  title,
  value,
  prefix = "",
  suffix = "",
  delta,
  deltaType,
  icon: Icon,
  color = "blue",
  className,
  hint,
  href,
  deltaGood,
}: KpiCardProps) {
  const isNumber = typeof value === "number"
  const [displayValue, setDisplayValue] = React.useState(isNumber ? 0 : value)

  // The number the card is showing right now, so a change animates from it
  // rather than restarting at zero; and the running frame, so a change that
  // lands mid-animation cancels the old run instead of racing it. Without
  // both, a filter changed twice in a second could leave the card on a stale
  // figure - the one thing a summary card must never do.
  const shownRef = React.useRef<number>(0)
  const frameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (typeof value !== "number") {
      setDisplayValue(value)
      return
    }
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)

    const reduceMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const startValue = shownRef.current
    if (reduceMotion || startValue === value) {
      shownRef.current = value
      setDisplayValue(value)
      return
    }

    let startTime: number | null = null
    const duration = 500
    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const next = progress >= 1 ? value : Math.round(startValue + progress * (value - startValue))
      shownRef.current = next
      setDisplayValue(next)
      frameRef.current = progress < 1 ? window.requestAnimationFrame(step) : null
    }
    frameRef.current = window.requestAnimationFrame(step)

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [value])

  const isUp = deltaType === "increase" || deltaType === "up"
  // Legacy callers signalled goodness through the direction itself.
  const isGood = deltaGood ?? isUp

  const body = (
    <GlassCard
      className={cn("h-full p-4 sm:p-6", href && "transition-colors hover:border-primary/40", className)}
      hoverEffect
      glowColor={glowMap[color]}
    >
      <div className="flex items-center justify-between">
        <p className="min-w-0 text-xs font-medium text-muted-foreground sm:text-sm">{title}</p>
        <div className={cn("shrink-0 rounded-full bg-background/50 p-1.5 sm:p-2", colorMap[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 sm:mt-4">
        <h2 className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl lg:text-3xl">
          {prefix}
          {displayValue.toLocaleString()}
          {suffix}
        </h2>
        {delta !== undefined && deltaType && (
          <span
            className={cn(
              "flex items-center text-xs font-medium",
              isGood ? "text-emerald-500" : "text-rose-500"
            )}
          >
            {isUp ? (
              <ArrowUpRight className="mr-1 h-3 w-3" />
            ) : (
              <ArrowDownRight className="mr-1 h-3 w-3" />
            )}
            {delta}
          </span>
        )}
      </div>
      {hint && (
        <p className="mt-2 flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">
          <span className="min-w-0 flex-1">{hint}</span>
          {href && <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />}
        </p>
      )}
    </GlassCard>
  )

  if (!href) return body

  return (
    <Link to={href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      {body}
    </Link>
  )
}
