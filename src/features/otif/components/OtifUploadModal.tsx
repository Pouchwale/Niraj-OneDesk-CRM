import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { parseOtifFile, type ParseResult } from '@/lib/file-parser';
import { toast } from 'sonner';

interface OtifUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (data: any[], fileName: string) => void;
  isLoading: boolean;
}

export function OtifUploadModal({ open, onOpenChange, onUpload, isLoading }: OtifUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setIsParsing(true);
    
    try {
      const result = await parseOtifFile(selectedFile);
      setParseResult(result);
      if (result.rows.length > 0) {
        toast.success(`Parsed ${result.rows.length} PO records from ${selectedFile.name}`);
      } else {
        toast.error('No PO records found in file');
      }
    } catch (error: any) {
      toast.error('Failed to parse file: ' + (error.message || 'Unknown error'));
      setFile(null);
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxFiles: 1
  });

  const handleImport = () => {
    if (parseResult && parseResult.rows.length > 0 && file) {
      onUpload(parseResult.rows, file.name);
      toast.success(`Loaded ${parseResult.rows.length} records into OTIF dashboard`);
      onOpenChange(false);
      setFile(null);
      setParseResult(null);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParseResult(null);
    onOpenChange(false);
  };

  const rowsCount = parseResult?.rows.length || 0;
  const mappedCols = parseResult?.mappedColumns || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle>Upload SAP OTIF Delivery Report</DialogTitle>
          <DialogDescription>
            Upload your weekly SAP Business One Excel or CSV file. Columns are matched by header; the file must carry a PO number, customer and a delivery date or delay column.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div 
            {...getRootProps()} 
            className={`mt-4 border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <input {...getInputProps()} />
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium mb-1">
              {isDragActive ? 'Drop file here' : 'Drop your weekly OTIF Excel/CSV file here or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground">
              Supports .xlsx, .xls, and .csv (SAP Business One exports supported)
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setFile(null); setParseResult(null); }} disabled={isLoading || isParsing}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {isParsing ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Parsing SAP records & column headers...</p>
              </div>
            ) : (
              <div className="bg-secondary/30 rounded-xl p-4 border border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Parsing Verification Report
                  </h4>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                    {rowsCount} Records Extracted
                  </Badge>
                </div>

                {mappedCols.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      Extracted Product Categories:
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(parseResult?.summary.byCategory || {}).map(([cat, count]) => (
                        <Badge key={cat} variant="secondary" className="text-xs px-2.5 py-1">
                          {cat}: <strong>{count} POs</strong>
                        </Badge>
                      ))}
                    </div>

                    <div className="text-xs font-medium text-muted-foreground pt-1 flex items-center gap-1.5">
                      Detected Header Mappings ({mappedCols.length} Columns):
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-0.5">
                      {mappedCols.map((c, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-[11px] text-foreground border border-border/60">
                          <span className="text-muted-foreground">{c.headerName}</span> → <strong className="text-primary">{c.fieldLabel}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {rowsCount === 0 && (
                  <div className="flex items-center gap-2 text-rose-500 text-xs mt-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>No valid PO data rows could be extracted from this file. Please check worksheet formatting.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={handleClose} disabled={isLoading || isParsing}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={!file || rowsCount === 0 || isLoading || isParsing}
            className="bg-primary text-primary-foreground font-medium"
          >
            {isLoading ? 'Loading Dataset...' : `Import ${rowsCount} PO Records`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
