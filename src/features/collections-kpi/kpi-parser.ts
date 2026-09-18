import * as XLSX from 'xlsx';
import { cleanCellValue } from '@/lib/file-parser';
import { KpiInputRow } from './kpi-calculator';

export async function parseKpiFile(file: File): Promise<KpiInputRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error('File content is empty.');

        const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: true });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error('No worksheets found in Excel file.');

        const worksheet = workbook.Sheets[firstSheetName];
        // Read as array of arrays to handle files with title rows before headers
        const jsonRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
        
        if (!jsonRows || jsonRows.length === 0) {
          throw new Error('File contains no rows.');
        }

        const parsedRows: KpiInputRow[] = [];
        let headerRowIndex = -1;
        let headerMap = new Map<string, number>();

        // 1. Find the header row
        for (let i = 0; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!Array.isArray(row)) continue;
          
          const cleanedRow = row.map(cleanCellValue).map(s => s.toLowerCase());
          
          // A valid header row should have a coordinator column
          const hasCoordinator = cleanedRow.some(s => s.includes('coordinator') || s.includes('name'));
          // AND either raw aging buckets (31-60) or summary columns (target/achive 30-120)
          const hasRawBuckets = cleanedRow.some(s => s.includes('31-60') || s.includes('31 - 60'));
          const hasSummaryColumns = cleanedRow.some(s => 
            (s.includes('target') && (s.includes('30') || s.includes('120'))) ||
            (s.includes('achive') || s.includes('achieve'))
          );
          
          if (hasCoordinator && (hasRawBuckets || hasSummaryColumns)) {
            headerRowIndex = i;
            // Map the headers to their column index
            cleanedRow.forEach((colName, idx) => {
               if (colName) headerMap.set(colName, idx);
            });
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new Error("Could not find a valid header row. Expected columns like 'Coordinator Name' with either aging buckets (31-60, 61-90, etc.) or summary columns (Target 30-120, Achive 30-120).");
        }

        // Helper to get index for a list of possible keyword combinations
        const getColIdx = (keywordCombos: string[][], excludeTarget: boolean = false, excludeKeywords: string[] = []): number => {
          for (const [colName, idx] of headerMap.entries()) {
             // Strip everything except letters and numbers
             const normalizedCol = colName.replace(/[^a-z0-9]/g, '');
             if (excludeTarget && normalizedCol.includes('target')) continue;
             if (excludeKeywords.some(kw => normalizedCol.includes(kw))) continue;
             
             // A combo matches if ALL its keywords are found in the column name
             if (keywordCombos.some(combo => {
                 return combo.every(kw => {
                     const normalizedKw = kw.replace(/[^a-z0-9]/g, '');
                     return normalizedCol.includes(normalizedKw);
                 });
             })) {
                return idx;
             }
          }
          return -1;
        };

        const coordIdx = getColIdx([['coordinator'], ['name']]);
        const balDueIdx = getColIdx([['balance', 'due']], true);
        const b0_30Idx = getColIdx([['0', '30']], true, ['achive', 'achieve', 'target']);
        const b31_60Idx = getColIdx([['31', '60']], true, ['achive', 'achieve', 'target']);
        const b61_90Idx = getColIdx([['61', '90']], true, ['achive', 'achieve', 'target']);
        const b91_120Idx = getColIdx([['91', '120']], true, ['achive', 'achieve', 'target']);
        
        // Prevent '120' from incorrectly substring-matching '91-120', '0 to 120', 'Achive', etc.
        const b121Idx = getColIdx([['121'], ['120']], true, ['91120', '0120', '30120', 'achive', 'achieve', 'target']);
        
        // Also look for explicit Achieve columns in case they upload the summary file
        const a30_120Idx = getColIdx([['achive', '30', '120'], ['achieve', '30', '120'], ['achive', '30120'], ['achieve', '30120']]);
        const a121Idx = getColIdx([['achive', '121'], ['achieve', '121'], ['achive', '120'], ['achieve', '120']]);
        
        // Target columns might be tricky. Let's be extremely lenient.
        // First, explicitly check our expected names.
        let t30_120Idx = getColIdx([['target', '0', '120'], ['target', '30', '120'], ['target', '30120'], ['collection', 'target']]);
        let t121Idx = getColIdx([['target', '121'], ['target', '120']], false, ['0', '30']);
        
        // If still not found, let's find any column containing "target"
        if (t30_120Idx === -1 || t121Idx === -1) {
            const targetCols: {name: string, idx: number}[] = [];
            for (const [colName, idx] of headerMap.entries()) {
                const norm = colName.replace(/[^a-z0-9]/g, '');
                if (norm.includes('target')) {
                    targetCols.push({name: norm, idx});
                }
            }
            
            // Try to deduce which is which
            for (const col of targetCols) {
                if (col.name.includes('121') || col.name.includes('120')) {
                    // Check if it's explicitly the 0-120 or 30-120 one before assigning to 121
                    if (col.name.includes('0120') || col.name.includes('30120') || col.name.includes('0to120')) {
                        t30_120Idx = col.idx;
                    } else {
                        t121Idx = col.idx;
                    }
                }
            }
            
            // If they just named them "Target 1" and "Target 2" or something
            if (targetCols.length >= 2) {
                if (t30_120Idx === -1) t30_120Idx = targetCols[0].idx;
                if (t121Idx === -1) t121Idx = targetCols[1].idx;
            } else if (targetCols.length === 1) {
                // If there's only one target column, maybe it's just the 30-120 target?
                if (t30_120Idx === -1 && t121Idx === -1) {
                    t30_120Idx = targetCols[0].idx;
                }
            }
        }
        
        // We also want to capture the raw headers found to help debug if it fails
        const headersFound = Array.from(headerMap.keys()).join(', ');

        // 2. Parse data rows
        for (let i = headerRowIndex + 1; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!Array.isArray(row)) continue;
          
          if (coordIdx === -1) continue;
          
          const coordinatorName = cleanCellValue(row[coordIdx]);
          if (!coordinatorName) continue; // Skip blank names
          if (coordinatorName.toLowerCase().includes('total')) continue; // Skip total row

          const getNum = (idx: number): number => {
            if (idx === -1) return 0;
            const valStr = String(row[idx]).trim();
            // Check for explicit negative formats like (100) or 100- (SAP trailing minus)
            const isParenNegative = valStr.includes('(') && valStr.includes(')');
            const isTrailingMinus = valStr.endsWith('-');
            
            // Strip everything except numbers, dots, and standard leading minuses
            let cleanStr = valStr.replace(/[^0-9.-]/g, '');
            // If it had a trailing minus, it will still be at the end, so remove it to avoid parseFloat ignoring it
            if (isTrailingMinus && cleanStr.endsWith('-')) {
               cleanStr = cleanStr.slice(0, -1);
            }
            
            let val = parseFloat(cleanStr);
            
            // Apply negativity if it was trailing minus or parenthesis
            if ((isParenNegative || isTrailingMinus) && !isNaN(val)) {
                val = -Math.abs(val);
            }
            
            return isNaN(val) ? 0 : val;
          };

          const t30_120 = getNum(t30_120Idx);
          const t121 = getNum(t121Idx);
          const a30_120 = getNum(a30_120Idx);
          const a121 = getNum(a121Idx);

          parsedRows.push({
            Coordinator: coordinatorName,
            'Balance Due': getNum(balDueIdx),
            '0-30': getNum(b0_30Idx),
            '31-60': getNum(b31_60Idx),
            '61-90': getNum(b61_90Idx),
            '91-120': getNum(b91_120Idx),
            '121+': getNum(b121Idx),
            'Target 0-120': t30_120,
            '121+ Target': t121,
            'Achieve 30-120': a30_120 !== 0 ? a30_120 : undefined,
            'Achieve 121+': a121 !== 0 ? a121 : undefined
          });
        }

        resolve(parsedRows);
      } catch (err: any) {
        reject(new Error(`${err?.message || 'Invalid format'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file from disk.'));
    reader.readAsArrayBuffer(file);
  });
}
