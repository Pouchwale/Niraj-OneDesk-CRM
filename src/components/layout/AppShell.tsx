import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AssistantWidget } from '@/features/assistant/AssistantWidget';
import { ProofGate } from '@/features/assistant/ProofGate';
import { RobiPopup } from '@/features/assistant/RobiPopup';
import { FestivalOverlay } from '@/features/festivals/FestivalOverlay';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { ModuleGate } from '@/features/auth/module-access';
import { useAutoRefresh } from '@/lib/auto-refresh';
import { useBackgroundExcelSync } from '@/lib/background-sync';
import { useAuth } from '@/features/auth/AuthContext';

export const AppShell = () => {
  const { pathname } = useLocation();
  // After a deploy every open CRM reloads itself at a safe moment (28 Nov 2026).
  useAutoRefresh();
  // Every leader's and administrator's screen keeps the Excel books imported, whatever page it shows (28 Nov 2026).
  const { user, canManageTeam } = useAuth();
  useBackgroundExcelSync(Boolean(canManageTeam), user?.id);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isDesktop = useIsDesktop();

  // Between the tablet and desktop breakpoints the full sidebar would take
  // half the width away from pages that are already dense, so it is pinned to
  // the icon rail there and the user's own choice only applies above it.
  const collapsed = isDesktop ? isSidebarCollapsed : true;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground bg-aurora overflow-hidden selection:bg-primary/30 transition-colors">
      <Sidebar 
        collapsed={collapsed} 
        onCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
        mobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />
      
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header 
          onMenuClick={() => setIsMobileMenuOpen(true)} 
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {/* The Overview is a console of wide tables: it gets the whole width. */}
          <div className={cn('mx-auto', pathname.startsWith('/admin/overview') ? 'max-w-[1800px]' : 'max-w-7xl')}>
            {/* A module the administrator switched off for this coordinator shows a notice instead. */}
            <ModuleGate pathname={pathname}>
              <Outlet />
            </ModuleGate>
          </div>
        </main>
      </div>

      {/* Coordinator-only follow-up assistant; renders nothing for admins. */}
      <AssistantWidget />
      <ProofGate />
      {/* Messages from the team and the morning's due payments, with Robi (everyone). */}
      <RobiPopup />
      {/* Festival celebrations: one at a time, over everything. */}
      <FestivalOverlay />
    </div>
  );
};
