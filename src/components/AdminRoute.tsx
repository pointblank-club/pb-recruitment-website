import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { adminApi } from '@/services/api/adminApi';
import { AuthenticatedRoute } from '@/components/AuthenticatedRoute';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminAuthorization: React.FC<AdminRouteProps> = ({ children }) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkAdminAccess = async () => {
      try {
        await adminApi.checkAdminAccess();
        if (!cancelled) setIsAuthorized(true);
      } catch (error) {
        console.error('Admin access denied:', error);
        if (!cancelled) setIsAuthorized(false);
      }
    };

    void checkAdminAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAuthorized === null) {
    // Loading state - you can replace this with a proper loading component
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Verifying admin access...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => (
  <AuthenticatedRoute>
    <AdminAuthorization>{children}</AdminAuthorization>
  </AuthenticatedRoute>
);
