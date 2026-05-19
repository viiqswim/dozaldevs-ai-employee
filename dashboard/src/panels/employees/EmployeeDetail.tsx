import { useCallback, useEffect, useState } from 'react';
import { MarkdownEditorField } from '../../components/MarkdownEditorField';
import { MarkdownPreview } from '../../components/MarkdownPreview';
import { InputSchemaEditor } from '../../components/InputSchemaEditor';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { triggerEmployee, patchArchetype } from '@/lib/gateway';
import { GATEWAY_URL, TERMINAL_STATUSES } from '@/lib/constants';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import type { Archetype, Task, EmployeeRule, InputSchemaItem } from '@/lib/types';
import { StatusBadge } from '@/panels/tasks/StatusBadge';
import { toast } from 'sonner';
import { BrainPreviewTab } from './BrainPreviewTab';

const WEBHOOK_FIXTURES = {
  agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
  lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
  property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
} as const;

type PatchData = Partial<
  Pick<
    Archetype,
    | 'role_name'
    | 'model'
    | 'runtime'
    | 'instructions'
    | 'system_prompt'
    | 'notification_channel'
    | 'vm_size'
    | 'deliverable_type'
    | 'concurrency_limit'
    | 'input_schema'
    | 'worker_env'
  > & { risk_model?: Record<string, unknown> }
>;

interface EditValues {
  role_name: string;
  model: string;
  runtime: string;
  instructions: string;
  system_prompt: string;
  notification_channel: string;
  vm_size: string;
  deliverable_type: string;
  concurrency_limit: number;
  risk_model_json: string;
}

function archetypeToEditValues(a: Archetype): EditValues {
  return {
    role_name: a.role_name ?? '',
    model: a.model ?? '',
    runtime: a.runtime ?? '',
    instructions: a.instructions ?? '',
    system_prompt: a.system_prompt ?? '',
    notification_channel: a.notification_channel ?? '',
    vm_size: a.vm_size ?? '',
    deliverable_type: a.deliverable_type ?? '',
    concurrency_limit: a.concurrency_limit,
    risk_model_json: JSON.stringify(a.risk_model ?? {}, null, 2),
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </dt>
  );
}

function FieldValue({ children }: { children: React.ReactNode }) {
  return <dd className="mt-0.5 text-sm">{children}</dd>;
}

function is403(err: Error): boolean {
  return err.message.includes('403') || err.message.toLowerCase().includes('permission denied');
}

