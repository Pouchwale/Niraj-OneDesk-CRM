import { motion, type HTMLMotionProps } from "motion/react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * On a light ground a card is defined by its shadow; on a dark one there is no
 * light for a shadow to block, so it has to be defined by its own brightness
 * and a visible edge.
 *
 * At `bg-card/60` and a half-strength border the dark cards sank back into the
 * page they were meant to sit on — the fill was diluted towards the background
 * and the edge was too faint to draw. Dark therefore gets a near-solid fill and
 * a full-strength border, while light keeps the glass it was designed with.
 */
const glassCardVariants = cva(
  "relative overflow-hidden rounded-xl border border-border/50 dark:border-border backdrop-blur-md transition-all",
  {
    variants: {
      variant: {
        default: "bg-card/60 dark:bg-card/90 shadow-lg dark:shadow-black/40",
        strong: "bg-card/80 dark:bg-card shadow-xl dark:shadow-black/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface GlassCardProps
  extends HTMLMotionProps<"div">,
    VariantProps<typeof glassCardVariants> {
  hoverEffect?: boolean
  glowColor?: string
}

export function GlassCard({
  className,
  variant,
  hoverEffect = false,
  glowColor,
  children,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      whileHover={hoverEffect ? { y: -5, scale: 1.01 } : {}}
      transition={{ duration: 0.2 }}
      className={cn(glassCardVariants({ variant }), className)}
      style={
        glowColor
          ? { boxShadow: `0 0 20px -10px ${glowColor}` }
          : undefined
      }
      {...props}
    >
      {children}
    </motion.div>
  )
}
