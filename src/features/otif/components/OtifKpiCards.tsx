import { type OtifSummary } from '@/lib/demo-data';
import { KpiCard } from '@/components/shared/KpiCard';
import { CircularProgress } from '@/components/shared/CircularProgress';
import { GlassCard } from '@/components/shared/GlassCard';
import { Package, CheckCircle, XCircle } from 'lucide-react';
import { formatPercentage } from '@/lib/utils';

interface OtifKpiCardsProps {
  summary: OtifSummary;
}

export function OtifKpiCards({ summary }: OtifKpiCardsProps) {
  const score = summary.otifPercentage;
  const color = score > 85 ? 'text-emerald-500' : score > 70 ? 'text-amber-500' : 'text-rose-500';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <GlassCard className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">OTIF Score</p>
          <div className={`text-3xl font-bold mt-2 ${color}`}>
            {formatPercentage(score)}
          </div>
        </div>
        <CircularProgress value={score} size={64} strokeWidth={6} className={color} />
      </GlassCard>

      <KpiCard
        title="Total POs"
        value={summary.totalPOs}
        icon={Package}
        color="indigo"
      />

      <KpiCard
        title="On-Time Deliveries"
        value={summary.onTimeCount}
        icon={CheckCircle}
        color="emerald"
      />

      <KpiCard
        title="Late Deliveries"
        value={summary.lateCount}
        icon={XCircle}
        color="rose"
      />
    </div>
  );
}
