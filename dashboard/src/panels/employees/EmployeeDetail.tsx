import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { triggerEmployee, deleteArchetype, patchArchetype, listModelCatalog } from '@/lib/gateway';
import { GATEWAY_URL } from '@/lib/constants';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import type { Archetype, Tenant, ModelCatalogEntry } from '@/lib/types';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { EmployeeProfileLayout } from './EmployeeProfileLayout';
import { ActivitySection } from './sections/ActivitySection';
import { InputSchemaSection } from './sections/InputSchemaSection';
import { TrainingTab } from './TrainingTab';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import type { ProfileMode } from '@/lib/profile-constants';

function computeCostTierLabel(inputCost: number, outputCost: number, isFree: boolean): string {
  if (isFree) return 'Free';
  const avg = (inputCost + outputCost) / 2;
  if (avg < 0.5) return 'Budget';
  if (avg < 3.0) return 'Standard';
  return 'Premium';
}

const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const WEBHOOK_FIXTURES = {
  agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
  lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
  property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
} as const;

export function EmployeeDetail() {
  const { archetypeId } = useParams<{ archetypeId: string }>();
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') ?? 'profile';

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'profile') {
      next.delete('tab');
    } else {
      next.set('tab', value);
    }
    setSearchParams(next, { replace: true });
  };

  const [triggering, setTriggering] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [firingWebhook, setFiringWebhook] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);

  const [catalogModels, setCatalogModels] = useState<ModelCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [modelSaving, setModelSaving] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const escapeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    listModelCatalog()
      .then((models) => {
        if (cancelled) return;
        setCatalogModels(models);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalogModels([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const fetchArchetype = useCallback(
    () =>
      postgrestFetch<Archetype>('archetypes', {
        id: `eq.${archetypeId ?? ''}`,
        ...scopeByTenant(tenantId),
        deleted_at: 'is.null',
      }).then((arr) => arr[0] ?? null),
    [archetypeId, tenantId],
  );

  const { data: archetype, error, loading, refresh } = usePoll<Archetype | null>(fetchArchetype);

  const fetchTenant = useCallback(
    () => postgrestFetch<Tenant>('tenants', { id: `eq.${tenantId}` }).then((arr) => arr[0] ?? null),
    [tenantId],
  );
  const { data: tenant } = usePoll<Tenant | null>(fetchTenant);

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

  const handleDelete = async () => {
    if (!archetype || !tenantId) return;
    setDeleteLoading(true);
    try {
      await deleteArchetype(tenantId, archetype.id);
      toast.success('Employee deleted');
      setDeleteDialogOpen(false);
      navigate('/dashboard/employees?tenant=' + tenantId);
    } catch {
      toast.error('Failed to delete employee');
    } finally {
      setDeleteLoading(false);
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

  const handleSaveName = async (value: string) => {
    if (!archetype) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setNameError('Name is required');
      return;
    }
    if (!KEBAB_REGEX.test(trimmed)) {
      setNameError('Use lowercase letters, numbers, and hyphens only (e.g. my-employee)');
      return;
    }
    if (trimmed === archetype.role_name) {
      setIsEditingName(false);
      setNameError(null);
      return;
    }
    setNameSaving(true);
    try {
      await patchArchetype(tenantId, archetype.id, { role_name: trimmed });
      toast.success('Name updated');
      refresh();
      setIsEditingName(false);
      setNameError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409')) {
        toast.error('This name is already taken by an active employee.');
      } else {
        toast.error(msg);
      }
    } finally {
      setNameSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!archetype) return;
    if (
      !archetype.role_name?.trim() ||
      !archetype.instructions?.trim() ||
      !archetype.agents_md?.trim()
    ) {
      toast.error('Role name, trigger prompt, and employee brain are required');
      return;
    }
    setFinalizing(true);
    try {
      await patchArchetype(tenantId, archetype.id, { status: 'active' });
      toast.success('Employee created');
      navigate('/dashboard/employees');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409') || msg.includes('ROLE_NAME_TAKEN')) {
        toast.error(
          'This name is already taken by an active employee. Change the role name first.',
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-6 w-52 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-lg border bg-muted" />
          <div className="h-px bg-border" />
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-48 animate-pulse rounded-lg border bg-muted" />
        </div>
      </div>
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

  const showWebhookButton = archetype.deliverable_type === 'hostfully_message';

  const jiraWebhookUrl =
    tenant?.slug && archetype.role_name
      ? `${GATEWAY_URL}/webhooks/jira/${tenant.slug}/${archetype.role_name}`
      : null;

  const handleCopyWebhookUrl = async () => {
    if (!jiraWebhookUrl) return;
    await navigator.clipboard.writeText(jiraWebhookUrl);
    setWebhookUrlCopied(true);
    setTimeout(() => setWebhookUrlCopied(false), 2000);
  };
  const mode: ProfileMode = archetype.status === 'draft' ? 'edit' : 'view';

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
          {isEditingName ? (
            <div className="flex flex-col gap-0.5">
              <input
                className="text-xl font-semibold bg-transparent border-b border-border focus:border-primary outline-none min-w-[12ch]"
                size={Math.max((editNameValue?.length ?? 0) + 2, 12)}
                value={editNameValue}
                autoFocus
                disabled={nameSaving}
                onChange={(e) => {
                  setEditNameValue(e.target.value);
                  setNameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSaveName(editNameValue);
                  } else if (e.key === 'Escape') {
                    escapeRef.current = true;
                    setIsEditingName(false);
                    setEditNameValue('');
                    setNameError(null);
                  }
                }}
                onBlur={() => {
                  if (escapeRef.current) {
                    escapeRef.current = false;
                    return;
                  }
                  void handleSaveName(editNameValue);
                }}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
          ) : (
            <button
              type="button"
              className="group flex items-center gap-1.5 text-xl font-semibold text-left hover:opacity-70 transition-opacity cursor-text"
              onClick={() => {
                setIsEditingName(true);
                setEditNameValue(archetype.role_name ?? '');
                setNameError(null);
              }}
              title="Click to rename"
            >
              {archetype.role_name ?? archetype.id}
              <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
            </button>
          )}
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
          {showWebhookButton && (
            <Button
              size="sm"
              variant="secondary"
              disabled={firingWebhook}
              onClick={() => void handleFireWebhook()}
            >
              {firingWebhook ? 'Firing…' : 'Fire Webhook'}
            </Button>
          )}
          {archetype.status === 'draft' && (
            <Button
              size="sm"
              disabled={
                finalizing ||
                !archetype.role_name?.trim() ||
                !archetype.instructions?.trim() ||
                !archetype.agents_md?.trim() ||
                !archetype.notification_channel?.trim()
              }
              onClick={() => void handleFinalize()}
            >
              {finalizing ? 'Creating…' : 'Create Employee'}
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <EmployeeProfileLayout
            archetype={archetype}
            mode={mode}
            tenantId={tenantId}
            onSaved={refresh}
          />
        </TabsContent>

        <TabsContent value="activity">
          <div className="rounded-lg border bg-card px-5 py-4">
            <ActivitySection archetypeId={archetype.id} />
          </div>
        </TabsContent>

        <TabsContent value="training">
          <div className="rounded-lg border bg-card px-5 py-4">
            <TrainingTab archetypeId={archetype.id} tenantId={tenantId} />
          </div>
        </TabsContent>

        <TabsContent value="advanced">
          <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              For developers only — most users can ignore this section.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <dl>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AI Model
                </dt>
                <dd className="mt-1">
                  {catalogLoading ? (
                    <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                  ) : (
                    <SearchableSelect
                      options={(() => {
                        const opts = catalogModels.map((m) => ({
                          value: m.model_id,
                          label: `${m.display_name} (${m.provider}) — ${computeCostTierLabel(m.input_cost_per_million, m.output_cost_per_million, m.is_free)}`,
                        }));
                        const current = archetype.model;
                        if (current && !opts.find((o) => o.value === current)) {
                          opts.unshift({ value: current, label: `${current} (custom)` });
                        }
                        return opts;
                      })()}
                      value={archetype.model ?? ''}
                      onValueChange={async (modelId) => {
                        if (modelId === archetype.model) return;
                        setModelSaving(true);
                        try {
                          await patchArchetype(tenantId, archetype.id, { model: modelId });
                          toast.success('Model updated');
                          refresh();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : String(err));
                        } finally {
                          setModelSaving(false);
                        }
                      }}
                      placeholder="Select a model..."
                      searchPlaceholder="Search models..."
                      disabled={modelSaving}
                    />
                  )}
                </dd>
              </dl>
              <dl>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Runtime
                </dt>
                <dd className="mt-0.5 text-sm">{archetype.runtime ?? '—'}</dd>
              </dl>
              <dl>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Machine size
                </dt>
                <dd className="mt-0.5 text-sm">{archetype.vm_size ?? '—'}</dd>
              </dl>
              <dl>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Output type
                </dt>
                <dd className="mt-0.5 text-sm">{archetype.deliverable_type ?? '—'}</dd>
              </dl>
            </div>
            <InputSchemaSection
              items={archetype.input_schema ?? []}
              tenantId={tenantId}
              archetypeId={archetype.id}
              instructions={archetype.instructions ?? ''}
              onSaved={refresh}
            />
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                System prompt (legacy)
              </dt>
              <dd className="mt-1 rounded-md border bg-muted/10 p-4">
                <MarkdownPreview content={archetype.system_prompt ?? ''} />
              </dd>
            </div>
            {jiraWebhookUrl && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Jira Webhook URL
                </dt>
                <dd className="mt-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded border bg-muted/30 px-3 py-2 font-mono text-xs break-all">
                      {jiraWebhookUrl}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => void handleCopyWebhookUrl()}>
                      {webhookUrlCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add this URL as a webhook in your Jira project settings. Select &ldquo;Issue
                    Created&rdquo; as the trigger event.
                  </p>
                </dd>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {archetype.role_name}?</DialogTitle>
            <DialogDescription>
              This employee will be soft-deleted. You can restore it later from the &ldquo;Show
              deleted&rdquo; view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLoading}
              onClick={() => void handleDelete()}
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
