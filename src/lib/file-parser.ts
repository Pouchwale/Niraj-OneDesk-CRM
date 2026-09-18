import * as XLSX from 'xlsx';
import { OTIF_CATEGORIES, OtifCategory, OtifTargetField, OTIF_TARGET_SCHEMA } from '@/lib/otif-schema';
import { autoMapColumns } from '@/lib/column-mapper';

export interface ParsedOtifRow {
  po_no: string;
  so_no: string;
  so_date?: string;
  po_due_date?: string;
  po_closed_date?: string;
  delay_day: number;
  delay_bucket: string;
  otif_score: 'YES' | 'NO';
  day_committed?: string;
  customer_name: string;
  open_order_qty: number;
  relation_manager: string;
  remarks?: string;
  category: OtifCategory;
  raw_details: Record<string, string>; // Captures 100% of ALL columns from the Excel file
  _category: OtifCategory | null;
  _rowIndex: number;
}

export interface ParseResult {
  rows: ParsedOtifRow[];
  errors: string[];
  mappedColumns: { headerName: string; fieldLabel: string; colIndex: number }[];
  summary: { total: number; byCategory: Record<string, number> };
}

export function cleanCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The calendar date a spreadsheet cell means, whichever way it was built.
 *
 * A cell holding "2 March" is a date, not an instant, but the reader turns it
 * into one — and which instant depends on how the workbook was opened. Reading
 * from a file path gives midnight UTC; reading from bytes, which is what the
 * browser always does, gives midnight *local*, i.e. 18:30 the previous day in
 * India. Taking the UTC date of that second kind moved every due date, invoice
 * date and therefore every status and overdue count one day early.
 *
 * So the instant is read back the same way it was written: exactly-midnight-UTC
 * is a UTC-built date, anything else was built locally.
 */
export function calendarDateOf(date: Date): string {
  const builtInUtc =
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;

  const year = builtInUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = (builtInUtc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = builtInUtc ? date.getUTCDate() : date.getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return calendarDateOf(val);
  }

  if (typeof val === 'number') {
    if (val < 1000) return null;
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  const str = cleanCellValue(val);
  if (!str) return null;

  const directDate = new Date(str);
  if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 1990) {
    const y = directDate.getFullYear();
    const m = String(directDate.getMonth() + 1).padStart(2, '0');
    const dd = String(directDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    let day: number, month: number, year: number;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
    }
    
    // Handle MM/DD/YYYY gracefully
    if (month > 11 && day <= 12) {
      const temp = month + 1;
      month = day - 1;
      day = temp;
    }

    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }
  }

  return null;
}

/**
 * Resilient Section Category Detector: Matches FG-label, FG-sleeve, FG-laminate section titles
 */
export function detectSectionCategory(row: unknown[]): OtifCategory | null {
  for (const cell of row) {
    const text = cleanCellValue(cell).toLowerCase().replace(/\s+/g, '');
    if (!text) continue;

    if (text.includes('fg-sleeve') || text.includes('fgsleeve') || text.includes('fg_sleeve') || text.includes('sleeve')) {
      return 'FG - Sleeves';
    }

    if (text.includes('fg-laminate') || text.includes('fglaminate') || text.includes('fg_laminate') || text.includes('laminat') || text.includes('pouch')) {
      return 'FG - Laminates';
    }

    if (text.includes('fg-label') || text.includes('fglabel') || text.includes('fg_label') || text.includes('label') || text.includes('sticker')) {
      return 'FG - Label';
    }
  }
  return null;
}

export function categorizeByKeywords(rowText: string, categoryCellVal?: string): OtifCategory {
  const combined = ((categoryCellVal || '') + ' ' + rowText).toLowerCase();

  if (combined.includes('sleeve') || combined.includes('shrink sleeve') || combined.includes('pvc sleeve') || combined.includes('pet sleeve')) {
    return 'FG - Sleeves';
  }

  if (combined.includes('laminate') || combined.includes('pouch') || combined.includes('foil') || combined.includes('structure') || combined.includes('multilayer')) {
    return 'FG - Laminates';
  }

  if (combined.includes('label') || combined.includes('sticker') || combined.includes('flexo') || combined.includes('self-adhesive')) {
    return 'FG - Label';
  }

  return 'FG - Label';
}

