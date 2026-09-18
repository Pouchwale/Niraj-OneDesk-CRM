import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle2, AlertCircle, Coffee } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeEntryStatus } from '@/lib/admin-settings'

interface StatusPreviewProps {
  isLeave: boolean
  orders: number
  pending: number
}

export function StatusPreview({ isLeave, orders, pending }: StatusPreviewProps) {
  // Same rule and threshold the saved entry will get, so the preview never
  // promises a colour the record then contradicts.
  const status = computeEntryStatus({ is_leave: isLeave, orders_received: orders, pending_work: pending })

  const config = {
    green: {
      icon: CheckCircle2,
      title: 'On Track',
      desc: 'All good for today.',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10 border-emerald-500/20'
    },
    red: {
      icon: AlertCircle,
      title: 'Needs Attention',
      desc: `Orders: ${orders}, Pending: ${pending} → Red`,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10 border-rose-500/20'
    },
    leave: {
      icon: Coffee,
      title: 'On Leave',
      desc: 'Marking as leave.',
      color: 'text-blue-700 dark:text-blue-400',
      bg: 'bg-blue-400/10 border-blue-400/20'
    }
  }

  const current = config[status]
  const Icon = current.icon

  return (
    <div className={cn("p-4 rounded-xl border flex items-center gap-4 transition-colors duration-300", current.bg)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
        >
          <Icon className={cn("w-8 h-8", current.color)} />
        </motion.div>
      </AnimatePresence>
      <div>
        <h4 className={cn("font-medium", current.color)}>{current.title}</h4>
        <p className="text-sm text-muted-foreground">{current.desc}</p>
      </div>
    </div>
  )
}
