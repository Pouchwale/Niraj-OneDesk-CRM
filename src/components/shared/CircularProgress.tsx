"use client"

import * as React from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export interface CircularProgressProps {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  className?: string
}

export function CircularProgress({
  value,
  size = 60,
  strokeWidth = 6,
  color = "text-primary",
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          className="text-secondary/50 stroke-current"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <motion.circle
          className={cn("stroke-current", color)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className={cn(
        "absolute inset-0 flex items-center justify-center font-bold tracking-tighter", 
        size <= 48 ? (value === 100 ? "text-[10px]" : "text-xs") : "text-sm"
      )}>
        {Math.round(value)}%
      </div>
    </div>
  )
}
