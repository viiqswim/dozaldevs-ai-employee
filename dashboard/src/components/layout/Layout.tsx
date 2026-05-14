import { useEffect } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { usePreflightStatus } from '@/hooks/use-preflight-status';
import { useTenant } from '@/hooks/use-tenant';

interface LayoutProps {
  onOpenApiKey: () => void;
}

function TenantUrlSync() {
  const { tenantId } = useTenant();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    setSearchParams(
      (prev) => {
        prev.set('tenant', tenantId);
        return prev;
      },
      { replace: true },
    );
  }, [location.pathname, tenantId, setSearchParams]);

  return null;
}

export function Layout({ onOpenApiKey }: LayoutProps) {
  const preflightStatus = usePreflightStatus();

  return (
    <div className="flex h-screen overflow-hidden">
      <TenantUrlSync />
      <Sidebar preflightStatus={preflightStatus} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenApiKey={onOpenApiKey} preflightStatus={preflightStatus} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
