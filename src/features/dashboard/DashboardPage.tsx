import React from 'react';
import { motion } from 'motion/react';
import {
  Sparkles, Heart, Star, Flower2, Coffee, Music, Cloud, Smile
} from 'lucide-react';
import { KpiCard } from '@/components/shared/KpiCard';
import { GreetingBanner } from '@/components/shared/GreetingBanner';
import { useDailyEntries } from '@/features/daily-logs/hooks/useDailyEntries';
import { useAuth } from '@/features/auth/AuthContext';
import { todayISO } from '@/lib/utils';
import { useRoleKpis } from './hooks/useRoleKpis';
import { MyScoreCard } from '@/features/assistant/ScoresView';

// Cute doodle elements for the empty space
const DOODLES = [
  { id: 1, Icon: Heart, top: '65%', left: '15%', size: 32, rotation: -15, delay: 0, color: 'text-rose-400' },
  { id: 2, Icon: Sparkles, top: '45%', left: '85%', size: 40, rotation: 10, delay: 1.2, color: 'text-amber-400' },
  { id: 3, Icon: Star, top: '75%', left: '80%', size: 28, rotation: 25, delay: 0.5, color: 'text-blue-400' },
  { id: 4, Icon: Flower2, top: '85%', left: '25%', size: 36, rotation: 45, delay: 2, color: 'text-emerald-400' },
  { id: 5, Icon: Music, top: '55%', left: '5%', size: 24, rotation: -30, delay: 1.5, color: 'text-violet-400' },
  { id: 6, Icon: Coffee, top: '80%', left: '60%', size: 30, rotation: 15, delay: 0.8, color: 'text-amber-600' },
  { id: 7, Icon: Cloud, top: '50%', left: '50%', size: 48, rotation: 0, delay: 2.5, color: 'text-sky-300' },
  { id: 8, Icon: Smile, top: '60%', left: '35%', size: 26, rotation: -10, delay: 1.8, color: 'text-indigo-400' },
  { id: 9, Icon: Heart, top: '90%', left: '90%', size: 20, rotation: 35, delay: 0.3, color: 'text-pink-400' },
  { id: 10, Icon: Star, top: '70%', left: '45%', size: 18, rotation: -25, delay: 2.1, color: 'text-yellow-400' },
];

/**
 * Playful on a light page; on a dark one the same saturated icons at 30% read
 * as specks of dirt scattered over the screen — the eye keeps going to them and
 * finding nothing there. In dark they give up their colours and most of their
 * opacity, leaving a faint watermark that gives the empty space some texture
 * without asking to be looked at.
 */
function DoodleBackground() {
  // A CSS keyframe runs on the compositor. The same drift driven from
  // JavaScript kept the main thread 8–12% busy on a page nobody was touching.
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 opacity-40 dark:opacity-[0.07]"
      aria-hidden="true"
    >
      {DOODLES.map(({ id, Icon, top, left, size, rotation, delay, color }) => (
        <div
          key={id}
          className={`doodle absolute ${color} dark:text-foreground`}
          style={
            {
              top,
              left,
              '--doodle-r': `${rotation}deg`,
              '--doodle-d': `${6 + (id % 4)}s`,
              '--doodle-delay': `${delay}s`,
            } as React.CSSProperties
          }
        >
          <Icon size={size} strokeWidth={2} />
        </div>
      ))}
    </div>
  );
}

const MOTIVATIONAL_MESSAGES = [
  "Your hard work is the magic that makes everything happen.",
  "Keep up the great work! Every step forward is a step toward success.",
  "A positive attitude changes everything. Have a fantastic day!",
  "Success is built on daily habits. You're doing amazing!",
  "Your dedication is truly appreciated. Let's make today productive!",
  "Great things never come from comfort zones. You've got this!",
  "Focus on being productive instead of busy. Keep shining!",
  "Small steps every day lead to big results. Have a great shift!"
];

export function DashboardPage() {
  const { user } = useAuth();
  const { kpis, sectionTitle, isLoading } = useRoleKpis();
  const { getEntryByDate } = useDailyEntries();

  // Local calendar date: toISOString() would resolve to UTC and, in IST, report
  // yesterday's entry as today's.
  const userTodayEntry = user ? getEntryByDate(user.id, todayISO()) : null;

  const randomMessage = React.useMemo(() => {
    return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
  }, []);

  if (isLoading || !user) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-muted-foreground animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <>
      <DoodleBackground />
      <div className="flex flex-col gap-8 p-4 md:p-6 max-w-7xl mx-auto w-full relative z-10">
        {/* 1. Time-Based Dynamic Greeting Banner */}
        <div className="space-y-4">
          <GreetingBanner 
            user={user} 
            todaySubmitted={!!userTodayEntry} 
            todayStatus={userTodayEntry?.overall_status}
          />
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
            className="flex items-center gap-2 justify-center text-sm font-medium text-muted-foreground bg-muted/40 backdrop-blur-md py-3 px-6 rounded-2xl border border-border/50 max-w-fit shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {randomMessage}
            </span>
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
          </motion.div>
        </div>

        {/* A coordinator's own score against Robi's daily plan. */}
        {user.role === 'coordinator' && <MyScoreCard userId={user.id} />}

        {/* 2. The four figures chosen for whoever is signed in */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {sectionTitle}
            </h2>
            <span className="text-xs text-muted-foreground capitalize">
              {user.role} view
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {kpis.map((kpi) => (
              <KpiCard
                key={kpi.id}
                title={kpi.title}
                value={kpi.value}
                hint={kpi.hint}
                href={kpi.href}
                icon={kpi.icon}
                color={kpi.color}
                // A trend is rendered only where the KPI actually computed one
                // against a real prior period.
                delta={kpi.deltaPct !== undefined ? `${Math.abs(kpi.deltaPct)}%` : undefined}
                // Direction follows the sign; colour follows whether that
                // movement is welcome for this particular measure.
                deltaType={kpi.deltaPct === undefined ? undefined : kpi.deltaPct >= 0 ? 'up' : 'down'}
                deltaGood={
                  kpi.deltaPct === undefined
                    ? undefined
                    : (kpi.deltaPct >= 0) === (kpi.higherIsBetter ?? true)
                }
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
