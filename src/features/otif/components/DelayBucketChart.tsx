import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { GlassCard } from '@/components/shared/GlassCard';

interface DelayBucketChartProps {
  data: {
    bucket: string;
    count: number;
    percentage: number;
  }[];
}

const BUCKET_COLORS: Record<string, string> = {
  'On-Time / Early': '#34d399',
  '1-3 Days Late': '#fbbf24',
  '4-7 Days Late': '#fb923c',
  '8-10 Days Late': '#f87171',
  '10+ Days Late': '#e11d48',
};

export function DelayBucketChart({ data }: DelayBucketChartProps) {
  return (
    <GlassCard className="p-6 h-full flex flex-col">
      <h3 className="text-lg font-medium mb-6">Delay Bucket Distribution</h3>
      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis 
              dataKey="bucket" 
              type="category" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94a3b8', fontSize: 12 }} 
              width={110}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-background/95 backdrop-blur-md border border-border/50 p-3 rounded-lg shadow-xl">
                      <p className="font-medium text-foreground mb-1">{data.bucket}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BUCKET_COLORS[data.bucket] }} />
                        <span>{data.count} POs</span>
                        <span className="font-medium text-foreground">({Math.round(data.percentage)}%)</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={BUCKET_COLORS[entry.bucket] || '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
