import { GlassCard } from '@/components/shared/GlassCard';
import { CircularProgress } from '@/components/shared/CircularProgress';
import { formatPercentage } from '@/lib/utils';
import { type OtifSummary } from '@/lib/demo-data';

interface CategoryBreakdownProps {
  data: OtifSummary['byCategory'];
}

const CATEGORY_COLORS: Record<string, string> = {
  'FG - Label': 'text-blue-500',
  'FG - Sleeves': 'text-violet-500',
  'FG - Laminates': 'text-amber-500',
};

const CATEGORY_BG_COLORS: Record<string, string> = {
  'FG - Label': 'bg-blue-500',
  'FG - Sleeves': 'bg-violet-500',
  'FG - Laminates': 'bg-amber-500',
};

export function CategoryBreakdown({ data }: CategoryBreakdownProps) {
  const categories = Object.entries(data || {}).map(([category, stats]) => ({
    category,
    pct: stats.pct,
    total: stats.total,
    onTime: stats.onTime,
    late: stats.total - stats.onTime
  }));

  return (
    <GlassCard className="p-6 h-full flex flex-col">
      <h3 className="text-lg font-medium mb-6">Category Breakdown</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
        {categories.map((cat) => {
          const colorClass = CATEGORY_COLORS[cat.category] || 'text-emerald-500';
          const bgColorClass = CATEGORY_BG_COLORS[cat.category] || 'bg-emerald-500';
          
          return (
            <div key={cat.category} className="bg-muted/30 rounded-xl p-5 border border-border/50 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-medium text-foreground">{cat.category}</h4>
                <CircularProgress value={cat.pct} size={42} strokeWidth={4} className={colorClass} color={colorClass} />
              </div>
              
              <div className="mb-4">
                <div className={`text-2xl font-bold ${colorClass}`}>
                  {formatPercentage(cat.pct)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">OTIF Score</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total POs</span>
                  <span className="font-medium">{cat.total}</span>
                </div>
                
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex">
                  <div className={`h-full ${bgColorClass}`} style={{ width: `${cat.pct}%` }} />
                  <div className="h-full bg-rose-500/80" style={{ width: `${100 - cat.pct}%` }} />
                </div>
                
                <div className="flex justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${bgColorClass}`} />
                    <span className="text-muted-foreground">{cat.onTime} On-Time</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-muted-foreground">{cat.late} Late</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
