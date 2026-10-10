import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AssistantWidget } from '@/features/assistant/AssistantWidget';
import { ProofGate } from '@/features/assistant/ProofGate';
import { useIsDesktop } from '@/hooks/useMediaQuery';

export const AppShell = () => {
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
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Coordinator-only follow-up assistant; renders nothing for admins. */}
      <AssistantWidget />
      <ProofGate />
    </div>
  );
};
