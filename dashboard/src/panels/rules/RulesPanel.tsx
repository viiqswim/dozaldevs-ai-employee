import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
import { ChevronDown, Search, X } from 'lucide-react';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime } from '@/lib/utils';
import type { Archetype, EmployeeRule, FeedbackEvent } from '@/lib/types';

function is403(err: Error): boolean {
  return err.message.includes('403') || err.message.toLowerCase().includes('permission denied');
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function buildArchetypeFilter(selectedIdsKey: string): Record<string, string> {
  if (!selectedIdsKey) return {};
  const ids = selectedIdsKey.split(',');
  if (ids.length === 1) return { archetype_id: `eq.${ids[0]}` };
  return { archetype_id: `in.(${ids.join(',')})` };
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  );
}

function PermissionWarning({ table }: { table: string }) {
  return (
    <div className="rounded-md border border-yellow-400 bg-yellow-50 p-4 text-sm dark:border-yellow-600 dark:bg-yellow-950/30">
      <p className="font-semibold text-yellow-800 dark:text-yellow-300">
        PostgREST access not configured for this table.
      </p>
      <p className="mt-1 font-mono text-yellow-700 dark:text-yellow-400">
        Run:{' '}
        <code className="rounded bg-yellow-100 px-1 dark:bg-yellow-900">
          GRANT SELECT ON {table} TO anon;
        </code>{' '}
        in your database.
      </p>
    </div>
  );
}

