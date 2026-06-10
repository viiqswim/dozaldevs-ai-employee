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
import type { FeedbackEvent } from '@/lib/types';
import {
  ErrorState,
  EventTypeBadge,
  EVENT_TYPE_CLASSES,
  SkeletonRow,
  truncate,
} from './rules-helpers';

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

export function FeedbackEventsTab({
  selectedIdsKey,
  archetypeMap,
}: {
  selectedIdsKey: string;
  archetypeMap: Map<string, string>;
}) {
  const { tenantId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const selectedTypes = new Set<string>(searchParams.get('type')?.split(',').filter(Boolean) ?? []);

  const selectedIds = useMemo(
    () => new Set(selectedIdsKey.split(',').filter(Boolean)),
    [selectedIdsKey],
  );

  const fetchEvents = useCallback(
    () => gatewayFetch<FeedbackEvent[]>(`/admin/tenants/${tenantId}/feedback-events?limit=100`),
    [tenantId],
  );

  const { data: allEvents, error, loading, refresh } = usePoll(fetchEvents);

  const events = useMemo(() => {
    if (!allEvents) return null;
    if (selectedIds.size === 0) return allEvents;
    return allEvents.filter((e) => selectedIds.has(e.archetype_id));
  }, [allEvents, selectedIds]);

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
    const next = new URLSearchParams(searchParams);
    const cur = new Set(next.get('type')?.split(',').filter(Boolean) ?? []);
    if (cur.has(v)) {
      cur.delete(v);
    } else {
      cur.add(v);
    }
    if (cur.size === 0) {
      next.delete('type');
    } else {
      next.set('type', [...cur].join(','));
    }
    setSearchParams(next, { replace: true });
  };

  const hasFilters = query !== '' || selectedTypes.size > 0;

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('type');
    setSearchParams(next, { replace: true });
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
