import { LogOut, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useTenant } from '@/hooks/use-tenant';
import { useAuth } from '@/contexts/AuthContext';
import type { PreflightStatus } from '@/hooks/use-preflight-status';

interface HeaderProps {
  onOpenApiKey: () => void;
  preflightStatus: PreflightStatus;
}

function HealthChip({ status }: { status: PreflightStatus }) {
  const { allOk, hasError, failingNames, checking } = status;

  let label: string;
  let dotClass: string;
  let chipClass: string;

  if (checking) {
    label = 'Checking…';
    dotClass = 'bg-slate-400 animate-pulse';
    chipClass = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
  } else if (hasError) {
    const count = failingNames.length;
    const shortName = failingNames[0]?.replace(/\s*\(:[^)]+\)$/, '') ?? '';
    label = count === 1 ? `${shortName} failing` : `${count} down`;
    dotClass = 'bg-red-500';
    chipClass = 'bg-red-100 text-red-700 hover:bg-red-200';
  } else if (allOk) {
    label = 'All systems OK';
    dotClass = 'bg-emerald-500';
    chipClass = 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200';
  } else {
    label = 'Status unknown';
    dotClass = 'bg-slate-300';
    chipClass = 'bg-slate-100 text-slate-500 hover:bg-slate-200';
  }

  return (
    <Link
      to="/dashboard/preflight"
      title={hasError ? `Failing: ${failingNames.join(', ')}` : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors no-underline ${chipClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
      {label}
    </Link>
  );
}

export function Header({ onOpenApiKey, preflightStatus }: HeaderProps) {
  const { tenantId, setTenantId, tenants, loading } = useTenant();
  const { signOut } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-foreground">AI Employee Dashboard</h1>
        <HealthChip status={preflightStatus} />
      </div>
      <div className="flex items-center gap-2">
        <SearchableSelect
          options={tenants.map((t) => ({ value: t.tenantId, label: t.name }))}
          value={tenantId}
          onValueChange={setTenantId}
          placeholder={loading ? 'Loading…' : 'Select organization'}
          searchPlaceholder="Search organizations…"
          className="w-36"
          disabled={loading}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onOpenApiKey}
          title="Configure API key"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => void signOut()}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
