import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, X } from 'lucide-react';
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown';
import type { MultiSelectOption } from '@/components/ui/multi-select-dropdown';
import { gatewayFetch } from '@/lib/gateway';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';
import type { EmployeeRule } from '@/lib/types';
import {
  ErrorState,
  RuleStatusBadge,
  RULE_STATUS_CLASSES,
  SkeletonRow,
  truncate,
} from './rules-helpers';

const RULE_STATUS_OPTIONS: MultiSelectOption[] = [
  { value: 'confirmed', label: 'confirmed', badgeClass: RULE_STATUS_CLASSES.confirmed },
  { value: 'proposed', label: 'proposed', badgeClass: RULE_STATUS_CLASSES.proposed },
  {
    value: 'awaiting_input',
    label: 'awaiting_input',
    badgeClass: RULE_STATUS_CLASSES.awaiting_input,
  },
];

export function RulesTab({
  selectedIdsKey,
  archetypeMap,
}: {
  selectedIdsKey: string;
  archetypeMap: Map<string, string>;
}) {
  const { tenantId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const selectedStatuses = new Set<string>(
    searchParams.get('status')?.split(',').filter(Boolean) ?? [],
  );

  const selectedIds = useMemo(
    () => new Set(selectedIdsKey.split(',').filter(Boolean)),
    [selectedIdsKey],
  );

  const fetchRules = useCallback(
    () => gatewayFetch<EmployeeRule[]>(`/admin/tenants/${tenantId}/employee-rules?limit=100`),
    [tenantId],
  );

  const { data: allRules, error, loading, refresh } = usePoll(fetchRules);

  const rules = useMemo(() => {
    if (!allRules) return null;
    if (selectedIds.size === 0) return allRules;
    return allRules.filter((r) => selectedIds.has(r.archetype_id));
  }, [allRules, selectedIds]);

  const filteredRules = useMemo(() => {
    if (!rules) return [];
    const q = query.toLowerCase();
    return rules.filter((r) => {
      const matchesQuery = !q || r.rule_text.toLowerCase().includes(q);
      const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(r.status);
      return matchesQuery && matchesStatus;
    });
  }, [rules, query, selectedStatuses]);

  const toggleStatus = (v: string) => {
    const next = new URLSearchParams(searchParams);
    const cur = new Set<string>(next.get('status')?.split(',').filter(Boolean) ?? []);
    if (cur.has(v)) {
      cur.delete(v);
    } else {
      cur.add(v);
    }
    if (cur.size === 0) {
      next.delete('status');
    } else {
      next.set('status', [...cur].join(','));
    }
    setSearchParams(next, { replace: true });
  };

  const hasFilters = query !== '' || selectedStatuses.size > 0;

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('status');
    setSearchParams(next, { replace: true });
  };

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Status</TableHead>
            <TableHead className="w-36">Employee</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead className="w-40">Source</TableHead>
            <TableHead className="w-32">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} cols={5} />
          ))}
        </TableBody>
      </Table>
    );
  }

  if (error) {
    return <ErrorState error={error} table="employee_rules" onRetry={refresh} />;
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search rules..."
            value={query}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (!e.target.value) {
                next.delete('q');
              } else {
                next.set('q', e.target.value);
              }
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
        <MultiSelectDropdown
          options={RULE_STATUS_OPTIONS}
          selected={selectedStatuses}
          onToggle={toggleStatus}
          placeholder="All statuses"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
        <span className="shrink-0 text-sm text-muted-foreground">
          {hasFilters
            ? `${filteredRules.length} of ${(rules ?? []).length}`
            : `${(rules ?? []).length}`}{' '}
          {(rules ?? []).length === 1 ? 'rule' : 'rules'}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Status</TableHead>
            <TableHead className="w-36">Employee</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead className="w-40">Source</TableHead>
            <TableHead className="w-32">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRules.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                {hasFilters
                  ? 'No rules match the current filters'
                  : 'No rules yet — rules are extracted from PM feedback in Slack'}
              </TableCell>
            </TableRow>
          ) : (
            filteredRules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <RuleStatusBadge status={rule.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {archetypeMap.get(rule.archetype_id) ?? truncate(rule.archetype_id, 8)}
                </TableCell>
                <TableCell className="max-w-md text-sm" title={rule.rule_text}>
                  {truncate(rule.rule_text, 120)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {rule.source ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatRelativeTime(rule.created_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
