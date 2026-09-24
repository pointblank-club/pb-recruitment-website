import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

interface AuthenticatedRouteProps {
  children: ReactNode;
}

export const AuthenticatedRoute = ({ children }: AuthenticatedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-gray-300">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-green-400" />
          Restoring your session…
        </div>
      </div>
    );
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <>{children}</>;
};
