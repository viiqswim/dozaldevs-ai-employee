import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { usePreflightStatus } from '@/hooks/use-preflight-status';

interface LayoutProps {
  onOpenApiKey: () => void;
}

export function Layout({ onOpenApiKey }: LayoutProps) {
  const preflightStatus = usePreflightStatus();

  return (
    <div className="flex h-screen overflow-hidden">
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
