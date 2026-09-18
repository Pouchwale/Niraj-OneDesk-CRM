import React from 'react';
import { ROLE_LABEL, seesAllAccounts } from '@/lib/users/roles'
import { motion } from 'motion/react';
import { Shield, Sparkles, ArrowRight, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/shared/GlassCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useNavigate } from 'react-router-dom';
import { useNow } from '@/hooks/useNow';
import type { Profile } from '@/lib/types';

interface GreetingBannerProps {
  user: Profile;
  todaySubmitted?: boolean;
  todayStatus?: 'green' | 'red' | 'leave';
}

export function getTimeBasedGreeting(
  name: string,
  now: Date = new Date()
): { greeting: string; icon: string; subtitle: string } {
  const hour = now.getHours();
  let greeting = '';
  let icon = '☀️';
  let subtitle = '';

  if (hour >= 5 && hour < 12) {
    greeting = `Good morning, ${name}`;
    icon = '☀️';
    subtitle = "Start your day with a clear view of your operational metrics and targets.";
  } else if (hour >= 12 && hour < 17) {
    greeting = `Good afternoon, ${name}`;
    icon = '🌤️';
    subtitle = "Here is how your performance and team operations are tracking this afternoon.";
  } else if (hour >= 17 && hour < 22) {
    greeting = `Good evening, ${name}`;
    icon = '🌙';
    subtitle = "Reviewing end-of-day sales figures, customer follow-ups, and OTIF metrics.";
  } else {
    greeting = `Working late, ${name}`;
    icon = '✨';
    subtitle = "Here is your latest CRM activity summary and delivery performance.";
  }

  return { greeting, icon, subtitle };
}

export function GreetingBanner({ user, todaySubmitted, todayStatus }: GreetingBannerProps) {
  const navigate = useNavigate();
  const firstName = user.full_name.split(' ')[0] || user.full_name;
  // A live clock: the time, the date and the greeting all follow it, so the
  // banner is still right an hour later without anyone reloading the tab.
  const now = useNow();
  const { greeting, icon, subtitle } = getTimeBasedGreeting(firstName, now);

  const formattedDate = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const formattedTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <GlassCard className="p-6 md:p-8 bg-gradient-to-r from-primary/10 via-card to-card border-primary/20 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl">{icon}</span>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {greeting}
              </h1>
              <Badge 
                variant="outline" 
                className={seesAllAccounts(user.role)
                  ? "bg-violet-500/10 text-violet-500 border-violet-500/30 uppercase text-[10px] font-bold tracking-wider"
                  : "bg-primary/10 text-primary border-primary/30 uppercase text-[10px] font-bold tracking-wider"}
              >
                {ROLE_LABEL[user.role]}
              </Badge>
            </div>
            
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
              {subtitle}
            </p>

            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span data-testid="greeting-clock">{formattedTime}</span>
              </span>
            </div>
          </div>

          {/* Action callout for Coordinators / Admin */}
          <div className="shrink-0 flex items-center gap-3">
            {user.role === 'coordinator' ? (
              todaySubmitted ? (
                <div className="flex items-center gap-3 bg-muted/60 p-3 rounded-2xl border border-border">
                  <div className="text-xs text-muted-foreground">Today's Log:</div>
                  <StatusBadge status={todayStatus || 'green'} />
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => navigate('/daily-entry')}
                    className="text-xs ml-2"
                  >
                    Edit Log
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={() => navigate('/daily-entry')}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center gap-2 group"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  Log Today's Activity
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              )
            ) : (
              <Button
                onClick={() => navigate('/otif')}
                variant="outline"
                className="border-primary/40 hover:bg-primary/10 text-foreground font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-2"
              >
                <Shield className="w-4 h-4 text-primary" />
                OTIF Analytics Dashboard
              </Button>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
