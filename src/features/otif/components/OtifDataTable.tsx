import { useState, useMemo } from 'react';
import { type PoDelivery } from '@/lib/types';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatDate } from '@/lib/utils';
import { ColumnDef } from '@tanstack/react-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, FileText, PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface OtifDataTableProps {
  data: PoDelivery[];
}

export function OtifDataTable({ data }: OtifDataTableProps) {
  const [selectedRecord, setSelectedRecord] = useState<PoDelivery | null>(null);

  const columns = useMemo<ColumnDef<PoDelivery>[]>(() => [
    { header: 'PO No', accessorKey: 'po_no' },
    { header: 'SO No', accessorKey: 'so_no' },
    { 
      header: 'SO Date', 
      accessorKey: 'so_date',
      cell: ({ row }) => row.original.so_date ? formatDate(row.original.so_date) : '-'
    },
    { header: 'Customer', accessorKey: 'customer_name' },
    { 
      header: 'Category', 
      accessorKey: 'category',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs font-medium bg-primary/10 text-primary border-primary/20">
          {row.original.category}
        </Badge>
      )
    },
    { 
      header: 'OTIF', 
      accessorKey: 'otif_score',
      cell: ({ row }) => {
        const score = row.original.otif_score;
        if (!score) return '-';
        return <StatusBadge status={score === 'YES' ? 'success' : 'error'} label={score} />;
      }
    },
    { header: 'Open Qty', accessorKey: 'open_order_qty' },
    { 
      header: 'Due Date', 
      accessorKey: 'po_due_date',
      cell: ({ row }) => row.original.po_due_date ? formatDate(row.original.po_due_date) : '-'
    },
    { 
      header: 'Day Committed', 
      accessorKey: 'day_committed',
      cell: ({ row }) => row.original.day_committed || '-'
    },
    { 
      header: 'Closed Date', 
      accessorKey: 'po_closed_date',
      cell: ({ row }) => row.original.po_closed_date ? formatDate(row.original.po_closed_date) : '-'
    },
    { 
      header: 'Delay Days', 
      accessorKey: 'delay_day',
      cell: ({ row }) => {
        const days = row.original.delay_day ?? 0;
        let color = 'text-emerald-500 font-semibold';
        if (days > 0 && days <= 7) color = 'text-amber-500 font-semibold';
        else if (days > 7) color = 'text-rose-500 font-semibold';
        
        return <span className={color}>{days > 0 ? `+${days}` : days}</span>;
      }
    },
    { 
      header: 'Bucket', 
      accessorKey: 'delay_bucket',
      cell: ({ row }) => {
        const b = row.original.delay_bucket || '';
        let s: 'success' | 'warning' | 'error' = 'success';
        if (b === 'On-Time / Early') s = 'success';
        else if (b.includes('1-3') || b.includes('4-7')) s = 'warning';
        else s = 'error';
        return <StatusBadge status={s} label={b || 'N/A'} />;
      }
    },
    { header: 'Relation Manager', accessorKey: 'relation_manager' },
    { 
      header: 'Remarks', 
      accessorKey: 'remarks',
      cell: ({ row }) => (
        <div className="max-w-[150px] truncate" title={row.original.remarks || ''}>
          {row.original.remarks || '-'}
        </div>
      )
    },
    {
      header: 'Details',
      id: 'actions',
      cell: ({ row }) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setSelectedRecord(row.original)}
          className="text-xs gap-1 hover:bg-muted text-primary"
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </Button>
      )
    }
  ], []);

  const rawDetails = (selectedRecord as any)?.raw_details || {};

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
          <PackageCheck className="w-5 h-5 text-primary" />
          Detailed Delivery PO Records ({data.length})
        </h3>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchable
        searchColumn="customer_name"
        pageSize={15}
      />

      {/* Row Detail View Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="sm:max-w-[600px] bg-background/95 backdrop-blur-xl border-border/50 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              PO Details — {selectedRecord?.po_no}
            </DialogTitle>
            <DialogDescription>
              100% extracted attributes and raw details from uploaded file
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-4 rounded-xl border border-border/60">
                <div>
                  <span className="text-muted-foreground block">Customer:</span>
                  <span className="font-semibold text-foreground">{selectedRecord.customer_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Category:</span>
                  <span className="font-semibold text-primary">{selectedRecord.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">SO Number:</span>
                  <span className="font-semibold text-foreground">{selectedRecord.so_no}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Relation Manager:</span>
                  <span className="font-semibold text-foreground">{selectedRecord.relation_manager}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Due Date:</span>
                  <span className="font-semibold text-foreground">{selectedRecord.po_due_date}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Closed Date:</span>
                  <span className="font-semibold text-foreground">{selectedRecord.po_closed_date}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Delay Days:</span>
                  <span className={`font-semibold ${(selectedRecord.delay_day ?? 0) > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {selectedRecord.delay_day ?? 0} days ({selectedRecord.delay_bucket})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Open Qty:</span>
                  <span className="font-semibold text-foreground">{selectedRecord.open_order_qty}</span>
                </div>
              </div>

              {Object.keys(rawDetails).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    All File Columns & Raw Extracted Attributes
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {Object.entries(rawDetails).map(([key, val]) => (
                      <div key={key} className="p-2.5 rounded-lg bg-secondary/40 border border-border/50">
                        <div className="text-[11px] text-muted-foreground font-medium">{key}</div>
                        <div className="font-semibold text-foreground truncate">{String(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
