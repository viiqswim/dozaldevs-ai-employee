import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { generateArchetype, createArchetype, compilePreview } from '@/lib/gateway';
import { useSlackChannels } from '@/hooks/use-slack-channels';
import { useWizardData } from '@/hooks/use-wizard-data';
import type { GenerateArchetypeResponse, InputSchemaItem } from '@/lib/types';
import { useTenant } from '@/hooks/use-tenant';
import { WizardEditStep } from '@/panels/employees/components/WizardEditStep';
import type { EditedFields } from '@/panels/employees/components/WizardEditStep';

type WizardStep =
  | 'describe'
  | 'generating'
  | 'edit'
  | 'previewing'
  | 'preview'
  | 'saving'
  | 'error';

const GENERIC_GENERATION_ERROR =
  "We couldn't generate your employee right now. Please try again in a moment, or add more detail to your description.";

function friendlyGenerationMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const looksTechnical =
    /gateway error|\b\d{3}\b|[{}]|GENERATION_FAILED|invalid JSON|\bLLM\b|<[^>]+>/i.test(raw);
  return !raw.trim() || looksTechnical ? GENERIC_GENERATION_ERROR : raw;
}

export function CreateEmployeePage() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [step, setStep] = useState<WizardStep>('describe');
  const [description, setDescription] = useState('');
  const [notificationChannel, setNotificationChannel] = useState('');
  const {
    channels: slackChannels,
    loading: slackLoading,
    error: slackError,
  } = useSlackChannels(tenantId);
  const [config, setConfig] = useState<GenerateArchetypeResponse | null>(null);
  const [editedFields, setEditedFields] = useState<EditedFields>({
    identity: '',
    execution_steps: '',
    delivery_steps: '',
    role_name: '',
    approval_required: false,
    trigger_type: 'manual',
    temperature: 1.0,
  });
  const [inputSchemaItems, setInputSchemaItems] = useState<InputSchemaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compiledPreview, setCompiledPreview] = useState<string | null>(null);

  const { repoUrl, setRepoUrl, repos, reposLoading, reposError, githubConnected } =
    useWizardData(tenantId);

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
      setError(friendlyGenerationMessage(err));
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
          onClick={() => navigate(`/dashboard/employees?tenant=${tenantId}`)}
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
        <WizardEditStep
          editedFields={editedFields}
          setEditedFields={setEditedFields}
          inputSchemaItems={inputSchemaItems}
          setInputSchemaItems={setInputSchemaItems}
          config={config}
          repos={repos}
          reposLoading={reposLoading}
          reposError={reposError}
          githubConnected={githubConnected}
          repoUrl={repoUrl}
          setRepoUrl={setRepoUrl}
          slackChannels={slackChannels}
          slackLoading={slackLoading}
          slackError={slackError}
          notificationChannel={notificationChannel}
          setNotificationChannel={setNotificationChannel}
          onPreview={() => {
            void handlePreview();
          }}
          onBack={() => setStep('describe')}
        />
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