export function computeDelayBucket(delayDays: number): string {
  if (delayDays <= 0) return 'On-Time / Early';
  if (delayDays <= 3) return '1-3 Days Late';
  if (delayDays <= 7) return '4-7 Days Late';
  if (delayDays <= 10) return '8-10 Days Late';
  return '10+ Days Late';
}

/**
 * Checks if a row is a true column header row rather than a data row
 */
export function isHeaderRowCandidate(row: unknown[]): boolean {
  const cleaned = row.map(cleanCellValue);
  const nonBlank = cleaned.filter(Boolean);
  if (nonBlank.length < 2) return false;

  let textLabelCount = 0;
  for (const cell of nonBlank) {
    const s = cell.toLowerCase();
    if (
      s === 'po' || s === 'so' || s === 'no' || s === 'number' || s.includes('po ') || s.includes('so ') ||
      s.includes('customer') || s.includes('cardname') || s.includes('docnum') || s.includes('due date') ||
      s.includes('order date') || s.includes('delivery date') || s.includes('qty') || s.includes('quantity') ||
      s.includes('manager') || s.includes('remarks') || s.includes('delay')
    ) {
      textLabelCount++;
    }
  }
  return textLabelCount >= 2;
}

export async function parseOtifFile(file: File): Promise<ParseResult> {
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
        const jsonRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (!jsonRows || jsonRows.length === 0) {
          throw new Error('File contains no rows.');
        }

        const errors: string[] = [];
        const parsedRows: ParsedOtifRow[] = [];
        const summary = { total: 0, byCategory: {} as Record<string, number> };

        OTIF_CATEGORIES.forEach((cat) => {
          summary.byCategory[cat] = 0;
        });

        let currentSectionCategory: OtifCategory | null = null;
        let activeHeaderRowIndex: number | null = null;
        let activeColumnMapping: Map<number, OtifTargetField> | null = null;
        const mappedColumnsList: { headerName: string; fieldLabel: string; colIndex: number }[] = [];

        // Scan rows for data extraction
        for (let i = 0; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          if (!row || !Array.isArray(row)) continue;

          const cleanedCells = row.map(cleanCellValue);
          const nonBlankCells = cleanedCells.filter(Boolean);
          if (nonBlankCells.length === 0) continue;

          // 1. Check if row is a Product Section Header or if the first cell defines a new section
          const firstCellText = (cleanedCells[0] || '').toLowerCase().replace(/\s+/g, '');
          const secCat = detectSectionCategory([cleanedCells[0]]); // Only check the first cell to avoid false positives from Customer Name
          
          if (secCat) {
            // If it's explicitly starting with FG-, it's a section change
            if (firstCellText.startsWith('fg-') || firstCellText.startsWith('fg_') || firstCellText.startsWith('fgl') || firstCellText.startsWith('fgs')) {
              currentSectionCategory = secCat;
            } else if (nonBlankCells.length <= 3) {
              currentSectionCategory = secCat;
            }
          }

          if (secCat && nonBlankCells.length <= 3) {
            continue;
          }

          // 2. Header Row Detection: Only map headers if activeColumnMapping is null or if this is explicitly a header row candidate
          if (activeColumnMapping === null || isHeaderRowCandidate(row)) {
            const candidateMapping = autoMapColumns(cleanedCells, OTIF_TARGET_SCHEMA);
            if (candidateMapping.size >= 2) {
              activeColumnMapping = candidateMapping;
              activeHeaderRowIndex = i;

              candidateMapping.forEach((field, colIdx) => {
                const headerName = cleanedCells[colIdx] || field.label;
                if (!mappedColumnsList.some((m) => m.colIndex === colIdx)) {
                  mappedColumnsList.push({
                    headerName,
                    fieldLabel: field.label,
                    colIndex: colIdx,
                  });
                }
              });
              continue; // Skip header row itself
            }
          }

          // Skip if this row is the active header row
          if (i === activeHeaderRowIndex) continue;

          // Filter out total/summary rows
          const firstCellLower = nonBlankCells[0]?.toLowerCase() || '';
          if (firstCellLower.includes('total') || firstCellLower.includes('grand total') || firstCellLower.includes('subtotal') || firstCellLower.includes('count')) {
            continue;
          }

          // Filter out grouped subtotal rows (like '88641 83.33%') which only have 2 or 3 columns of data
          if (nonBlankCells.length < 4) {
            continue;
          }

          // 3. Extract 100% of Raw Details
          const rawDetails: Record<string, string> = {};
          if (activeHeaderRowIndex !== null && jsonRows[activeHeaderRowIndex]) {
            const headerRow = jsonRows[activeHeaderRowIndex].map(cleanCellValue);
            row.forEach((cellVal, colIdx) => {
              const headerName = headerRow[colIdx] || `Column ${colIdx + 1}`;
              const cleanedVal = cleanCellValue(cellVal);
              if (cleanedVal !== '') {
                rawDetails[headerName] = cleanedVal;
              }
            });
          } else {
            cleanedCells.forEach((val, colIdx) => {
              if (val !== '') {
                rawDetails[`Column ${colIdx + 1}`] = val;
              }
            });
          }

          // 4. Extract Mapped Schema Fields
          const extracted: Record<string, any> = {};
          let hasMappedValues = false;

          if (activeColumnMapping && activeColumnMapping.size > 0) {
            activeColumnMapping.forEach((field, colIdx) => {
              const rawVal = row[colIdx];
              const cleanedVal = cleanedCells[colIdx];

              if (cleanedVal !== '') {
                hasMappedValues = true;
                if (field.type === 'date') {
                  extracted[field.key] = normalizeDate(rawVal);
                } else if (field.type === 'number') {
                  const num = typeof rawVal === 'number' ? rawVal : parseFloat(cleanedVal.replace(/[^0-9.-]/g, ''));
                  extracted[field.key] = isNaN(num) ? 0 : num;
                } else {
                  extracted[field.key] = cleanedVal;
                }
              }
            });
          }

          if (!hasMappedValues && Object.keys(rawDetails).length === 0) continue;

          // 5. Product Category Resolution
          const rowFullText = nonBlankCells.join(' ');
          let finalCategory: OtifCategory = 'FG - Label';

          if (currentSectionCategory) {
            finalCategory = currentSectionCategory;
          } else {
            finalCategory = categorizeByKeywords(rowFullText, extracted.category);
          }

          // Resolve Values (Exact file values preserved)
          let poNo = extracted.po_no || rawDetails['PO Number'] || rawDetails['DocNum'] || rawDetails['Column 1'] || `Unknown-PO-${i}`;
          if (typeof poNo === 'string' && poNo.toLowerCase().startsWith('fg')) {
            poNo = `Unknown-PO-${i}`;
          }
          const soNo = extracted.so_no || rawDetails['SO Number'] || rawDetails['Column 2'] || poNo;
          const customerName = extracted.customer_name || rawDetails['Customer Name'] || rawDetails['CardName'] || 'Unknown Customer';

          // Resolve Dates
          const dueDate = extracted.po_due_date || rawDetails['PO Due Date'] || rawDetails['DocDueDate'] || '';
          const closedDate = extracted.po_closed_date || rawDetails['PO Closed Date'] || dueDate;
          const soDate = extracted.so_date || rawDetails['SO Date'] || dueDate;

          // 6. Compute Delay Days Accurately from Excel Column or Key Search
          let delayDay = 0;

          if (extracted.delay_day !== undefined && extracted.delay_day !== null && extracted.delay_day !== '') {
            const parsedNum = typeof extracted.delay_day === 'number' ? extracted.delay_day : parseFloat(String(extracted.delay_day).replace(/[^0-9.-]/g, ''));
            if (!isNaN(parsedNum)) delayDay = parsedNum;
          } else {
            // Search rawDetails keys for any column containing delay, late, overdue, or variance
            for (const [key, val] of Object.entries(rawDetails)) {
              const k = key.toLowerCase();
              if (k.includes('delay') || k.includes('late') || k.includes('overdue') || k.includes('lateness') || k.includes('variance')) {
                const parsedNum = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
                if (!isNaN(parsedNum)) {
                  delayDay = parsedNum;
                  break;
                }
              }
            }
          }

          // Fallback to Date Math ONLY if raw delay column was not found
          if (delayDay === 0 && extracted.po_due_date && extracted.po_closed_date && extracted.po_due_date !== extracted.po_closed_date) {
            const dueMs = new Date(extracted.po_due_date).getTime();
            const closedMs = new Date(extracted.po_closed_date).getTime();
            if (!isNaN(dueMs) && !isNaN(closedMs)) {
              delayDay = Math.round((closedMs - dueMs) / (1000 * 60 * 60 * 24));
            }
          }

          // 7. Resolve OTIF Score directly from user's file if present (YES/NO)
          let otifScore: 'YES' | 'NO' = 'NO';
          let rawOtifScore = extracted.otif_score;
          if (!rawOtifScore) {
            for (const [key, val] of Object.entries(rawDetails)) {
              const k = key.toLowerCase();
              if (k.includes('otif') || k.includes('score') || k === 'on time' || k === 'status') {
                rawOtifScore = val;
                break;
              }
            }
          }
          
          if (rawOtifScore) {
            const normalizedScore = String(rawOtifScore).trim().toUpperCase();
            if (normalizedScore === 'YES' || normalizedScore === 'Y' || normalizedScore === 'ON TIME') {
              otifScore = 'YES';
              if (delayDay > 0) delayDay = 0; // Force delay to 0 if OTIF is YES
            } else if (normalizedScore === 'NO' || normalizedScore === 'N' || normalizedScore === 'LATE' || normalizedScore === 'DELAYED') {
              otifScore = 'NO';
              if (delayDay <= 0) delayDay = 1; // Force delay to at least 1 day if OTIF is NO
            } else {
              otifScore = delayDay <= 0 ? 'YES' : 'NO';
            }
          } else {
            // Fallback: compute from delayDay if no explicit OTIF Score column exists
            otifScore = delayDay <= 0 ? 'YES' : 'NO';
          }

          const delayBucket = computeDelayBucket(delayDay);

          // Resolve Quantity
          let openOrderQty = typeof extracted.open_order_qty === 'number' ? extracted.open_order_qty : 0;
          if (openOrderQty === 0) {
            for (const [key, val] of Object.entries(rawDetails)) {
              const k = key.toLowerCase();
              if (k.includes('qty') || k.includes('quantity') || k.includes('count') || k.includes('pcs')) {
                const parsedNum = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
                if (!isNaN(parsedNum) && parsedNum > 0) {
                  openOrderQty = parsedNum;
                  break;
                }
              }
            }
          }
          if (openOrderQty === 0) openOrderQty = 0;

          let relationManager = extracted.relation_manager || rawDetails['Relation Manager'] || rawDetails['SlpName'];
          if (!relationManager) {
            for (const [key, val] of Object.entries(rawDetails)) {
              const k = key.toLowerCase();
              if (k.includes('manager') || k.includes('coordinator') || k.includes('sales rep') || k.includes('executive')) {
                relationManager = val;
                break;
              }
            }
          }
          if (!relationManager) relationManager = 'Unassigned';

          const parsedRow: ParsedOtifRow = {
            po_no: poNo,
            so_no: soNo,
            so_date: soDate,
            po_due_date: dueDate,
            po_closed_date: closedDate,
            delay_day: delayDay,
            delay_bucket: delayBucket,
            otif_score: otifScore,
            day_committed: extracted.day_committed || rawDetails['Day Committed'] || '',
            customer_name: customerName,
            open_order_qty: openOrderQty,
            relation_manager: relationManager,
            remarks: extracted.remarks || rawDetails['Remarks'] || '',
            category: finalCategory,
            raw_details: rawDetails,
            _category: finalCategory,
            _rowIndex: i + 1,
          };

          parsedRows.push(parsedRow);
          summary.total++;
          summary.byCategory[finalCategory] = (summary.byCategory[finalCategory] || 0) + 1;
        }

        // Refuse a file that is not an OTIF report. The header matcher is
        // generous by design (SAP exports vary), which meant any spreadsheet
        // with a customer column once produced a confident, empty dashboard.
        const mappedKeys = new Set(
          OTIF_TARGET_SCHEMA.filter((f) => mappedColumnsList.some((m) => m.fieldLabel === f.label)).map((f) => f.key)
        );
        const missingRequired = OTIF_TARGET_SCHEMA.filter((f) => f.required && !mappedKeys.has(f.key)).map((f) => f.label);
        const timingKeys = ['po_due_date', 'po_closed_date', 'delay_day'];
        const hasTiming = timingKeys.some((k) => mappedKeys.has(k));
        if (missingRequired.length > 0 || !hasTiming) {
          const wanted = [...missingRequired, ...(hasTiming ? [] : ['a due date, closed date or delay-days column'])];
          reject(new Error(`This does not look like an OTIF delivery report. Could not find: ${wanted.join(', ')}.`));
          return;
        }

        if (parsedRows.length === 0) {
          errors.push('Could not extract data rows. Please check worksheet formatting.');
        }

        resolve({
          rows: parsedRows,
          errors,
          mappedColumns: mappedColumnsList,
          summary,
        });
      } catch (err: any) {
        reject(new Error(`Failed to parse Excel file: ${err?.message || 'Invalid format'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file from disk.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Normalizes a header for fuzzy comparison: lowercase, alphanumeric only. */
export function normalizeHeader(h: string): string {
  if (h === null || h === undefined) return '';
  return String(h).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

export interface SheetParseResult {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface GenericParseResult extends SheetParseResult {
  /** Every sheet in the workbook, so the UI can offer a picker. */
  sheetNames: string[];
  /** Parsed content of each sheet, keyed by name. */
  sheets: SheetParseResult[];
  /** True when the chosen sheet was auto-detected rather than requested. */
  autoSelected: boolean;
}

export interface ParseFileOptions {
  /** Parse this sheet instead of auto-detecting one. */
  sheetName?: string;
  /**
   * Ranks a candidate sheet; the highest score is parsed. Callers pass a scorer
   * that counts how many required target fields the headers map to, which is far
   * more reliable than shape alone.
   */
  scoreSheet?: (sheet: SheetParseResult) => number;
}

/**
 * Scores a sheet row on how much it looks like a header row: mostly non-empty
 * short text cells, few pure numbers, few dates.
 */
function headerRowScore(row: unknown[]): number {
  if (!row || row.length === 0) return -1;
  const cells = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
  if (cells.length < 2) return -1;

  let score = cells.length;
  for (const cell of cells) {
    if (cell instanceof Date) { score -= 3; continue; }
    if (typeof cell === 'number') { score -= 2; continue; }
    const str = String(cell).trim();
    if (/^-?[\d,.]+$/.test(str)) { score -= 2; continue; }
    if (str.length > 60) { score -= 2; continue; }
    score += 1;
  }
  return score;
}

/** Finds the most likely header row within the first 20 rows of a sheet. */
function detectHeaderRowIndex(rows: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = -Infinity;
  const limit = Math.min(rows.length, 20);

  for (let i = 0; i < limit; i++) {
    const score = headerRowScore(rows[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore <= 0 ? 0 : bestIndex;
}

/** Makes header names unique and non-empty so they can key a row object. */
function buildHeaderNames(headerRow: unknown[], width: number): string[] {
  const seen = new Map<string, number>();
  const headers: string[] = [];

  for (let i = 0; i < width; i++) {
    let name = cleanCellValue(headerRow?.[i]);
    if (!name) name = `Column ${i + 1}`;

    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) name = `${name} (${count + 1})`;

    headers.push(name);
  }
  return headers;
}

/**
 * Finds the requested sheet, forgivingly.
 *
 * A tab called "CRM OverDue" gets typed into a settings file as "CRM Overdue",
 * or with a stray space, and Excel itself does not care about either. Refusing
 * the whole import over the shift key would be pedantry, so an exact match wins
 * and a case- and space-insensitive one is accepted after it.
 */
export function findSheet(sheets: SheetParseResult[], wanted: string): SheetParseResult | undefined {
  const exact = sheets.find((sheet) => sheet.sheetName === wanted);
  if (exact) return exact;

  const loose = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
  const target = loose(wanted);
  return sheets.find((sheet) => loose(sheet.sheetName) === target);
}

/** Parses one worksheet into header-keyed rows. */
function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): SheetParseResult {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as unknown[][];

  if (matrix.length === 0) {
    return { sheetName, headers: [], rows: [], totalRows: 0 };
  }

  const headerIndex = detectHeaderRowIndex(matrix);
  const headerRow = matrix[headerIndex] ?? [];
  const dataRows = matrix.slice(headerIndex + 1);

  const width = Math.max(headerRow.length, ...dataRows.map((r) => r?.length ?? 0), 0);
  if (width === 0) {
    return { sheetName, headers: [], rows: [], totalRows: 0 };
  }

  const headers = buildHeaderNames(headerRow, width);

  const rows: Record<string, unknown>[] = [];
  for (const raw of dataRows) {
    if (!raw) continue;
    const isBlank = raw.every((c) => c === null || c === undefined || String(c).trim() === '');
    if (isBlank) continue;

    const obj: Record<string, unknown> = {};
    for (let i = 0; i < width; i++) {
      obj[headers[i]] = raw[i] ?? null;
    }
    rows.push(obj);
  }

  return { sheetName, headers, rows, totalRows: rows.length };
}

/**
 * Fallback ranking when the caller supplies no scorer: prefer wide sheets with
 * many rows. A dropdown/lookup sheet is typically one or two narrow columns, so
 * this keeps it from beating the real data sheet.
 */
function defaultSheetScore(sheet: SheetParseResult): number {
  if (sheet.totalRows === 0 || sheet.headers.length === 0) return -1;
  const columnScore = Math.min(sheet.headers.length, 30) * 10;
  const rowScore = Math.min(sheet.totalRows, 500);
  return columnScore + rowScore;
}

/**
 * Generic spreadsheet/CSV parser used by the Companies and Overdue uploads.
 *
 * Workbooks that use dropdowns usually carry a separate list/lookup sheet for
 * the data-validation source, and Excel often orders it first - so the sheet is
 * chosen by how well it scores, not by position.
 */
export async function parseFile(
  file: File,
  options: ParseFileOptions = {}
): Promise<GenericParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) throw new Error('The file contains no sheets.');

  const sheets = sheetNames.map((name) => parseSheet(workbook.Sheets[name], name));

  if (options.sheetName) {
    const requested = findSheet(sheets, options.sheetName);
    if (!requested) {
      // Naming the sheets that are there turns "it does not work" into a typo
      // somebody can fix in ten seconds.
      throw new Error(
        `The file has no sheet named "${options.sheetName}". It has: ${sheetNames.map((n) => `"${n}"`).join(', ')}.`
      );
    }
    if (requested.totalRows === 0) {
      throw new Error(`Sheet "${requested.sheetName}" has no data rows.`);
    }
    return { ...requested, sheetNames, sheets, autoSelected: false };
  }

  const score = options.scoreSheet ?? defaultSheetScore;
  let best = sheets[0];
  let bestScore = -Infinity;

  for (const sheet of sheets) {
    if (sheet.totalRows === 0) continue;
    // Break ties on shape so a scorer returning 0 everywhere still picks sensibly.
    const value = score(sheet) * 1000 + defaultSheetScore(sheet);
    if (value > bestScore) {
      bestScore = value;
      best = sheet;
    }
  }

  if (!best || best.totalRows === 0) {
    throw new Error('No sheet in this file contains any data rows.');
  }

  return { ...best, sheetNames, sheets, autoSelected: sheetNames.length > 1 };
}
