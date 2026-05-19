import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateArchetype, createArchetype } from '@/lib/gateway';
import type { GenerateArchetypeResponse } from '@/lib/types';
import { useTenant } from '@/hooks/use-tenant';

type PageState =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'saving'; config: GenerateArchetypeResponse }
  | { phase: 'error'; message: string };

export function CreateEmployeePage() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [pageState, setPageState] = useState<PageState>({ phase: 'idle' });
  const [description, setDescription] = useState('');
  const [notificationChannel, setNotificationChannel] = useState('');

  const handleSaveDraft = async (config: GenerateArchetypeResponse) => {
    setPageState({ phase: 'saving', config });
    try {
      const archetype = await createArchetype(tenantId, {
        ...config,
        model: config.model,
        runtime: config.runtime,
        notification_channel: notificationChannel || null,
        status: 'draft',
        overview: config.overview,
        parent_draft_id: null,
      });
      navigate(`/dashboard/employees/${archetype.id}/edit`);
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
      await handleSaveDraft(config);
    } catch (err) {
      setPageState({
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const state = pageState;

  const pageTitle = (): string => {
    switch (state.phase) {
      case 'generating':
        return 'Generating Configuration…';
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

      {state.phase === 'idle' && (
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
            <Input
              value={notificationChannel}
              onChange={(e) => setNotificationChannel(e.target.value)}
              placeholder="#channel-name"
              className="text-sm"
            />
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

      {state.phase === 'generating' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">
            Analyzing your description and generating a complete employee configuration…
          </p>
        </div>
      )}

      {state.phase === 'saving' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">Saving draft…</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="space-y-4">
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Generation Failed</p>
            <p className="mt-1 text-destructive/80">{state.message}</p>
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
