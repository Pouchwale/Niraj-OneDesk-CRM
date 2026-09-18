import { describe, it, expect } from 'vitest';
import { calculateCollectionsKpi, KpiInputRow } from './kpi-calculator';

describe('calculateCollectionsKpi', () => {
  it('should calculate proportional scores based on Excel formula', () => {
    // Target = 100, Achieved = 50 => Ratio 0.5 => 25 points
    expect(calculateCollectionsKpi(
      [{ Coordinator: 'Proportional', '31-60': 0, '61-90': 0, '91-120': 0, '121+': 0, 'Target 0-120': 100, '121+ Target': 100 }],
      [{ Coordinator: 'Proportional', '31-60': -50, '61-90': 0, '91-120': 0, '121+': -50 }] // Achieve = Old - New = 0 - (-50) = 50
    ).results[0].Points_30_120).toBe(25);
  });

  it('should handle Aniketa correctly (from image)', () => {
    // Aniketa Target 30-120: 572156, Achieve: 856359 -> 50 points
    // Target 121+: 636772, Achieve: -1618498 -> 0 points
    const { results } = calculateCollectionsKpi(
      [{ Coordinator: 'Aniketa', '31-60': 0, '61-90': 0, '91-120': 0, '121+': 0, 'Target 0-120': 572156, '121+ Target': 636772 }],
      [{ Coordinator: 'Aniketa', '31-60': -856359, '61-90': 0, '91-120': 0, '121+': 1618498 }] 
    );
    expect(results[0].Points_30_120).toBe(50);
    expect(results[0].Points_121_Plus).toBe(0);
    expect(results[0].KPI_Score).toBe(50);
  });

  it('should handle Devyani Vaghela correctly (from image)', () => {
    // Devyani Target 30-120: -42524, Achieve: 579570 -> 0 points
    // Target 121+: 545740, Achieve: -2832285 -> 0 points
    const { results } = calculateCollectionsKpi(
      [{ Coordinator: 'Devyani Vaghela', '31-60': 0, '61-90': 0, '91-120': 0, '121+': 0, 'Target 0-120': -42524, '121+ Target': 545740 }],
      [{ Coordinator: 'Devyani Vaghela', '31-60': -579570, '61-90': 0, '91-120': 0, '121+': 2832285 }] 
    );
    expect(results[0].Points_30_120).toBe(0);
    expect(results[0].Points_121_Plus).toBe(0);
    expect(results[0].KPI_Score).toBe(0);
  });

  it('should handle Foram Prajapati correctly (from image)', () => {
    // Bucket 1: 30-120 Days
    // Target: 213,677, Achieved: 5,090 -> 1.19 points
    // Bucket 2: 120+ Days
    // Target: 270,941, Achieved: 82,590 -> 15.24 points
    // Total: 16.43
    const { results } = calculateCollectionsKpi(
      [{ Coordinator: 'Foram Prajapati', '31-60': 0, '61-90': 0, '91-120': 0, '121+': 0, 'Target 0-120': 213677, '121+ Target': 270941 }],
      [{ Coordinator: 'Foram Prajapati', '31-60': -5090, '61-90': 0, '91-120': 0, '121+': -82590 }] // 0 - (-5090) = 5090 achievement
    );
    expect(results[0].Points_30_120).toBe(1.19);
    expect(results[0].Points_121_Plus).toBe(15.24);
    expect(results[0].KPI_Score).toBe(16.43);
  });

  it('should flag excluded coordinators', () => {
    const oldData: KpiInputRow[] = [{
      Coordinator: 'UserOnlyInOld',
      '31-60': 100, '61-90': 0, '91-120': 0, '121+': 100
    }];
    
    const newData: KpiInputRow[] = [{
      Coordinator: 'UserOnlyInNew',
      '31-60': 150, '61-90': 0, '91-120': 0, '121+': 50
    }];

    const { results, flags } = calculateCollectionsKpi(oldData, newData);
    
    expect(results).toHaveLength(0);
    expect(flags).toContain('Coordinator excluded (missing from NEW table): UserOnlyInOld');
    expect(flags).toContain('Coordinator excluded (missing from OLD table): UserOnlyInNew');
  });
  
  it('should flag and abort if OLD and NEW are identical', () => {
    const oldData: KpiInputRow[] = [{
      Coordinator: 'User1',
      '31-60': 100, '61-90': 0, '91-120': 0, '121+': 100
    }];
    
    const newData: KpiInputRow[] = [{
      Coordinator: 'User1',
      '31-60': 100, '61-90': 0, '91-120': 0, '121+': 100
    }];

    const { results, flags } = calculateCollectionsKpi(oldData, newData);
    
    expect(results).toHaveLength(0);
    expect(flags).toContain('WARNING: OLD and NEW tables are identical. Check upload files.');
  });
});