function ErrorState({
  error,
  table,
  onRetry,
}: {
  error: Error;
  table: string;
  onRetry: () => void;
}) {
  if (is403(error)) {
    return (
      <div className="p-6">
        <PermissionWarning table={table} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">Failed to load {table}</p>
        <p className="mt-1 text-destructive/80">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}

const RULE_STATUS_CLASSES: Record<EmployeeRule['status'], string> = {
  confirmed:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  proposed:
    'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  awaiting_input:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
};

function RuleStatusBadge({ status }: { status: EmployeeRule['status'] }) {
  return (
    <Badge variant="outline" className={RULE_STATUS_CLASSES[status]}>
      {status}
    </Badge>
  );
}

const EVENT_TYPE_CLASSES: Record<FeedbackEvent['event_type'], string> = {
  teaching:
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  feedback:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  rejection_reason:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  rejection:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  edit_diff:
    'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

function EventTypeBadge({ type }: { type: FeedbackEvent['event_type'] }) {
  return (
    <Badge variant="outline" className={EVENT_TYPE_CLASSES[type]}>
      {type}
    </Badge>
  );
}

interface MultiSelectOption {
  value: string;
  label: string;
  badgeClass?: string;
}

function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  placeholder,
  width,
}: {
  options: MultiSelectOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  placeholder: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

  const label =
    selected.size === 0
      ? placeholder
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? placeholder)
        : `${selected.size} selected`;

  return (
    <div className={`relative ${width ?? 'w-44'}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-max rounded-md border border-border bg-popover shadow-md">
          <div className="p-2">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No options found</p>
            ) : (
              filtered.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onToggle(opt.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 12 12"
                          className="h-3 w-3 fill-current"
                          aria-hidden="true"
                        >
                          <path
                            d="M10 3L5 8.5 2 5.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    {opt.badgeClass ? (
                      <Badge
                        variant="outline"
                        className={`${opt.badgeClass} pointer-events-none text-xs`}
                      >
                        {opt.label}
                      </Badge>
                    ) : (
                      <span>{opt.label}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const RULE_STATUS_OPTIONS: MultiSelectOption[] = [
  { value: 'confirmed', label: 'confirmed', badgeClass: RULE_STATUS_CLASSES.confirmed },
  { value: 'proposed', label: 'proposed', badgeClass: RULE_STATUS_CLASSES.proposed },
  {
    value: 'awaiting_input',
    label: 'awaiting_input',
    badgeClass: RULE_STATUS_CLASSES.awaiting_input,
  },
];

function RulesTab({
  selectedIdsKey,
  archetypeMap,
}: {
  selectedIdsKey: string;
  archetypeMap: Map<string, string>;
}) {
  const { tenantId } = useTenant();
  const [query, setQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());

  const fetchRules = useCallback(
    () =>
      postgrestFetch<EmployeeRule>('employee_rules', {
        ...scopeByTenant(tenantId),
        ...buildArchetypeFilter(selectedIdsKey),
        order: 'created_at.desc',
        limit: '100',
      }),
    [tenantId, selectedIdsKey],
  );

  const { data: rules, error, loading, refresh } = usePoll(fetchRules);

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
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(v)) {
        next.delete(v);
      } else {
        next.add(v);
      }
      return next;
    });
  };

  const hasFilters = query !== '' || selectedStatuses.size > 0;

  const clearFilters = () => {
    setQuery('');
    setSelectedStatuses(new Set());
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
            onChange={(e) => setQuery(e.target.value)}
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

const EVENT_TYPE_OPTIONS: MultiSelectOption[] = [
  { value: 'teaching', label: 'teaching', badgeClass: EVENT_TYPE_CLASSES.teaching },
  { value: 'feedback', label: 'feedback', badgeClass: EVENT_TYPE_CLASSES.feedback },
  {
    value: 'rejection_reason',
    label: 'rejection_reason',
    badgeClass: EVENT_TYPE_CLASSES.rejection_reason,
  },
  { value: 'rejection', label: 'rejection', badgeClass: EVENT_TYPE_CLASSES.rejection },
  { value: 'edit_diff', label: 'edit_diff', badgeClass: EVENT_TYPE_CLASSES.edit_diff },
];

function FeedbackEventsTab({
  selectedIdsKey,
  archetypeMap,
}: {
  selectedIdsKey: string;
  archetypeMap: Map<string, string>;
}) {
  const { tenantId } = useTenant();
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const fetchEvents = useCallback(
    () =>
      postgrestFetch<FeedbackEvent>('feedback_events', {
        ...scopeByTenant(tenantId),
        ...buildArchetypeFilter(selectedIdsKey),
        order: 'created_at.desc',
        limit: '100',
      }),
    [tenantId, selectedIdsKey],
  );

  const { data: events, error, loading, refresh } = usePoll(fetchEvents);

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    const q = query.toLowerCase();
    return events.filter((e) => {
      const content = e.correction_content ?? e.original_content ?? '';
      const matchesQuery = !q || content.toLowerCase().includes(q);
      const matchesType = selectedTypes.size === 0 || selectedTypes.has(e.event_type);
      return matchesQuery && matchesType;
    });
  }, [events, query, selectedTypes]);

  const toggleType = (v: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(v)) {
        next.delete(v);
      } else {
        next.add(v);
      }
      return next;
    });
  };

  const hasFilters = query !== '' || selectedTypes.size > 0;

  const clearFilters = () => {
    setQuery('');
    setSelectedTypes(new Set());
  };

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Type</TableHead>
            <TableHead className="w-36">Employee</TableHead>
            <TableHead>Content</TableHead>
            <TableHead className="w-40">Actor</TableHead>
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
    return <ErrorState error={error} table="feedback_events" onRetry={refresh} />;
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search events..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <MultiSelectDropdown
          options={EVENT_TYPE_OPTIONS}
          selected={selectedTypes}
          onToggle={toggleType}
          placeholder="All types"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
        <span className="shrink-0 text-sm text-muted-foreground">
          {hasFilters
            ? `${filteredEvents.length} of ${(events ?? []).length}`
            : `${(events ?? []).length}`}{' '}
          {(events ?? []).length === 1 ? 'event' : 'events'}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Type</TableHead>
            <TableHead className="w-36">Employee</TableHead>
            <TableHead>Content</TableHead>
            <TableHead className="w-40">Actor</TableHead>
            <TableHead className="w-32">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredEvents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                {hasFilters ? 'No events match the current filters' : 'No feedback events yet'}
              </TableCell>
            </TableRow>
          ) : (
            filteredEvents.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <EventTypeBadge type={event.event_type} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {archetypeMap.get(event.archetype_id) ?? truncate(event.archetype_id, 8)}
                </TableCell>
                <TableCell className="max-w-md text-sm text-muted-foreground">
                  {truncate(event.correction_content ?? event.original_content, 100)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {event.actor_id ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatRelativeTime(event.created_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}

function EmployeeMultiSelect({
  archetypes,
  selectedIds,
  onToggle,
  onClearAll,
}: {
  archetypes: Pick<Archetype, 'id' | 'role_name'>[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = archetypes.filter((a) =>
    (a.role_name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const label =
    selectedIds.size === 0
      ? 'All employees'
      : selectedIds.size === 1
        ? (archetypes.find((a) => selectedIds.has(a.id))?.role_name ?? 'Unknown')
        : `${selectedIds.size} employees`;

  return (
    <div className="relative w-56" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[14rem] rounded-md border border-border bg-popover shadow-md">
          <div className="p-2">
            <Input
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => {
                onClearAll();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-3 w-3" />
              Show all employees
            </button>
          )}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No employees found</p>
            ) : (
              filtered.map((a) => {
                const checked = selectedIds.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onToggle(a.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 12 12"
                          className="h-3 w-3 fill-current"
                          aria-hidden="true"
                        >
                          <path
                            d="M10 3L5 8.5 2 5.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span>{a.role_name ?? a.id}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RulesPanel() {
  const { tenantId } = useTenant();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchArchetypes = useCallback(
    () =>
      postgrestFetch<Pick<Archetype, 'id' | 'role_name'>>('archetypes', {
        ...scopeByTenant(tenantId),
        select: 'id,role_name',
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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tenantId]);

  const selectedIdsKey = Array.from(selectedIds).sort().join(',');

  const toggleEmployee = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
            onToggle={toggleEmployee}
            onClearAll={() => setSelectedIds(new Set())}
          />
        ) : (
          <span className="text-sm text-muted-foreground">No archetypes found for this tenant</span>
        )}
        {selectedIds.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="h-9 text-xs"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <Tabs defaultValue="rules">
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
