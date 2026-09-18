import { useState } from 'react';
import { FileDown, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { type OtifSummary } from '@/lib/demo-data';
import { type PoDelivery } from '@/lib/types';
import { toast } from 'sonner';

// Note: jsPDF and jspdf-autotable would be imported dynamically or normally here.
// import jsPDF from 'jspdf';
// import autoTable from 'jspdf-autotable';

interface OtifPdfReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: OtifSummary;
  deliveries: PoDelivery[];
}

export function OtifPdfReportModal({ open, onOpenChange, summary, deliveries }: OtifPdfReportModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportTitle, setReportTitle] = useState('OTIF Delivery Analytics Report');

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.width;
      
      // Calculate Metrics
      const totalOrders = deliveries.length;
      let onTime = 0;
      let totalDelayDays = 0;
      let delayedCount = 0;
      
      const buckets = {
        '0d': 0,
        '1-3d': 0,
        '4-7d': 0,
        '8-10d': 0,
        '10+d': 0
      };

      const byCategory: Record<string, any> = {};
      const byManager: Record<string, any> = {};

      deliveries.forEach(d => {
        const cat = d.category || 'Unknown';
        const rm = d.relation_manager || 'Unknown';
        const days = Number(d.delay_day) || 0;
        
        if (!byCategory[cat]) {
          byCategory[cat] = { total: 0, onTime: 0, b1_3: 0, b4_7: 0, b8_10: 0, b10plus: 0 };
        }
        if (!byManager[rm]) {
          byManager[rm] = { total: 0, onTime: 0, delayDays: 0, b1_3: 0, b4_7: 0, b8_10: 0, b10plus: 0 };
        }

        byCategory[cat].total++;
        byManager[rm].total++;
        byManager[rm].delayDays += days;

        if (days <= 0) {
          onTime++;
          buckets['0d']++;
          byCategory[cat].onTime++;
          byManager[rm].onTime++;
        } else {
          delayedCount++;
          totalDelayDays += days;
          if (days >= 1 && days <= 3) { buckets['1-3d']++; byCategory[cat].b1_3++; byManager[rm].b1_3++; }
          else if (days >= 4 && days <= 7) { buckets['4-7d']++; byCategory[cat].b4_7++; byManager[rm].b4_7++; }
          else if (days >= 8 && days <= 10) { buckets['8-10d']++; byCategory[cat].b8_10++; byManager[rm].b8_10++; }
          else { buckets['10+d']++; byCategory[cat].b10plus++; byManager[rm].b10plus++; }
        }
      });

      const overallOtif = totalOrders > 0 ? (onTime / totalOrders) * 100 : 0;
      const avgDelay = delayedCount > 0 ? (totalDelayDays / delayedCount).toFixed(1) : '0';

      // Header
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.text(reportTitle || 'OTIF Delivery Analytics Report', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
      
      let currentY = 40;

      // Draw KPI Boxes (Using autoTable to simulate grid of cards)
      autoTable(doc, {
        startY: currentY,
        head: [['OVERALL OTIF RATE', 'TOTAL ORDERS', 'ON-TIME (0 DAYS)', 'DELAYED (AVG DAYS)']],
        body: [[
          `${overallOtif.toFixed(1)}%`,
          `${totalOrders} POs`,
          `${onTime} POs`,
          `${delayedCount} (${avgDelay}d)`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontSize: 10, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 16, fontStyle: 'bold', halign: 'center', textColor: [15, 23, 42] },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 'auto' },
          2: { textColor: [16, 185, 129] }, // green
          3: { textColor: [225, 29, 72] } // rose
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 5;

      // Delay Buckets
      autoTable(doc, {
        startY: currentY,
        head: [['ON-TIME / EARLY (0d)', '1-3 DAYS LATE', '4-7 DAYS LATE', '8-10 DAYS LATE', '10+ DAYS LATE']],
        body: [[
          `${buckets['0d']} POs (${((buckets['0d']/totalOrders)*100 || 0).toFixed(1)}%)`,
          `${buckets['1-3d']} POs (${((buckets['1-3d']/totalOrders)*100 || 0).toFixed(1)}%)`,
          `${buckets['4-7d']} POs (${((buckets['4-7d']/totalOrders)*100 || 0).toFixed(1)}%)`,
          `${buckets['8-10d']} POs (${((buckets['8-10d']/totalOrders)*100 || 0).toFixed(1)}%)`,
          `${buckets['10+d']} POs (${((buckets['10+d']/totalOrders)*100 || 0).toFixed(1)}%)`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontSize: 9, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 12, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { textColor: [16, 185, 129] },
          1: { textColor: [217, 119, 6] },
          2: { textColor: [234, 88, 12] },
          3: { textColor: [225, 29, 72] },
          4: { textColor: [190, 18, 60] }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Table 1: Product Category
      const catBody = Object.entries(byCategory).map(([cat, stats]) => [
        cat,
        `${stats.onTime} (${((stats.onTime/stats.total)*100 || 0).toFixed(0)}%)`,
        stats.b1_3,
        stats.b4_7,
        stats.b8_10,
        stats.b10plus,
        stats.total,
        `${((stats.onTime/stats.total)*100 || 0).toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Product Category', '0d (On-Time)', '1-3d Late', '4-7d Late', '8-10d Late', '10+d Late', 'Total POs', 'Actual OTIF %']],
        body: catBody,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: [255,255,255], fontStyle: 'bold' }, // blue-600
        bodyStyles: { textColor: [71, 85, 105], fontStyle: 'bold' },
        columnStyles: {
          1: { textColor: [16, 185, 129] },
          2: { textColor: [217, 119, 6] },
          3: { textColor: [234, 88, 12] },
          4: { textColor: [225, 29, 72] },
          5: { textColor: [190, 18, 60] },
          7: { textColor: [15, 23, 42] }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Table 2: Delay Duration Interval
      const impactData = [
        ['0 Days (On-Time / Early)', `${buckets['0d']} POs`, `${((buckets['0d']/totalOrders)*100 || 0).toFixed(1)}%`, 'Optimal / On Schedule fulfillment'],
        ['1-3 Days Late', `${buckets['1-3d']} POs`, `${((buckets['1-3d']/totalOrders)*100 || 0).toFixed(1)}%`, 'Minor delay (Minor production buffer)'],
        ['4-7 Days Late', `${buckets['4-7d']} POs`, `${((buckets['4-7d']/totalOrders)*100 || 0).toFixed(1)}%`, 'Moderate delay (Attention & follow-up needed)'],
        ['8-10 Days Late', `${buckets['8-10d']} POs`, `${((buckets['8-10d']/totalOrders)*100 || 0).toFixed(1)}%`, 'Significant delay (Cylinder/raw material bottleneck)'],
        ['10+ Days Late', `${buckets['10+d']} POs`, `${((buckets['10+d']/totalOrders)*100 || 0).toFixed(1)}%`, 'Critical delay risk (Executive escalation required)']
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['Delay Duration Interval', 'Order Count', 'Share of Total Orders', 'Operational Impact & Status']],
        body: impactData,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: [255,255,255], fontStyle: 'bold' }, // slate-600
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Check page break
      if (currentY > 150) {
        doc.addPage();
        currentY = 20;
      }

      // Table 3: Relation Manager
      const rmBody = Object.entries(byManager).map(([rm, stats]) => [
        rm,
        stats.total,
        `${stats.onTime} (${((stats.onTime/stats.total)*100 || 0).toFixed(0)}%)`,
        stats.b1_3,
        stats.b4_7,
        stats.b8_10,
        stats.b10plus,
        `+${(stats.delayDays/stats.total).toFixed(1)}d`,
        `${((stats.onTime/stats.total)*100 || 0).toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Relation Manager', 'Total POs', 'On-Time (0d)', '1-3d', '4-7d', '8-10d', '10+d', 'Avg Delay', 'OTIF Rate %']],
        body: rmBody,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255,255,255], fontStyle: 'bold' }, // slate-900
        bodyStyles: { textColor: [71, 85, 105], fontStyle: 'bold' },
        columnStyles: {
          2: { textColor: [16, 185, 129] },
          3: { textColor: [217, 119, 6] },
          4: { textColor: [234, 88, 12] },
          5: { textColor: [225, 29, 72] },
          6: { textColor: [190, 18, 60] },
          8: { textColor: [15, 23, 42] }
        }
      });

      doc.save(reportTitle ? `${reportTitle}.pdf` : 'otif-report.pdf');
      toast.success('PDF report generated successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF report');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle>Generate OTIF Report</DialogTitle>
          <DialogDescription>
            Export a highly detailed PDF report matching your exact analytics requirements.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Report Title</Label>
            <Input 
              id="title" 
              value={reportTitle} 
              onChange={(e) => setReportTitle(e.target.value)} 
              placeholder="e.g. Monthly OTIF Report"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isGenerating ? 'Generating...' : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
