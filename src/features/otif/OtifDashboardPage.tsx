import { useState, useMemo } from 'react';
import { motion, type Variants } from 'motion/react';
import { FileDown, Upload, Download, Trash2, FileCheck, FileSpreadsheet, Archive } from 'lucide-react';
import { useOtifData } from './hooks/useOtifData';
import { PageHeader } from '@/components/shared/PageHeader';
import { GlassCard } from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

import { OtifKpiCards } from './components/OtifKpiCards';
import { DelayBucketChart } from './components/DelayBucketChart';
import { CategoryBreakdown } from './components/CategoryBreakdown';
import { OtifDataTable } from './components/OtifDataTable';
import { OtifUploadModal } from './components/OtifUploadModal';
import { OtifPdfReportModal } from './components/OtifPdfReportModal';
import { OtifSaveReportModal } from './components/OtifSaveReportModal';
import { OtifArchiveDrawer } from './components/OtifArchiveDrawer';

export function OtifDashboardPage() {
  const { 
    deliveries, 
    summary, 
    filters, 
    setFilters, 
    uploadFile, 
    clearOtifData, 
    activeFileName, 
    isLoading, 
    allDeliveries 
  } = useOtifData();

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  const relationManagers = useMemo(() => {
    const managers = new Set(allDeliveries.map(d => d.relation_manager).filter(Boolean) as string[]);
    return ['All', ...Array.from(managers).sort()];
  }, [allDeliveries]);

  const categories = ['All', 'FG - Label', 'FG - Sleeves', 'FG - Laminates'];
  const delayBuckets = [
    'All',
    'On-Time / Early',
    '1-3 Days Late',
    '4-7 Days Late',
    '8-10 Days Late',
    '10+ Days Late',
  ];

  const delayBucketData = useMemo(() => {
    const total = summary.totalPOs || 1;
    const buckets = ['On-Time / Early', '1-3 Days Late', '4-7 Days Late', '8-10 Days Late', '10+ Days Late'];
    return buckets.map(b => {
      const count = summary.byBucket[b] || 0;
      return {
        bucket: b,
        count,
        percentage: (count / total) * 100
      };
    });
  }, [summary]);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  const hasData = allDeliveries.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="OTIF Delivery Analytics" 
        subtitle="Monitor On-Time In-Full delivery performance and delay day buckets"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {hasData && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearOtifData}
              className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
              title="Clear active dataset"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear Data
            </Button>
          )}

          {hasData && (
            <Button variant="outline" size="sm" onClick={() => setIsSaveModalOpen(true)}>
              <Download className="mr-2 h-4 w-4 text-emerald-500" />
              Save Data
            </Button>
          )}

          {hasData && (
            <Button variant="outline" size="sm" onClick={() => setIsPdfModalOpen(true)}>
              <FileDown className="mr-2 h-4 w-4 text-violet-500" />
              Export PDF
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => setIsArchiveOpen(true)}>
            <Archive className="mr-2 h-4 w-4 text-amber-500" />
            Saved Reports
          </Button>

          <Button size="sm" onClick={() => setIsUploadModalOpen(true)} className="bg-primary text-primary-foreground font-medium">
            <Upload className="mr-2 h-4 w-4" />
            Upload File
          </Button>
        </div>
      </PageHeader>

      {/* Active File Banner Notice */}
      {activeFileName && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-xl flex items-center justify-between text-xs font-medium">
          <span className="flex items-center gap-2">
            <FileCheck className="w-4 h-4" />
            Active File: <strong>{activeFileName}</strong> ({deliveries.length} Records Loaded)
          </span>
          <button onClick={clearOtifData} className="underline hover:text-foreground">
            Clear Dataset
          </button>
        </div>
      )}

      {!hasData ? (
        <GlassCard className="p-12 text-center flex flex-col items-center justify-center space-y-4 my-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-lg font-bold text-foreground">No OTIF Delivery Data Loaded</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upload your weekly SAP Business One OTIF Excel or CSV report to start analyzing delivery scores, product category breakdowns, and delay buckets.
            </p>
          </div>
          <Button onClick={() => setIsUploadModalOpen(true)} className="bg-primary text-primary-foreground font-medium px-6 py-2.5 rounded-xl">
            <Upload className="mr-2 h-4 w-4" />
            Upload Weekly OTIF File
          </Button>
        </GlassCard>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
          {/* Filters Bar */}
          <motion.div variants={itemVariants}>
            <GlassCard className="p-4 flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-1.5 flex-1">
                <Label>Category</Label>
                <Select value={filters.category || 'All'} onValueChange={(v) => setFilters(f => ({ ...f, category: v === 'All' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 flex-1">
                <Label>Relation Manager</Label>
                <Select value={filters.relationManager || 'All'} onValueChange={(v) => setFilters(f => ({ ...f, relationManager: v === 'All' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Manager" /></SelectTrigger>
                  <SelectContent>
                    {relationManagers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 flex-1">
                <Label>Delayed Order Filter</Label>
                <Select value={filters.delayBucket || 'All'} onValueChange={(v) => setFilters(f => ({ ...f, delayBucket: v === 'All' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Delay Days" /></SelectTrigger>
                  <SelectContent>
                    {delayBuckets.map(b => (
                      <SelectItem key={b} value={b}>
                        {b === 'All' ? 'All Orders' : b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div variants={itemVariants}>
            <OtifKpiCards summary={summary} />
          </motion.div>

          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <DelayBucketChart data={delayBucketData} />
            </div>
            <div className="lg:col-span-2">
              <CategoryBreakdown data={summary.byCategory} />
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <OtifDataTable data={deliveries} />
          </motion.div>
        </motion.div>
      )}

      <OtifUploadModal 
        open={isUploadModalOpen} 
        onOpenChange={setIsUploadModalOpen} 
        onUpload={(data, name) => uploadFile(data, name)} 
        isLoading={isLoading} 
      />
      <OtifPdfReportModal 
        open={isPdfModalOpen} 
        onOpenChange={setIsPdfModalOpen} 
        summary={summary}
        deliveries={deliveries}
      />
      <OtifSaveReportModal 
        open={isSaveModalOpen} 
        onOpenChange={setIsSaveModalOpen} 
        deliveries={deliveries}
        summary={summary}
        activeFileName={activeFileName}
        onSaveSuccess={() => setIsArchiveOpen(true)}
      />
      <OtifArchiveDrawer 
        open={isArchiveOpen} 
        onOpenChange={setIsArchiveOpen} 
      />
    </div>
  );
}
