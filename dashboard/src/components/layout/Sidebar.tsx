import { NavLink } from 'react-router-dom';
import { ListTodo, Users, Building2, BookOpen, HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PreflightStatus } from '@/hooks/use-preflight-status';

interface NavItem {
  icon: React.ElementType;
  label: string;
  to: string;
  healthDot?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { icon: ListTodo, label: 'Tasks', to: '/dashboard' },
  { icon: Users, label: 'Employees', to: '/dashboard/employees' },
  { icon: Building2, label: 'Tenants', to: '/dashboard/tenants' },
  { icon: BookOpen, label: 'Rules', to: '/dashboard/rules' },
  { icon: HeartPulse, label: 'Preflight', to: '/dashboard/preflight', healthDot: true },
];

interface SidebarProps {
  preflightStatus: PreflightStatus;
}

export function Sidebar({ preflightStatus }: SidebarProps) {
  const { allOk, hasError, failingNames, checking } = preflightStatus;

  const dotColor = checking
    ? 'bg-slate-300 animate-pulse'
    : hasError
      ? 'bg-red-500'
      : allOk
        ? 'bg-emerald-500'
        : 'bg-slate-300';

  const dotTitle = hasError ? `Failing: ${failingNames.join(', ')}` : allOk ? 'All systems OK' : '';

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-bold tracking-tight">AI Employee</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map(({ icon: Icon, label, to, healthDot }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) => (isActive ? 'block' : 'block')}
          >
            {({ isActive }) => (
              <Button
                variant="ghost"
                className={`w-full justify-start gap-2 ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {healthDot && (
                  <span
                    title={dotTitle}
                    className={`ml-auto h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`}
                  />
                )}
              </Button>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