function RulesSection({ archetypeId }: { archetypeId: string }) {
  const { tenantId } = useTenant();

  const fetchRules = useCallback(
    () =>
      postgrestFetch<EmployeeRule>('employee_rules', {
        ...scopeByTenant(tenantId),
        archetype_id: `eq.${archetypeId}`,
        order: 'created_at.desc',
        limit: '20',
      }),
    [tenantId, archetypeId],
  );

  const { data: rules, error, loading } = usePoll(fetchRules);

  const RULE_STATUS_CLASSES: Record<EmployeeRule['status'], string> = {
    confirmed:
      'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    proposed:
      'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
    awaiting_input:
      'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    if (is403(error)) {
      return (
        <p className="text-sm text-yellow-700">
          Rules table may need ANON access. Run:{' '}
          <code className="rounded bg-muted px-1 text-xs">
            GRANT SELECT ON employee_rules TO anon;
          </code>
        </p>
      );
    }
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!rules || rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No rules yet</p>;
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-start gap-3 rounded-md border p-3">
          <Badge variant="outline" className={RULE_STATUS_CLASSES[rule.status]}>
            {rule.status}
          </Badge>
          <span className="flex-1 text-sm">{rule.rule_text}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(rule.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentTasksSection({ archetypeId }: { archetypeId: string }) {
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  const fetchTasks = useCallback(
    () =>
      postgrestFetch<Task>('tasks', {
        ...scopeByTenant(tenantId),
        archetype_id: `eq.${archetypeId}`,
        order: 'created_at.desc',
        limit: '10',
      }),
    [tenantId, archetypeId],
  );

  const { data: tasks, error, loading } = usePoll(fetchTasks);

  const isTerminal = (status: string) =>
    TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number]);

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 3 }).map((__, j) => (
                <TableCell key={j}>
                  <div className="h-4 animate-pulse rounded bg-muted" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!tasks || tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow
            key={task.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => navigate(`/dashboard/tasks/${task.id}`)}
          >
            <TableCell>
              <StatusBadge status={task.status} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatRelativeTime(task.created_at)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {isTerminal(task.status) ? formatDuration(task.created_at, task.updated_at) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ConfigTab({ archetype, onSaved }: { archetype: Archetype; onSaved: () => void }) {
  const { tenantId } = useTenant();
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<EditValues>(() => archetypeToEditValues(archetype));
  const [editedInputSchema, setEditedInputSchema] = useState<InputSchemaItem[]>(
    () => archetype.input_schema ?? [],
  );
  const [editedWorkerEnv, setEditedWorkerEnv] = useState<Record<string, string>>(
    () => (archetype.worker_env as Record<string, string>) ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!editMode) {
      setEditValues(archetypeToEditValues(archetype));
      setEditedInputSchema(archetype.input_schema ?? []);
      setEditedWorkerEnv((archetype.worker_env as Record<string, string>) ?? {});
    }
  }, [archetype, editMode]);

  const handleEdit = () => {
    setEditValues(archetypeToEditValues(archetype));
    setEditedInputSchema(archetype.input_schema ?? []);
    setEditedWorkerEnv((archetype.worker_env as Record<string, string>) ?? {});
    setSaveError(null);
    setEditMode(true);
  };

  const handleCancel = () => {
    setEditMode(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    const changes: PatchData = {};

    if (editValues.role_name !== (archetype.role_name ?? ''))
      changes.role_name = editValues.role_name || null;
    if (editValues.model !== (archetype.model ?? '')) changes.model = editValues.model || null;
    if (editValues.runtime !== (archetype.runtime ?? ''))
      changes.runtime = editValues.runtime || null;
    if (editValues.instructions !== (archetype.instructions ?? ''))
      changes.instructions = editValues.instructions || null;
    if (editValues.system_prompt !== (archetype.system_prompt ?? ''))
      changes.system_prompt = editValues.system_prompt || null;
    if (editValues.notification_channel !== (archetype.notification_channel ?? ''))
      changes.notification_channel = editValues.notification_channel || null;
    if (editValues.vm_size !== (archetype.vm_size ?? ''))
      changes.vm_size = editValues.vm_size || null;
    if (editValues.deliverable_type !== (archetype.deliverable_type ?? ''))
      changes.deliverable_type = editValues.deliverable_type || null;
    if (editValues.concurrency_limit !== archetype.concurrency_limit)
      changes.concurrency_limit = editValues.concurrency_limit;

    let parsedRiskModel: Record<string, unknown>;
    try {
      parsedRiskModel = JSON.parse(editValues.risk_model_json) as Record<string, unknown>;
    } catch {
      setSaveError('Invalid JSON in risk model');
      setSaving(false);
      return;
    }
    if (JSON.stringify(parsedRiskModel) !== JSON.stringify(archetype.risk_model ?? {})) {
      changes.risk_model = parsedRiskModel;
    }

    if (JSON.stringify(editedInputSchema) !== JSON.stringify(archetype.input_schema ?? []))
      changes.input_schema = editedInputSchema;
    if (
      JSON.stringify(editedWorkerEnv) !==
      JSON.stringify((archetype.worker_env as Record<string, string>) ?? {})
    )
      changes.worker_env = editedWorkerEnv;

    if (Object.keys(changes).length === 0) {
      setEditMode(false);
      setSaving(false);
      toast.info('No changes to save');
      return;
    }

    try {
      await patchArchetype(tenantId, archetype.id, changes);
      toast.success('Employee config saved');
      setEditMode(false);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof EditValues) => (value: string | number) => {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  };

  const textareaClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y';

  if (!editMode) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleEdit}>
            Edit
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/20 p-5">
          {archetype.overview ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Role
                </p>
                <p className="mt-1 text-sm">{archetype.overview.role}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Trigger
                </p>
                <p className="mt-1 text-sm">{archetype.overview.trigger}</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                About this employee
              </p>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {archetype.instructions ?? 'No description available.'}
              </p>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-5">
          <h3 className="text-sm font-semibold">Behavior &amp; Settings</h3>

          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <dl>
              <FieldLabel>Approval</FieldLabel>
              <FieldValue>
                {archetype.risk_model?.approval_required ? (
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    Approval Required
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                  >
                    Auto-Approved
                  </Badge>
                )}
              </FieldValue>
            </dl>
            <dl>
              <FieldLabel>Slack Channel</FieldLabel>
              <FieldValue>
                <span className="font-mono text-xs">{archetype.notification_channel ?? '—'}</span>
              </FieldValue>
            </dl>
            <dl>
              <FieldLabel>Simultaneous Tasks</FieldLabel>
              <FieldValue>{archetype.concurrency_limit}</FieldValue>
            </dl>
            <dl>
              <FieldLabel>Maximum Duration</FieldLabel>
              <FieldValue>
                {archetype.risk_model?.timeout_hours != null
                  ? `${archetype.risk_model.timeout_hours} hours`
                  : '—'}
              </FieldValue>
            </dl>
          </div>

          <div>
            <FieldLabel>Task Instructions</FieldLabel>
            <dd className="mt-1 rounded-md border bg-muted/10 p-4">
              <MarkdownPreview content={archetype.instructions ?? ''} />
            </dd>
          </div>
        </div>

        <Separator />

        <Accordion type="single" collapsible>
          <AccordionItem value="technical-details" className="border-none">
            <AccordionTrigger className="py-2 text-sm font-medium text-muted-foreground hover:no-underline">
              Technical Details
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <dl>
                    <FieldLabel>Model</FieldLabel>
                    <FieldValue>
                      <span className="font-mono text-xs">{archetype.model ?? '—'}</span>
                    </FieldValue>
                  </dl>
                  <dl>
                    <FieldLabel>Runtime</FieldLabel>
                    <FieldValue>{archetype.runtime ?? '—'}</FieldValue>
                  </dl>
                  <dl>
                    <FieldLabel>VM Size</FieldLabel>
                    <FieldValue>{archetype.vm_size ?? '—'}</FieldValue>
                  </dl>
                  <dl>
                    <FieldLabel>Deliverable Type</FieldLabel>
                    <FieldValue>{archetype.deliverable_type ?? '—'}</FieldValue>
                  </dl>
                </div>

                <div>
                  <FieldLabel>System Prompt</FieldLabel>
                  <dd className="mt-1 rounded-md border bg-muted/10 p-4">
                    <MarkdownPreview content={archetype.system_prompt ?? ''} />
                  </dd>
                </div>

                <div>
                  <FieldLabel>Risk Model</FieldLabel>
                  <dd className="mt-1">
                    <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">
                      {JSON.stringify(archetype.risk_model ?? {}, null, 2)}
                    </pre>
                  </dd>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" size="sm" disabled={saving} onClick={handleCancel}>
          Cancel
        </Button>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Role Name
          </label>
          <Input value={editValues.role_name} onChange={(e) => set('role_name')(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Model
          </label>
          <Input
            value={editValues.model}
            onChange={(e) => set('model')(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Runtime
          </label>
          <Input value={editValues.runtime} onChange={(e) => set('runtime')(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Deliverable Type
          </label>
          <Input
            value={editValues.deliverable_type}
            onChange={(e) => set('deliverable_type')(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notification Channel
          </label>
          <Input
            value={editValues.notification_channel}
            onChange={(e) => set('notification_channel')(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            VM Size
          </label>
          <Input value={editValues.vm_size} onChange={(e) => set('vm_size')(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Concurrency Limit
          </label>
          <Input
            type="number"
            min={1}
            value={editValues.concurrency_limit}
            onChange={(e) => set('concurrency_limit')(parseInt(e.target.value, 10) || 1)}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inputs</p>
        <InputSchemaEditor
          value={editedInputSchema}
          onChange={setEditedInputSchema}
          readOnly={false}
        />
        {editedInputSchema
          .filter((item) => item.frequency === 'once')
          .map((item) => (
            <div key={item.key} className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Value for {item.label}
              </label>
              <Input
                value={editedWorkerEnv[item.key] ?? ''}
                onChange={(e) =>
                  setEditedWorkerEnv((prev) => ({ ...prev, [item.key]: e.target.value }))
                }
                placeholder={item.description ?? `Enter ${item.label}`}
              />
            </div>
          ))}
      </div>

      <Separator />

      <div className="space-y-4">
        <MarkdownEditorField
          label="Instructions"
          value={editValues.instructions}
          onChange={(v) => set('instructions')(v)}
          minHeight={400}
        />
        <MarkdownEditorField
          label="System Prompt"
          value={editValues.system_prompt}
          onChange={(v) => set('system_prompt')(v)}
          minHeight={250}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Risk Model (JSON)
          </label>
          <textarea
            className={textareaClass}
            rows={4}
            value={editValues.risk_model_json}
            onChange={(e) => set('risk_model_json')(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

const VALID_TABS = ['settings', 'activity', 'training', 'knowledge'] as const;

const TAB_COMPAT_MAP: Record<string, (typeof VALID_TABS)[number]> = {
  config: 'settings',
  tasks: 'activity',
  rules: 'training',
  brain: 'knowledge',
};

export function EmployeeDetail() {
  const { archetypeId } = useParams<{ archetypeId: string }>();
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const resolvedTab = tabParam ? (TAB_COMPAT_MAP[tabParam] ?? tabParam) : null;
  const activeTab = VALID_TABS.includes(resolvedTab as (typeof VALID_TABS)[number])
    ? (resolvedTab as (typeof VALID_TABS)[number])
    : 'settings';

  const handleTabChange = (newTab: string) => {
    setSearchParams(
      (prev) => {
        prev.set('tab', newTab);
        return prev;
      },
      { replace: true },
    );
  };

  const [triggering, setTriggering] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [firingWebhook, setFiringWebhook] = useState(false);

  const fetchArchetype = useCallback(
    () =>
      postgrestFetch<Archetype>('archetypes', {
        id: `eq.${archetypeId ?? ''}`,
        ...scopeByTenant(tenantId),
      }).then((arr) => arr[0] ?? null),
    [archetypeId, tenantId],
  );

  const { data: archetype, error, loading, refresh } = usePoll<Archetype | null>(fetchArchetype);

  const handleTrigger = async () => {
    if (!archetype?.role_name) return;
    setTriggering(true);
    try {
      const result = await triggerEmployee(tenantId, archetype.role_name, false);
      if (result.task_id) {
        toast.success('Task created', {
          description: result.task_id,
          action: {
            label: 'View',
            onClick: () => navigate(`/dashboard/tasks/${result.task_id}`),
          },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTriggering(false);
    }
  };

  const handleDryRun = async () => {
    if (!archetype?.role_name) return;
    setDryRunning(true);
    try {
      await triggerEmployee(tenantId, archetype.role_name, true);
      toast.success('Dry run OK — would fire');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDryRunning(false);
    }
  };

  const handleFireWebhook = async () => {
    setFiringWebhook(true);
    const messageUid = `test-msg-${Date.now()}`;
    try {
      const response = await fetch(`${GATEWAY_URL}/webhooks/hostfully`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...WEBHOOK_FIXTURES,
          event_type: 'NEW_INBOX_MESSAGE',
          message_uid: messageUid,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook error ${response.status}: ${text}`);
      }
      toast.success('Webhook fired — check Task Feed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setFiringWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center p-6 text-sm text-muted-foreground">Loading employee…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Failed to load employee</p>
          <p className="mt-1 text-destructive/80">{error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
            onClick={refresh}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!archetype) {
    return (
      <div className="flex items-center justify-center p-16 text-center">
        <p className="text-muted-foreground">Employee not found</p>
      </div>
    );
  }

  const isGuestMessaging = archetype.deliverable_type === 'hostfully_message';

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard/employees"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Employees
          </Link>
          <h1 className="text-xl font-semibold">{archetype.role_name ?? archetype.id}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={triggering || !archetype.role_name}
            onClick={() => {
              const hasEveryRunInputs = (archetype.input_schema ?? []).some(
                (item) => item.frequency === 'every_run',
              );
              if (hasEveryRunInputs) {
                navigate(`/dashboard/employees/${archetype.id}/trigger?tenant=${tenantId}`);
              } else {
                void handleTrigger();
              }
            }}
          >
            {triggering ? 'Triggering…' : 'Trigger'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={dryRunning || !archetype.role_name}
            onClick={() => void handleDryRun()}
          >
            {dryRunning ? 'Running…' : 'Dry Run'}
          </Button>
          {isGuestMessaging && (
            <Button
              size="sm"
              variant="secondary"
              disabled={firingWebhook}
              onClick={() => void handleFireWebhook()}
            >
              {firingWebhook ? 'Firing…' : 'Fire Webhook'}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <ConfigTab archetype={archetype} onSaved={refresh} />
        </TabsContent>

        <TabsContent value="activity">
          <RecentTasksSection archetypeId={archetype.id} />
        </TabsContent>

        <TabsContent value="training">
          <RulesSection archetypeId={archetype.id} />
        </TabsContent>

        <TabsContent value="knowledge">
          <BrainPreviewTab archetype={archetype} tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
