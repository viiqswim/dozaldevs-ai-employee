import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { Loader2 } from 'lucide-react';
import { createArchetype, compilePreview, converseCreate } from '@/lib/gateway';
import { useSlackChannels } from '@/hooks/use-slack-channels';
import { useWizardData } from '@/hooks/use-wizard-data';
import type { GenerateArchetypeResponse, InputSchemaItem } from '@/lib/types';
import { useTenant } from '@/hooks/use-tenant';
import { WizardEditStep } from '@/panels/employees/components/WizardEditStep';
import type { EditedFields } from '@/panels/employees/components/WizardEditStep';
import { useChatConversation } from './use-chat-conversation';

type WizardStep = 'describe' | 'edit' | 'previewing' | 'preview' | 'saving' | 'error';

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

  const chatHook = useChatConversation((transcript) => converseCreate(tenantId, transcript));

  useEffect(() => {
    if (step !== 'describe') return;

    const proposalMsg = chatHook.messages.find(
      (m) => m.kind === 'proposal' && m.role === 'assistant',
    );
    if (!proposalMsg?.proposal) return;

    const baselineData = proposalMsg.proposal.baseline as Record<string, unknown>;
    const proposalData = proposalMsg.proposal.proposal as Record<string, unknown>;
    const merged = { ...baselineData, ...proposalData };
    const triggerSrc = merged.trigger_sources as { type?: string } | null | undefined;

    setConfig(merged as unknown as GenerateArchetypeResponse);
    setEditedFields({
      identity: String(merged.identity ?? ''),
      execution_steps: String(merged.execution_steps ?? ''),
      delivery_steps: String(merged.delivery_steps ?? ''),
      role_name: String(merged.role_name ?? ''),
      approval_required: Boolean(
        (merged.risk_model as { approval_required?: boolean } | null | undefined)
          ?.approval_required ?? false,
      ),
      trigger_type:
        triggerSrc?.type === 'scheduled'
          ? 'scheduled'
          : triggerSrc?.type === 'webhook'
            ? 'webhook'
            : 'manual',
      temperature: Number(merged.temperature ?? 1.0),
    });
    setInputSchemaItems((merged.input_schema as InputSchemaItem[] | null | undefined) ?? []);
    setStep('edit');
  }, [chatHook.messages, step]);

  const inChatMode = chatHook.messages.length > 0 || chatHook.isLoading;

  const handleDescribeGenerate = async () => {
    if (description.length < 10 || description.length > 2000 || chatHook.isLoading) return;
    const text = description;
    setDescription('');
    await chatHook.submit(text);
  };

  const handleChatSend = async () => {
    if (!description.trim() || chatHook.isLoading) return;
    const text = description;
    setDescription('');
    await chatHook.submit(text);
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
          {!inChatMode ? (
            <>
              <p className="text-sm text-muted-foreground">
                Describe what you want your AI employee to do. Be specific about its tasks,
                schedule, and any tools it should use.
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
                  onClick={() => void handleDescribeGenerate()}
                  disabled={description.length < 10 || description.length > 2000}
                >
                  Generate
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {chatHook.messages.map((msg) => {
                  if (msg.kind === 'proposal') return null;
                  return msg.role === 'user' ? (
                    <div key={msg.id} className="flex justify-end">
                      <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%] text-sm">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%] text-sm">
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
                {chatHook.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Thinking…</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 items-end border-t pt-3">
                <textarea
                  className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  rows={2}
                  placeholder="Reply…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={chatHook.isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleChatSend();
                    }
                  }}
                />
                <Button
                  onClick={() => void handleChatSend()}
                  disabled={!description.trim() || chatHook.isLoading}
                >
                  {chatHook.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  chatHook.startFresh();
                  setDescription('');
                }}
              >
                ← Start over
              </Button>
            </>
          )}
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
