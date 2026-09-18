import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Loader2 } from 'lucide-react';
import type { UserRole } from '@/lib/types';

interface ProtectedRouteProps {
  /** A single role, or any of several — admins are additionally always allowed. */
  requiredRole?: UserRole | UserRole[];
  /**
   * Drops the administrator override, so only the named roles get in.
   *
   * Used for the daily-entry pages: they belong to people with a desk, and an
   * administrator filing an entry would be counted in nobody's team.
   */
  exclusive?: boolean;
  children?: React.ReactNode;
}

export const ProtectedRoute = ({ requiredRole, exclusive, children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    // The administrator is the system owner: everything except pages
    // explicitly marked exclusive.
    const adminMayPass = user.role === 'admin' && !exclusive;
    if (!allowed.includes(user.role) && !adminMayPass) {
      return <Navigate to="/" replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
};
