import { NavLink } from 'react-router-dom';
import { ListTodo, Zap, Building2, BookOpen, HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavItem {
  icon: React.ElementType;
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: ListTodo, label: 'Tasks', to: '/dashboard' },
  { icon: Zap, label: 'Trigger', to: '/dashboard/trigger' },
  { icon: Building2, label: 'Tenants', to: '/dashboard/tenants' },
  { icon: BookOpen, label: 'Rules', to: '/dashboard/rules' },
  { icon: HeartPulse, label: 'Preflight', to: '/dashboard/preflight' },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-bold tracking-tight">AI Employee</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map(({ icon: Icon, label, to }) => (
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
              </Button>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
