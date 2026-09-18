import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/shared/GlassCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { History, AlertTriangle, Check, FileSpreadsheet } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { demoCompanyStore } from '@/lib/demo-companies'

import type { Upload } from '@/lib/types'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'

interface UploadHistoryTabProps {
  className?: string
}

export function UploadHistoryTab({ className }: UploadHistoryTabProps) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUploads() {
      setLoading(true)
      try {
        const demoUploads = demoCompanyStore.getUploads()
        setUploads([...demoUploads].sort((a, b) => new Date(b.uploaded_at || '').getTime() - new Date(a.uploaded_at || '').getTime()))
      } catch (error) {
        console.error('Failed to fetch uploads', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUploads()
  }, [])

  if (!loading && uploads.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No Upload History"
        description="No admin uploads have been recorded yet."
        className={className}
      />
    )
  }

  return (
    <GlassCard className={className}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Upload Date</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Total Rows</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uploads.map((upload) => (
              <TableRow key={upload.id}>
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                    {upload.filename}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(upload.uploaded_at || (upload as any).uploaded_at)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {upload.admin_id ? getCoordinatorDisplayName(upload.admin_id) : 'Admin'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {upload.rows_total}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                    {upload.rows_created}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                    {upload.rows_updated}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={upload.rows_failed > 0 ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" : "bg-muted text-muted-foreground border-border"}>
                    {upload.rows_failed}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {upload.rows_failed > 0 ? (
                    <span className="inline-flex items-center text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mr-1 h-4 w-4" />
                      {upload.rows_failed} row{upload.rows_failed === 1 ? '' : 's'} refused
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-emerald-700 dark:text-emerald-400 text-sm">
                      <Check className="h-4 w-4 mr-1" /> Perfect
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  )
}
