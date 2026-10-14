import type React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { ThemeProvider, useTheme } from '@/features/theme/ThemeContext';
import { OtifProvider } from '@/features/otif/OtifContext';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { onStorageFailure } from '@/lib/demo-companies';
import { isRfdOnly } from '@/lib/users/rfd-only';
import { onSharedDataError } from '@/lib/shared-data';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { OverdueDashboardPage } from '@/features/overdue/OverdueDashboardPage';
import { CompaniesPage } from '@/features/companies/CompaniesPage'
import { CoordinatorCompaniesPage } from '@/features/companies/CoordinatorCompaniesPage'
import { lazy, Suspense, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// Heavy pages load on demand: charts, PDF and
// spreadsheet tooling have no business in the bundle that paints the login
// page. Each lands in its own chunk the first time someone opens it.
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, key: keyof T) =>
  lazy(() => load().then((m) => ({ default: m[key] as React.ComponentType })));
const OtifDashboardPage = lazyPage(() => import('@/features/otif/OtifDashboardPage'), 'OtifDashboardPage');
const AdminPanelPage = lazyPage(() => import('@/features/admin/AdminPanelPage'), 'AdminPanelPage');
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const AdminOverviewPage = lazyPage(() => import('@/features/companies/AdminOverviewPage'), 'AdminOverviewPage');
const RfdPage = lazyPage(() => import('@/features/rfd/RfdPage'), 'RfdPage');
const QuotationsPage = lazyPage(() => import('@/features/quotations/QuotationsPage'), 'QuotationsPage');
const WeeklyKpiPage = lazyPage(() => import('@/features/snapshots/WeeklyKpiPage'), 'WeeklyKpiPage');

function RouteFallback() {
  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}


/** An RFD-only coordinator (Avani) has no payments screens: they go to Ready for Dispatch. */
function NotForRfdOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return isRfdOnly(user) ? <Navigate to="/rfd" replace /> : <>{children}</>;
}

function CompaniesRoute() {
  const { canManageTeam } = useAuth();
  return canManageTeam ? <CompaniesPage /> : <CoordinatorCompaniesPage />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppContent() {
  const { theme } = useTheme();

  /*
   * The browser has a few megabytes of room per site, and a large import can
   * reach it. That used to be swallowed, so the work of a whole session simply
   * was not there the next morning with nothing to explain it. Now it is said
   * out loud, once, while there is still time to do something about it.
   */
  useEffect(
    () =>
      onStorageFailure(() => {
        toast.error('This browser has run out of room to save your data.', {
          description:
            'Recent changes are only in this tab and will be lost when it closes. Clear old data in Settings, or ask for the data to be moved to the server.',
          duration: Infinity,
        });
      }),
    []
  );

  /*
   * The server is what decides whether a change happened. When it refuses one,
   * this browser quietly puts the records back as they really are — and without
   * this, that would be all it did: the change would vanish off the screen with
   * nothing said, which looks like the system losing work.
   */
  useEffect(() => {
    onSharedDataError((message) => {
      toast.error('That change was not saved.', {
        description: message,
        duration: 8000,
      });
    });
    return () => onSharedDataError(null);
  }, []);

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }>
          <Route index element={<NotForRfdOnly><DashboardPage /></NotForRfdOnly>} />
          <Route path="companies" element={<NotForRfdOnly><ProtectedRoute><CompaniesRoute /></ProtectedRoute></NotForRfdOnly>} />
          <Route path="admin/overview" element={<ProtectedRoute requiredRole="team_leader"><AdminOverviewPage /></ProtectedRoute>} />
          <Route path="weekly-kpi" element={<ProtectedRoute requiredRole="team_leader"><WeeklyKpiPage /></ProtectedRoute>} />
          <Route path="admin/users" element={<ProtectedRoute requiredRole="admin"><AdminPanelPage /></ProtectedRoute>} />
          <Route path="otif" element={
            <ProtectedRoute requiredRole="team_leader">
              <OtifDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="settings" element={
            <ProtectedRoute requiredRole="team_leader">
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="overdue" element={<NotForRfdOnly><OverdueDashboardPage /></NotForRfdOnly>} />
          <Route path="rfd" element={<RfdPage />} />
          <Route path="quotations" element={<NotForRfdOnly><QuotationsPage /></NotForRfdOnly>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      </Suspense>
      
      <Toaster theme={theme} position="top-right" />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <OtifProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </BrowserRouter>
        </OtifProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
