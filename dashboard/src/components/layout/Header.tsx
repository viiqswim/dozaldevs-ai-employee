import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant } from '@/hooks/use-tenant';
import { TENANTS } from '@/lib/constants';

interface HeaderProps {
  onOpenApiKey: () => void;
}

export function Header({ onOpenApiKey }: HeaderProps) {
  const { tenantId, setTenantId } = useTenant();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <h1 className="text-sm font-semibold text-foreground">AI Employee Dashboard</h1>
      <div className="flex items-center gap-2">
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Select tenant" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TENANTS).map(([id, name]) => (
              <SelectItem key={id} value={id} className="text-xs">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onOpenApiKey}
          title="Configure API key"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
