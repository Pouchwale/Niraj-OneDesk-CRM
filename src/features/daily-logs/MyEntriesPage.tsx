import React, { useMemo } from 'react'
import { format } from 'date-fns'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { KpiCard } from '@/components/shared/KpiCard'
import { useAuth } from '@/features/auth/AuthContext'
import { useDailyEntries } from './hooks/useDailyEntries'
import { formatCurrency } from '@/lib/utils'
import { Calendar, CheckCircle, AlertCircle, Coffee } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { DailyEntry } from '@/lib/types'

export function MyEntriesPage() {
  const { user } = useAuth()
  const { getMyEntries } = useDailyEntries()
  
  const entries = useMemo(() => {
    if (!user) return []
    return getMyEntries(user.id)
  }, [user, getMyEntries])

  const stats = useMemo(() => {
    let green = 0, red = 0, leave = 0
    entries.forEach(e => {
      if (e.overall_status === 'green') green++
      else if (e.overall_status === 'red') red++
      else if (e.overall_status === 'leave') leave++
    })
    return { total: entries.length, green, red, leave }
  }, [entries])

  const columns: ColumnDef<DailyEntry>[] = [
    {
      accessorKey: 'entry_date',
      header: 'Date',
      cell: ({ row }) => format(new Date(row.original.entry_date), 'MMM dd, yyyy')
    },
    {
      accessorKey: 'overall_status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.overall_status} />
    },
    {
      accessorKey: 'orders_received',
      header: 'Orders',
    },
    {
      accessorKey: 'sales_amount',
      header: 'Sales',
      cell: ({ row }) => formatCurrency(Number(row.original.sales_amount))
    },
    {
      accessorKey: 'fresh_leads',
      header: 'Leads',
    },
    {
      accessorKey: 'pending_work',
      header: 'Pending Work',
    }
  ]

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <PageHeader 
        title="My Entries" 
        subtitle="History of your daily activity logs" 
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Total Entries" value={stats.total} icon={Calendar} color="indigo" />
        <KpiCard title="Green Days" value={stats.green} icon={CheckCircle} color="emerald" />
        <KpiCard title="Red Days" value={stats.red} icon={AlertCircle} color="rose" />
        <KpiCard title="Leave Days" value={stats.leave} icon={Coffee} color="amber" />
      </div>

      <div className="mt-8">
        <DataTable
          columns={columns}
          data={entries}
          searchable
          searchColumn="entry_date"
          pageSize={10}
        />
      </div>
    </div>
  )
}
