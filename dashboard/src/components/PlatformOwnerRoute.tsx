import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDeniedPage } from '@/pages/AccessDeniedPage';

export function PlatformOwnerRoute() {
  const { roleLoading, isPlatformOwner } = useAuth();

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (isPlatformOwner) {
    return <Outlet />;
  }

  return <AccessDeniedPage />;
}
