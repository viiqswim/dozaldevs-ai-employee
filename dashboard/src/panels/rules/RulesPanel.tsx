import { useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime } from '@/lib/utils';
import type { EmployeeRule, FeedbackEvent } from '@/lib/types';

function is403(err: Error): boolean {
  return err.message.includes('403') || err.message.toLowerCase().includes('permission denied');
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
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

function RulesTab() {
  const { tenantId } = useTenant();

  const fetchRules = useCallback(
    () =>
      postgrestFetch<EmployeeRule>('employee_rules', {
        ...scopeByTenant(tenantId),
        order: 'created_at.desc',
        limit: '100',
      }),
    [tenantId],
  );

  const { data: rules, error, loading, refresh } = usePoll(fetchRules);

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Status</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead className="w-40">Source</TableHead>
            <TableHead className="w-32">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} cols={4} />
          ))}
        </TableBody>
      </Table>
    );
  }

  if (error) {
    return <ErrorState error={error} table="employee_rules" onRetry={refresh} />;
  }

  if (!rules || rules.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No rules yet — rules are extracted from PM feedback in Slack
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">Status</TableHead>
          <TableHead>Rule</TableHead>
          <TableHead className="w-40">Source</TableHead>
          <TableHead className="w-32">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell>
              <RuleStatusBadge status={rule.status} />
            </TableCell>
            <TableCell className="max-w-md text-sm" title={rule.rule_text}>
              {truncate(rule.rule_text, 120)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{rule.source ?? '—'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatRelativeTime(rule.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FeedbackEventsTab() {
  const { tenantId } = useTenant();

  const fetchEvents = useCallback(
    () =>
      postgrestFetch<FeedbackEvent>('feedback_events', {
        ...scopeByTenant(tenantId),
        order: 'created_at.desc',
        limit: '100',
      }),
    [tenantId],
  );

  const { data: events, error, loading, refresh } = usePoll(fetchEvents);

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Type</TableHead>
            <TableHead>Content</TableHead>
            <TableHead className="w-40">Actor</TableHead>
            <TableHead className="w-32">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} cols={4} />
          ))}
        </TableBody>
      </Table>
    );
  }

  if (error) {
    return <ErrorState error={error} table="feedback_events" onRetry={refresh} />;
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">No feedback events yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">Type</TableHead>
          <TableHead>Content</TableHead>
          <TableHead className="w-40">Actor</TableHead>
          <TableHead className="w-32">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell>
              <EventTypeBadge type={event.event_type} />
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
        ))}
      </TableBody>
    </Table>
  );
}

export function RulesPanel() {
  return (
    <div className="p-6">
      <Tabs defaultValue="rules">
        <TabsList className="mb-4">
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="feedback">Feedback Events</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackEventsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
