import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { CollapsibleSection } from '@/panels/employees/components/CollapsibleSection';
import { InputSchemaEditor } from '@/panels/employees/components/InputSchemaEditor';
import {
  generateArchetype,
  createArchetype,
  fetchSlackChannels,
  fetchGitHubRepos,
  compilePreview,
} from '@/lib/gateway';
import { postgrestFetch } from '@/lib/postgrest';
import type {
  GenerateArchetypeResponse,
  SlackChannel,
  InputSchemaItem,
  TenantIntegration,
  GitHubRepo,
} from '@/lib/types';
import { useTenant } from '@/hooks/use-tenant';

type WizardStep =
  | 'describe'
  | 'generating'
  | 'edit'
  | 'previewing'
  | 'preview'
  | 'saving'
  | 'error';

export function CreateEmployeePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantId } = useTenant();

  const [step, setStep] = useState<WizardStep>('describe');
  const [description, setDescription] = useState('');
  const [notificationChannel, setNotificationChannel] = useState('');
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackError, setSlackError] = useState<string | undefined>();
  const [slackLoading, setSlackLoading] = useState(true);
  const [config, setConfig] = useState<GenerateArchetypeResponse | null>(null);
  const [editedFields, setEditedFields] = useState({
    identity: '',
    execution_steps: '',
    delivery_steps: '',
    role_name: '',
    approval_required: false,
    trigger_type: 'manual' as 'manual' | 'scheduled' | 'webhook',
    temperature: 1.0,
  });
  const [inputSchemaItems, setInputSchemaItems] = useState<InputSchemaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compiledPreview, setCompiledPreview] = useState<string | null>(null);

  const [repoUrl, setRepoUrl] = useState<string>(() => {
    const encoded = searchParams.get('repo');
    return encoded ? decodeURIComponent(encoded) : '';
  });
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSlackLoading(true);
    fetchSlackChannels(tenantId)
      .then((result) => {
        if (cancelled) return;
        setSlackChannels(result.channels ?? []);
        if (result.error) setSlackError(result.error);
        setSlackLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSlackChannels([]);
        setSlackError('SLACK_NOT_CONFIGURED');
        setSlackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    postgrestFetch<TenantIntegration>('tenant_integrations', {
      tenant_id: `eq.${tenantId}`,
      provider: 'eq.github',
    })
      .then((rows) => {
        if (cancelled) return;
        setGithubConnected(rows.length > 0);
      })
      .catch(() => {
        if (cancelled) return;
        setGithubConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!githubConnected) return;
    let cancelled = false;
    setReposLoading(true);
    setReposError(null);
    fetchGitHubRepos(tenantId)
      .then((data) => {
        if (cancelled) return;
        setRepos(data.repos ?? []);
        setReposLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRepos([]);
        setReposError(err instanceof Error ? err.message : 'Failed to load repositories');
        setReposLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, githubConnected]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (repoUrl) {
          next.set('repo', encodeURIComponent(repoUrl));
        } else {
          next.delete('repo');
        }
        return next;
      },
      { replace: true },
    );
  }, [repoUrl, setSearchParams]);

  const handleGenerate = async () => {
    setStep('generating');
    try {
      const result = await generateArchetype(tenantId, description);
      setConfig(result);
      setEditedFields({
        identity: result.identity ?? '',
        execution_steps: result.execution_steps ?? '',
        delivery_steps: result.delivery_steps ?? '',
        role_name: result.role_name,
        approval_required: result.risk_model.approval_required,
        trigger_type:
          result.trigger_sources?.type === 'scheduled'
            ? 'scheduled'
            : result.trigger_sources?.type === 'webhook'
              ? 'webhook'
              : 'manual',
        temperature: result.temperature ?? 1.0,
      });
      setInputSchemaItems(result.input_schema ?? []);
      setStep('edit');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  const handlePreview = async () => {
    setStep('previewing');
    try {
      const result = await compilePreview(tenantId, {
        identity: editedFields.identity,
        execution_steps: editedFields.execution_steps,
        delivery_steps: editedFields.delivery_steps || null,
      });
      setCompiledPreview(result.compiled_agents_md);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  const handleSaveDraft = async () => {
    if (!config) return;
    setStep('saving');
    try {
      const triggerSources =
        editedFields.trigger_type === 'scheduled'
          ? { type: 'scheduled' as const, cron: '0 8 * * 1-5' }
          : editedFields.trigger_type === 'webhook'
            ? { type: 'webhook' as const }
            : { type: 'manual' as const };

      const archetype = await createArchetype(tenantId, {
        ...config,
        role_name: editedFields.role_name,
        instructions: editedFields.execution_steps,
        identity: editedFields.identity,
        execution_steps: editedFields.execution_steps,
        delivery_steps: editedFields.delivery_steps || null,
        temperature: editedFields.temperature,
        input_schema: inputSchemaItems.length > 0 ? inputSchemaItems : undefined,
        overview: config?.overview ?? undefined,
        risk_model: {
          approval_required: editedFields.approval_required,
          timeout_hours: config.risk_model.timeout_hours,
        },
        trigger_sources: triggerSources,
        notification_channel: notificationChannel || null,
        worker_env: repoUrl ? { GITHUB_REPO_URL: repoUrl } : undefined,
        status: 'draft',
        parent_draft_id: null,
      });
      navigate(`/dashboard/employees/${archetype.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  };

  const pageTitle = (): string => {
    switch (step) {
      case 'generating':
        return 'Generating Configuration…';
      case 'edit':
        return 'Review & Edit';
      case 'previewing':
        return 'Compiling Preview…';
      case 'preview':
        return 'Preview AGENTS.md';
      case 'saving':
        return 'Saving Draft…';
      default:
        return 'Create New Employee';
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard/employees')}
          className="text-muted-foreground hover:text-foreground"
        >
          ← Employees
        </Button>
        <h1 className="text-lg font-semibold">{pageTitle()}</h1>
      </div>

      {step === 'describe' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Describe what you want your AI employee to do. Be specific about its tasks, schedule,
            and any tools it should use.
          </p>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[160px] resize-none"
            placeholder="e.g., An employee that reads our #support Slack channel every morning and sends a summary of unresolved customer issues to #support-summary..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{description.length}/2000</span>
            <Button
              onClick={() => void handleGenerate()}
              disabled={description.length < 10 || description.length > 2000}
            >
              Generate
            </Button>
          </div>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">
            Analyzing your description and generating a complete employee configuration…
          </p>
        </div>
      )}

      {step === 'edit' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Review and edit the generated configuration. These fields become your employee's
            instruction manual.
          </p>

          <CollapsibleSection title="Core" defaultOpen={true}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Employee Name</label>
                <p className="text-xs text-muted-foreground">
                  A unique identifier for this employee (lowercase, hyphens only). Used in URLs and
                  API calls.
                </p>
                <Input
                  value={editedFields.role_name}
                  onChange={(e) => setEditedFields((f) => ({ ...f, role_name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Identity</label>
                <p className="text-xs text-muted-foreground">
                  Describe who this employee is — their personality, background, and expertise. This
                  shapes how they think and communicate. Don't include step-by-step instructions
                  here.
                </p>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[180px] resize-y"
                  value={editedFields.identity}
                  onChange={(e) => setEditedFields((f) => ({ ...f, identity: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Execution Steps</label>
                <p className="text-xs text-muted-foreground">
                  The numbered steps this employee follows when doing their job. Be specific — these
                  go directly into the employee's instruction manual.
                </p>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[200px] resize-y"
                  value={editedFields.execution_steps}
                  onChange={(e) =>
                    setEditedFields((f) => ({ ...f, execution_steps: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Trigger Inputs</label>
                <p className="text-xs text-muted-foreground">
                  Information this employee needs each time it runs. The AI detected these from your
                  description — add, edit, or remove as needed.
                </p>
                <InputSchemaEditor
                  items={inputSchemaItems}
                  instructions={editedFields.execution_steps}
                  onChange={setInputSchemaItems}
                />
              </div>

              {config?.overview && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Overview</label>
                  <div className="rounded-md border bg-muted/10 px-4 py-3 space-y-2">
                    {[
                      { label: 'Role', value: config.overview.role },
                      { label: 'Trigger', value: config.overview.trigger },
                      { label: 'Workflow', value: config.overview.workflow.join(' → ') },
                      { label: 'Tools', value: config.overview.tools_used },
                      { label: 'Output', value: config.overview.output },
                      { label: 'Approval', value: config.overview.approval },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <p className="text-sm">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Delivery" defaultOpen={true}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Delivery Steps</label>
                <p className="text-xs text-muted-foreground">
                  How this employee delivers their completed work (e.g., posting to Slack, sending a
                  message). Only needed when approval is required — leave empty for auto-complete
                  employees.
                </p>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[150px] resize-y"
                  value={editedFields.delivery_steps}
                  onChange={(e) =>
                    setEditedFields((f) => ({ ...f, delivery_steps: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="approval-toggle"
                    checked={editedFields.approval_required}
                    onChange={(e) =>
                      setEditedFields((f) => ({ ...f, approval_required: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  <label htmlFor="approval-toggle" className="text-sm font-medium">
                    Requires approval
                  </label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  When enabled, a team member must review and approve the employee's work before
                  it's delivered.
                </p>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Code Repository" defaultOpen={false}>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Select the repository this employee will work in. Optional — the employee can still
                run without a repository selected.
              </p>
              {githubConnected === null ? (
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              ) : githubConnected ? (
                reposLoading ? (
                  <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                ) : reposError ? (
                  <p className="text-xs text-destructive">{reposError}</p>
                ) : (
                  <SearchableSelect
                    options={repos.map((r) => ({ value: r.html_url, label: r.full_name }))}
                    value={repoUrl}
                    onValueChange={setRepoUrl}
                    placeholder="Select a repository..."
                    searchPlaceholder="Search repositories..."
                  />
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  Connect GitHub in Settings → Integrations to enable repository selection.
                </p>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Settings" defaultOpen={false}>
            <div className="space-y-4">
              {config && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Selected Model</label>
                  <div className="rounded-md border bg-muted/10 px-3 py-2 space-y-0.5">
                    <p className="text-sm font-medium">
                      {config.modelRecommendation?.recommended?.displayName ?? config.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {config.modelRecommendation?.recommended
                        ? 'Recommended based on your employee type'
                        : 'Default model'}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Creativity</label>
                <p className="text-xs text-muted-foreground">
                  Higher values produce more varied responses. Lower values are more focused and
                  predictable.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={editedFields.temperature}
                    onChange={(e) =>
                      setEditedFields((f) => ({ ...f, temperature: parseFloat(e.target.value) }))
                    }
                    className="flex-1 h-2 accent-primary"
                  />
                  <span className="text-sm font-mono w-8 text-right">
                    {editedFields.temperature.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Focused</span>
                  <span>Balanced</span>
                  <span>Creative</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Trigger</label>
                <SearchableSelect
                  options={[
                    { value: 'manual', label: 'Manual' },
                    { value: 'scheduled', label: 'Scheduled' },
                    { value: 'webhook', label: 'Webhook' },
                  ]}
                  value={editedFields.trigger_type}
                  onValueChange={(v) =>
                    setEditedFields((f) => ({
                      ...f,
                      trigger_type: v as 'manual' | 'scheduled' | 'webhook',
                    }))
                  }
                  placeholder="Select trigger type"
                />
                <p className="text-xs text-muted-foreground">
                  How this employee gets started — manually by a team member, on a schedule, or when
                  something happens (webhook).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Slack Channel</label>
                {slackLoading ? (
                  <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                ) : slackChannels.length > 0 ? (
                  <SearchableSelect
                    options={slackChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` }))}
                    value={notificationChannel}
                    onValueChange={setNotificationChannel}
                    placeholder="Select a channel..."
                    searchPlaceholder="Search channels..."
                  />
                ) : (
                  <Input
                    value={notificationChannel}
                    onChange={(e) => setNotificationChannel(e.target.value)}
                    placeholder="#channel-name or channel ID"
                  />
                )}
                {slackError === 'SLACK_NOT_CONFIGURED' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Slack not configured for this tenant. Enter a channel ID manually.
                  </p>
                )}
                {slackError && slackError !== 'SLACK_NOT_CONFIGURED' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Could not load channels — enter a channel ID manually.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  The Slack channel where this employee operates — all notifications, approvals, and
                  deliveries go here.
                </p>
              </div>
            </div>
          </CollapsibleSection>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep('describe')}>
              ← Back to Describe
            </Button>
            <Button onClick={() => void handlePreview()}>Preview AGENTS.md →</Button>
          </div>
        </div>
      )}

      {step === 'previewing' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">Compiling preview…</p>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This is the complete instruction manual your employee will receive. Review it before
            saving.
          </p>
          <div className="rounded-lg border bg-card p-4 overflow-auto max-h-[600px]">
            {compiledPreview && <MarkdownPreview content={compiledPreview} />}
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep('edit')}>
              ← Back to Edit
            </Button>
            <Button onClick={() => void handleSaveDraft()}>Save as Draft</Button>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">Saving draft…</p>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Generation Failed</p>
            <p className="mt-1 text-destructive/80">{error}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setStep('describe')}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
