import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { NotificationBell } from '../shared/NotificationBell';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  onMenuClick: () => void;
}

/** Longest prefix wins, so /team/gp3 resolves before /team. */
const PAGE_TITLES: [string, string][] = [
  ['/companies', 'Active Payments'],
  ['/overdue', 'Overdue Payments'],
  ['/admin/overview', 'Overview'],
  ['/admin/users', 'Admin Panel'],
  ['/daily-entry', 'Daily Entry'],
  ['/my-entries', 'My Entries'],
  ['/otif', 'OTIF Analytics'],
  ['/collections-kpi', 'Collections KPI'],
  ['/team-activity', 'Team Activity'],
  ['/team', 'Team Overview'],
  ['/settings', 'Settings'],
];

function getPageTitle(path: string): string {
  const match = PAGE_TITLES.filter(([prefix]) => path.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length
  )[0];
  return match ? match[1] : 'Dashboard';
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-md border-b border-border/80 px-4 md:px-6 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-xl font-semibold text-foreground">
          {getPageTitle(location.pathname)}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
};
