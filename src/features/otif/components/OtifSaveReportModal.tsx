import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Archive, Download, CheckCircle2 } from 'lucide-react';
import type { PoDelivery } from '@/lib/types';
import type { OtifSummary } from '@/lib/demo-data';
import { useOtif } from '../OtifContext';

interface OtifSaveReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveries: PoDelivery[];
  summary: OtifSummary;
  activeFileName?: string | null;
  onSaveSuccess?: () => void;
}

export function OtifSaveReportModal({
  open,
  onOpenChange,
  deliveries,
  summary,
  activeFileName,
  onSaveSuccess,
}: OtifSaveReportModalProps) {
  const { saveToArchive } = useOtif();

  const defaultBaseName = activeFileName
    ? activeFileName.replace(/\.[^/.]+$/, '')
    : `OTIF_Report_${new Date().toISOString().split('T')[0]}`;

  const [fileName, setFileName] = useState(defaultBaseName);

  const handleSave = () => {
    const cleanFileName = fileName.trim() || 'OTIF_Delivery_Report';
    saveToArchive(cleanFileName);
    onOpenChange(false);
    if (onSaveSuccess) onSaveSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-primary" />
            Save to Report Archive
          </DialogTitle>
          <DialogDescription>
            Save the active OTIF delivery dataset to your internal system archive. You can reload this exact report anytime later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="report-name">Archive Record Name</Label>
            <Input
              id="report-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. OTIF_Weekly_Report_Aug2026"
            />
          </div>

          <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60 text-xs text-muted-foreground flex items-center justify-between">
            <span>Records to Save:</span>
            <span className="font-semibold text-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {deliveries.length} PO Records
            </span>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground gap-2">
            <Archive className="w-4 h-4" />
            Save to Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
