import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useOtif } from '@/features/otif/OtifContext';
import { Button } from '@/components/ui/button';
import { Archive, Calendar, CheckCircle2, Trash2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface OtifArchiveDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OtifArchiveDrawer({ open, onOpenChange }: OtifArchiveDrawerProps) {
  const { archives, loadArchive, deleteArchive, activeFileName } = useOtif();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-background/95 backdrop-blur-xl border-l border-border/50">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Archive className="w-5 h-5 text-primary" />
            Saved OTIF Reports
          </SheetTitle>
          <SheetDescription>
            Access your previously uploaded OTIF data anytime. The system retains your 10 most recent uploads.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto pr-2 pb-10" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          {archives.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground flex flex-col items-center">
              <Archive className="w-10 h-10 mb-3 opacity-20" />
              <p>No saved reports found.</p>
              <p className="text-xs mt-1">Upload a file to automatically save it here.</p>
            </div>
          ) : (
            archives.map((archive) => {
              const isActive = archive.fileName === activeFileName;
              return (
                <div 
                  key={archive.id} 
                  className={`relative p-4 rounded-xl border flex flex-col gap-3 transition-all ${
                    isActive 
                      ? 'bg-primary/10 border-primary/40 shadow-sm' 
                      : 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5 line-clamp-1">
                        {archive.fileName}
                        {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      </h4>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(archive.uploadDate), 'MMM d, yyyy • h:mm a')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-medium text-foreground bg-background rounded-md px-2 py-1 border border-border">
                      {archive.totalPOs} POs
                    </span>
                    <span className="font-medium text-foreground bg-background rounded-md px-2 py-1 border border-border">
                      Score: <span className={archive.otifScore >= 80 ? 'text-emerald-500' : 'text-amber-500'}>{Math.round(archive.otifScore)}%</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-1 pt-3 border-t border-border/50">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => deleteArchive(archive.id)} 
                      className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-8 px-2"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                    <Button 
                      variant={isActive ? "secondary" : "default"}
                      size="sm" 
                      onClick={() => {
                        loadArchive(archive.id);
                        onOpenChange(false);
                      }}
                      className="text-xs h-8"
                      disabled={isActive}
                    >
                      {isActive ? 'Active' : 'Load Report'} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
