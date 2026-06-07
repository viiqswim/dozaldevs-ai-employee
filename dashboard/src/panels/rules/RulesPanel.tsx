import { useCallback, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { useSearchParams } from 'react-router-dom';
import type { Archetype } from '@/lib/types';
import { EmployeeMultiSelect } from './components/EmployeeMultiSelect';
import { RulesTab } from './components/RulesTab';
import { FeedbackEventsTab } from './components/FeedbackEventsTab';

export function RulesPanel() {
  const { tenantId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchArchetypes = useCallback(
    () =>
      postgrestFetch<Pick<Archetype, 'id' | 'role_name'>>('archetypes', {
        ...scopeByTenant(tenantId),
        select: 'id,role_name',
        deleted_at: 'is.null',
        order: 'role_name.asc',
      }),
    [tenantId],
  );

  const { data: archetypes, loading: archetypesLoading } = usePoll(fetchArchetypes);

  const archetypeMap = useMemo(() => {
    const map = new Map<string, string>();
    archetypes?.forEach((a) => {
      map.set(a.id, a.role_name ?? a.id);
    });
    return map;
  }, [archetypes]);

  const activeTab = searchParams.get('tab') ?? 'rules';

  const handleTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'rules') {
      next.delete('tab');
    } else {
      next.set('tab', v);
    }
    setSearchParams(next, { replace: true });
  };

  const selectedIds = new Set(searchParams.get('employees')?.split(',').filter(Boolean) ?? []);

  const handleToggleEmployee = (id: string) => {
    const next = new URLSearchParams(searchParams);
    const cur = new Set(next.get('employees')?.split(',').filter(Boolean) ?? []);
    if (cur.has(id)) {
      cur.delete(id);
    } else {
      cur.add(id);
    }
    if (cur.size === 0) {
      next.delete('employees');
    } else {
      next.set('employees', [...cur].join(','));
    }
    setSearchParams(next, { replace: true });
  };

  const clearAllEmployees = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('employees');
    setSearchParams(next, { replace: true });
  };

  const selectedIdsKey = Array.from(selectedIds).sort().join(',');

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Employee:</span>
        {archetypesLoading ? (
          <div className="h-9 w-56 animate-pulse rounded-md bg-muted" />
        ) : archetypes && archetypes.length > 0 ? (
          <EmployeeMultiSelect
            archetypes={archetypes}
            selectedIds={selectedIds}
            onToggle={handleToggleEmployee}
            onClearAll={clearAllEmployees}
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            No employees found for this organization
          </span>
        )}
        {selectedIds.size > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllEmployees} className="h-9 text-xs">
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="feedback">Feedback Events</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <RulesTab selectedIdsKey={selectedIdsKey} archetypeMap={archetypeMap} />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackEventsTab selectedIdsKey={selectedIdsKey} archetypeMap={archetypeMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
