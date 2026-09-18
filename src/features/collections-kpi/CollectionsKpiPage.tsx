import { useState } from 'react';
import { Upload, AlertTriangle, Calculator, FileSpreadsheet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { parseKpiFile } from './kpi-parser';
import { calculateCollectionsKpi, KpiInputRow, KpiCalculationResult } from './kpi-calculator';

export function CollectionsKpiPage() {
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<KpiCalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    if (!oldFile) return;
    
    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    try {
      const oldData = await parseKpiFile(oldFile);
      const newData = newFile ? await parseKpiFile(newFile) : [];
      
      const res = calculateCollectionsKpi(oldData, newData);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'An error occurred during calculation');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coordinator Collection KPI</h1>
          <p className="text-muted-foreground">
            Calculate achievements and KPIs by comparing Old and New aging periods.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            1. Old Period Data
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload the start-of-period balances and targets.
          </p>
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              onChange={(e) => setOldFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20"
            />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            2. New Period Data (Optional)
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload the end-of-period balances. (Leave blank if you uploaded a pre-calculated Summary file in Step 1).
          </p>
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              onChange={(e) => setNewFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20"
            />
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleCalculate} 
          disabled={!oldFile || isProcessing}
          className="gap-2"
        >
          <Calculator className="w-4 h-4" />
          {isProcessing ? 'Calculating...' : 'Calculate KPI'}
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-medium">{error}</p>
          </div>
        </Card>
      )}

      {result && result.flags.length > 0 && (
        <Card className="p-4 bg-warning/10 border-warning">
          <h3 className="font-medium flex items-center gap-2 mb-2 text-warning-foreground">
            <AlertTriangle className="w-5 h-5" />
            Alerts & Flags
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-warning-foreground">
            {result.flags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </Card>
      )}

      {result && result.results.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase">
                <tr>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Coordinator Name</th>
                  <th className="px-4 py-3 text-right">Target 30 - 120 Days</th>
                  <th className="px-4 py-3 text-right">Achive 30-120 Days</th>
                  <th className="px-4 py-3 text-right">Target 120 + Days</th>
                  <th className="px-4 py-3 text-right">Achive 120 + Days</th>
                  <th className="px-4 py-3 text-right font-bold text-primary">KPI Score</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/50 whitespace-nowrap">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date().toLocaleDateString('en-GB', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-')}
                    </td>
                    <td className="px-4 py-3 font-medium capitalize">{r.Coordinator}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.Target_30_120)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.Achievement_30_120)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.Target_121_Plus)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(r.Achievement_121_Plus)}</td>
                    <td className="px-4 py-3 text-right font-bold text-primary">{r.KPI_Score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Parsed-data dump for whoever is working on the parser; never in a build. */}
      {result && import.meta.env.DEV && (
        <Card className="mt-8 p-4">
          <details>
            <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
              Developer Debug (Show Parsed Data)
            </summary>
            <div className="mt-4 overflow-x-auto text-xs font-mono bg-muted/30 p-2 rounded">
              <h4 className="font-bold mb-2">RAW PARSED RESULTS:</h4>
              {JSON.stringify(result.results.map(r => ({
                Name: r.Coordinator,
                'Old 31-60...91-120': r.Old_Sum_30_120,
                'New 31-60...91-120': r.New_Sum_30_120,
                'Tgt 30-120': r.Target_30_120,
                'Old 121+': r.Old_121_Plus,
                'New 121+': r.New_121_Plus,
                'Tgt 121+': r.Target_121_Plus
              })), null, 2)}
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
