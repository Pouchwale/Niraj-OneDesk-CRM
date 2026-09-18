import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export interface StatusBadgeProps {
  status: "green" | "red" | "leave" | "success" | "error" | "warning"
  label?: string
  className?: string
}

export function StatusBadge({ status, label: customLabel, className }: StatusBadgeProps) {
  const normalizedStatus = status === 'success' ? 'green' : status === 'error' ? 'red' : status === 'warning' ? 'leave' : status;

  const config = {
    green: {
      label: "On Track",
      dotClass: "bg-emerald-500",
      glowClass: "shadow-[0_0_10px_rgba(16,185,129,0.5)]",
      badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    },
    red: {
      label: "Needs Attention",
      dotClass: "bg-rose-500",
      glowClass: "shadow-[0_0_10px_rgba(244,63,94,0.5)]",
      badgeClass: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    },
    leave: {
      label: "On Leave",
      dotClass: "bg-amber-500",
      glowClass: "shadow-[0_0_10px_rgba(245,158,11,0.5)]",
      badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    },
  }

  const { label: defaultLabel, dotClass, glowClass, badgeClass } = config[normalizedStatus]
  const displayLabel = customLabel || defaultLabel

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 pl-1.5 font-medium", badgeClass, className)}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            dotClass
          )}
        />
        <span
          className={cn("relative inline-flex h-2 w-2 rounded-full", dotClass, glowClass)}
        />
      </span>
      {displayLabel}
    </Badge>
  )
}
