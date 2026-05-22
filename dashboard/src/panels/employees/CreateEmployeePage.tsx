import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  generateArchetype,
  createArchetype,
  fetchSlackChannels,
  recommendModel,
} from '@/lib/gateway';
import type { ModelRecommendation, ModelQuestionAnswers } from '@/lib/gateway';
import type { GenerateArchetypeResponse, SlackChannel } from '@/lib/types';
import { useTenant } from '@/hooks/use-tenant';
import { ModelQuestionsStep } from './components/ModelQuestionsStep';
import { ModelRecommendationStep } from './components/ModelRecommendationStep';

type PageState =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'questions'; config: GenerateArchetypeResponse }
  | { phase: 'recommending'; config: GenerateArchetypeResponse; answers: ModelQuestionAnswers }
  | {
      phase: 'review';
      config: GenerateArchetypeResponse;
      recommendation: ModelRecommendation | null;
      answers: ModelQuestionAnswers;
    }
  | { phase: 'saving'; config: GenerateArchetypeResponse }
  | { phase: 'error'; message: string };

export function CreateEmployeePage() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [pageState, setPageState] = useState<PageState>({ phase: 'idle' });
  const [description, setDescription] = useState('');
  const [notificationChannel, setNotificationChannel] = useState('');
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackError, setSlackError] = useState<string | undefined>();
  const [slackLoading, setSlackLoading] = useState(true);

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

  const handleSaveDraft = async (config: GenerateArchetypeResponse, selectedModel?: string) => {
    setPageState({ phase: 'saving', config });
    try {
      const archetype = await createArchetype(tenantId, {
        ...config,
        model: selectedModel ?? config.model,
        runtime: config.runtime,
        notification_channel: notificationChannel || null,
        status: 'draft',
        overview: config.overview,
        parent_draft_id: null,
      });
      navigate(`/dashboard/employees/${archetype.id}`);
    } catch (err) {
      setPageState({
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleGenerate = async () => {
    setPageState({ phase: 'generating' });
    try {
      const config = await generateArchetype(tenantId, description);
      setPageState({ phase: 'questions', config });
    } catch (err) {
      setPageState({
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleGetRecommendations = async (answers: ModelQuestionAnswers) => {
    if (pageState.phase !== 'questions') return;
    const { config } = pageState;
    setPageState({ phase: 'recommending', config, answers });
    try {
      const recommendation = await recommendModel(tenantId, config, answers);
      setPageState({ phase: 'review', config, recommendation, answers });
    } catch {
      // Graceful fallback — API failed, continue with default model
      setPageState({ phase: 'review', config, recommendation: null, answers });
    }
  };

  const handleSkipQuestions = () => {
    if (pageState.phase !== 'questions') return;
    const { config } = pageState;
    void handleSaveDraft(config);
  };

  const handleConfirmModel = (selectedModel: string) => {
    if (pageState.phase !== 'review') return;
    const { config } = pageState;
    void handleSaveDraft(config, selectedModel);
  };

  const handleBackToQuestions = () => {
    if (pageState.phase !== 'review') return;
    const { config } = pageState;
    setPageState({ phase: 'questions', config });
  };

  const pageTitle = (): string => {
    switch (pageState.phase) {
      case 'generating':
        return 'Generating Configuration…';
      case 'questions':
        return 'Pick the right model';
      case 'recommending':
        return 'Finding recommendations…';
      case 'review':
        return 'Choose your AI model';
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

      {pageState.phase === 'idle' && (
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
          <div className="space-y-2">
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
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{description.length}/2000</span>
            <Button
              onClick={() => void handleGenerate()}
              disabled={
                description.length < 10 || description.length > 2000 || !notificationChannel.trim()
              }
            >
              Generate
            </Button>
          </div>
        </div>
      )}

      {pageState.phase === 'generating' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">
            Analyzing your description and generating a complete employee configuration…
          </p>
        </div>
      )}

      {pageState.phase === 'questions' && (
        <ModelQuestionsStep
          onSubmit={(answers) => void handleGetRecommendations(answers)}
          onSkip={handleSkipQuestions}
        />
      )}

      {pageState.phase === 'recommending' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">
            Finding the best model for your employee…
          </p>
        </div>
      )}

      {pageState.phase === 'review' && (
        <ModelRecommendationStep
          recommendation={pageState.recommendation}
          defaultModel={pageState.config.model}
          onConfirm={handleConfirmModel}
          onBack={handleBackToQuestions}
        />
      )}

      {pageState.phase === 'saving' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">Saving draft…</p>
        </div>
      )}

      {pageState.phase === 'error' && (
        <div className="space-y-4">
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Generation Failed</p>
            <p className="mt-1 text-destructive/80">{pageState.message}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setPageState({ phase: 'idle' })}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
