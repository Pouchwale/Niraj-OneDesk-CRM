export interface KpiInputRow {
  Coordinator: string;
  'Balance Due'?: number;
  '0-30'?: number;
  '31-60': number;
  '61-90': number;
  '91-120': number;
  '121+': number;
  'Target 0-120'?: number; // Only from Old
  '121+ Target'?: number; // Only from Old
  'Achieve 30-120'?: number; // If pre-calculated in summary file
  'Achieve 121+'?: number; // If pre-calculated in summary file
}

export interface KpiResultRow {
  Coordinator: string;
  Old_Sum_30_120: number;
  New_Sum_30_120: number;
  Achievement_30_120: number;
  Target_30_120: number;
  Points_30_120: number;
  
  Old_121_Plus: number;
  New_121_Plus: number;
  Achievement_121_Plus: number;
  Target_121_Plus: number;
  Points_121_Plus: number;
  
  KPI_Score: number;
}

export interface KpiCalculationResult {
  results: KpiResultRow[];
  flags: string[];
}

// Calculates the score for a single bucket based on the exact Excel formula:
// =MIN(1,MAX(0, Ach/Tgt))*50
function calculateBucketScore(target: number, achieved: number): number {
  if (isNaN(target) || isNaN(achieved)) {
    return 0;
  }

  let ratio = achieved / target;
  
  // Handle 0/0 or other NaN cases explicitly
  if (isNaN(ratio)) {
    ratio = 0; // If target=0 and achieved=0, ratio is NaN. Treat as 0.
  }
  
  // Infinity (e.g. achieved=100, target=0) is handled fine by min/max below
  
  const score = Math.min(1, Math.max(0, ratio)) * 50;
  
  // Return rounded to 2 decimal places to match Excel's ROUND(..., 2)
  return Math.round(score * 100) / 100;
}

export function calculateCollectionsKpi(
  oldData: KpiInputRow[],
  newData: KpiInputRow[]
): KpiCalculationResult {
  const flags: string[] = [];
  const results: KpiResultRow[] = [];
  
  // Check if identical
  if (oldData.length > 0 && newData.length > 0 && JSON.stringify(oldData) === JSON.stringify(newData)) {
    flags.push("WARNING: OLD and NEW tables are identical. Check upload files.");
    return { results: [], flags };
  }

  const oldMap = new Map<string, KpiInputRow>();
  for (const row of oldData) {
    if (row.Coordinator) oldMap.set(row.Coordinator.trim().toLowerCase(), row);
  }

  const newMap = new Map<string, KpiInputRow>();
  for (const row of newData) {
    if (row.Coordinator) newMap.set(row.Coordinator.trim().toLowerCase(), row);
  }

  // Find missing coordinators
  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      flags.push(`Coordinator excluded (missing from NEW table): ${oldMap.get(name)?.Coordinator}`);
    }
  }
  for (const [name] of newMap) {
    if (!oldMap.has(name)) {
      flags.push(`Coordinator excluded (missing from OLD table): ${newMap.get(name)?.Coordinator}`);
    }
  }

  // Calculate for intersection (or just Old if it's a summary file)
  for (const [name, oldRow] of oldMap) {
    const newRow = newMap.get(name);
    
    // Check if this is a summary file that already has achievements
    const isSummaryRow = oldRow['Achieve 30-120'] !== undefined || oldRow['Achieve 121+'] !== undefined;
    
    if (!newRow && !isSummaryRow) {
      continue; // Skip missing ONLY if it's not a pre-calculated summary file
    }

    // Step 1 - Sum middle three buckets
    const oldSum30_120 = (oldRow['31-60'] || 0) + (oldRow['61-90'] || 0) + (oldRow['91-120'] || 0);
    const newSum30_120 = newRow ? (newRow['31-60'] || 0) + (newRow['61-90'] || 0) + (newRow['91-120'] || 0) : 0;

    const old121 = oldRow['121+'] || 0;
    const new121 = newRow ? (newRow['121+'] || 0) : 0;

    const target30_120 = oldRow['Target 0-120'] || 0;
    const target121 = oldRow['121+ Target'] || 0;

    // Step 2 - Achievement
    let ach30_120 = 0;
    let ach121 = 0;
    
    // Check if explicit achievements exist in either file
    const newHasAchieve = newRow && (newRow['Achieve 30-120'] !== undefined || newRow['Achieve 121+'] !== undefined);
    const oldHasAchieve = oldRow['Achieve 30-120'] !== undefined || oldRow['Achieve 121+'] !== undefined;

    if (newHasAchieve) {
       ach30_120 = newRow['Achieve 30-120'] || 0;
       ach121 = newRow['Achieve 121+'] || 0;
    } else if (oldHasAchieve) {
       ach30_120 = oldRow['Achieve 30-120'] || 0;
       ach121 = oldRow['Achieve 121+'] || 0;
    } else {
       // The user uploaded raw old/new files without Achieve columns.
       // Based on the user's explicit instructions:
       // ACHIVE 30-120 = (Old 31 to 120) - (New 31 to 120)
       // ACHIVE 121+ = (Old 121+) - (New 121+)
       ach30_120 = oldSum30_120 - newSum30_120;
       ach121 = old121 - new121;
    }

    if (target30_120 === 0) flags.push(`Zero Target for 30-120: ${oldRow.Coordinator}`);
    if (target121 === 0) flags.push(`Zero Target for 121+: ${oldRow.Coordinator}`);

    // Step 3 & 4 - Evaluate Points
    const points30_120 = calculateBucketScore(target30_120, ach30_120);
    const points121 = calculateBucketScore(target121, ach121);

    // Step 5 - KPI Score
    const kpiScore = points30_120 + points121;

    results.push({
      Coordinator: oldRow.Coordinator, // Preserve original casing
      Old_Sum_30_120: oldSum30_120,
      New_Sum_30_120: newSum30_120,
      Achievement_30_120: ach30_120,
      Target_30_120: target30_120,
      Points_30_120: points30_120,
      Old_121_Plus: old121,
      New_121_Plus: new121,
      Achievement_121_Plus: ach121,
      Target_121_Plus: target121,
      Points_121_Plus: points121,
      KPI_Score: kpiScore
    });
  }

  return { results, flags };
}
