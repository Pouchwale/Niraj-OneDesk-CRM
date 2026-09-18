import { History, FileSpreadsheet, Trash2, FolderOpen } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOtif } from '@/features/otif/OtifContext';
import { formatDate } from '@/lib/utils';

/**
 * What has been imported into OTIF Analytics: the dataset currently loaded
 * and every report saved to the archive.
 *
 * This tab was a permanent "No imports yet" placeholder; the data it claimed
 * to show was sitting in the OTIF context the whole time.
 */
export function OtifImportHistory() {
  const { activeFileName, allDeliveries, archives, loadArchive, deleteArchive } = useOtif();

  if (!activeFileName && archives.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No imports yet"
        description="Files uploaded to OTIF Analytics, and reports saved there, will be listed here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {activeFileName && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <span className="font-medium">Currently loaded:</span>
          <span className="font-mono">{activeFileName}</span>
          <Badge variant="outline">{allDeliveries.length} PO records</Badge>
        </div>
      )}

      {archives.length > 0 && (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saved report</TableHead>
                <TableHead>Saved on</TableHead>
                <TableHead className="text-right">POs</TableHead>
                <TableHead className="text-right">OTIF</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archives.map((archive) => (
                <TableRow key={archive.id}>
                  <TableCell className="font-medium">{archive.fileName}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(archive.uploadDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{archive.totalPOs}</TableCell>
                  <TableCell className="text-right tabular-nums">{archive.otifScore.toFixed(1)}%</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => loadArchive(archive.id)} aria-label={`Load ${archive.fileName}`}>
                        <FolderOpen className="mr-1 h-4 w-4" /> Load
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteArchive(archive.id)} aria-label={`Delete ${archive.fileName}`}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
