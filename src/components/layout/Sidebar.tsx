import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, CalendarPlus, CalendarDays, CalendarRange, BarChart3, Users, Settings, ChevronLeft, X, ShieldCheck, Target, Building2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar = ({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) => {
  const { isAdmin, isCoordinator, canManageTeam } = useAuth();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', show: true },
    { to: '/companies', icon: Building2, label: 'Active Payments', show: true },
    { to: '/overdue', icon: AlertTriangle, label: 'Overdue Payments', show: true },
    { to: '/admin/overview', icon: Users, label: 'Overview', show: canManageTeam },
    { to: '/daily-entry', icon: CalendarPlus, label: 'Daily Entry', show: isCoordinator },
    { to: '/my-entries', icon: CalendarDays, label: 'My Entries', show: isCoordinator },
    { to: '/otif', icon: BarChart3, label: 'OTIF Analytics', show: canManageTeam },
    { to: '/team-activity', icon: Users, label: 'Team Activity', show: canManageTeam },
    { to: '/weekly-kpi', icon: CalendarRange, label: 'Weekly KPI', show: canManageTeam },
    { to: '/collections-kpi', icon: Target, label: 'Collections KPI', show: canManageTeam },
    { to: '/settings', icon: Settings, label: 'Settings', show: canManageTeam },
    { to: '/admin/users', icon: ShieldCheck, label: 'Admin Panel', show: isAdmin },
  ];

  const content = (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-xl border-r border-border transition-colors">
      <div className="h-16 flex items-center px-4 pt-2 mb-4 justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
            <img src="/logo.png" alt="OneDesk CRM" className="w-full h-full object-cover" />
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span 
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="font-bold text-sm whitespace-nowrap text-foreground leading-tight"
              >
                OneDesk CRM
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        
        {/* Mobile close button */}
        <button className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={onMobileClose} aria-label="Close navigation menu">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-none">
        {navItems.filter(i => i.show).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-3 rounded-xl transition-colors relative group",
              isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute inset-0 bg-primary/10 rounded-xl border border-primary/20"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <item.icon size={20} className="shrink-0 relative z-10" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="whitespace-nowrap font-medium relative z-10"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                
                {/* Tooltip for collapsed state */}
                {collapsed && (
                  <div className="absolute left-full ml-4 px-2 py-1 bg-popover text-popover-foreground text-sm rounded shadow-md border border-border opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border/50 flex items-center justify-between">
        <button
          onClick={onCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mx-auto w-full justify-center"
        >
          <motion.div animate={{ rotate: collapsed ? 180 : 0 }}>
            <ChevronLeft size={20} />
          </motion.div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 80 : 260 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="hidden md:block h-full z-20 shrink-0"
      >
        {content}
      </motion.aside>

      {/* Mobile Sidebar (Sheet) */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 w-64 z-50 md:hidden bg-background"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
