import * as React from "react"
import { cn } from "@/lib/utils"

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  subtitle?: string
  description?: string
  icon?: React.ReactNode
}

export function PageHeader({
  title,
  subtitle,
  description,
  icon,
  children,
  className,
  ...props
}: PageHeaderProps) {
  const sub = subtitle || description
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        {icon && <div className="p-2 rounded-xl bg-primary/10 text-primary">{icon}</div>}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {sub && (
            <p className="text-sm text-muted-foreground">{sub}</p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
