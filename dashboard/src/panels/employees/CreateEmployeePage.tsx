import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateArchetype, createArchetype, refineArchetype } from '@/lib/gateway';
import type { GenerateArchetypeResponse, Archetype } from '@/lib/types';
import { useTenant } from '@/hooks/use-tenant';
import { CreateEmployeePreview } from './CreateEmployeePreview';
import { CreateEmployeeNextSteps } from './CreateEmployeeNextSteps';

type PageState =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'preview'; config: GenerateArchetypeResponse }
  | { phase: 'creating'; config: GenerateArchetypeResponse }
  | { phase: 'success'; archetype: Archetype }
  | { phase: 'error'; message: string };

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isValidSlug(s: string): boolean {
  return SLUG_REGEX.test(s);
}

export function CreateEmployeePage() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [pageState, setPageState] = useState<PageState>({ phase: 'idle' });
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [notificationChannel, setNotificationChannel] = useState('');
  const [refinementCount, setRefinementCount] = useState(0);
  const [refinementInput, setRefinementInput] = useState('');
  const [originalDescription, setOriginalDescription] = useState('');

  const handleGenerate = async () => {
    setOriginalDescription(description);
    setRefinementCount(0);
    setRefinementInput('');
    setPageState({ phase: 'generating' });
    try {
      const config = await generateArchetype(tenantId, description);
      setPageState({ phase: 'preview', config });
    } catch (err) {
      setPageState({
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleRefine = async () => {
    if (pageState.phase !== 'preview' || !refinementInput.trim() || refinementCount >= 3) return;
    const currentConfig = pageState.config;
    const instruction = refinementInput.trim();
    setPageState({ phase: 'generating' });
    try {
      const refined = await refineArchetype(
        tenantId,
        originalDescription,
        currentConfig,
        instruction,
      );
      setPageState({ phase: 'preview', config: refined });
      setRefinementCount((c) => c + 1);
      setRefinementInput('');
    } catch (err) {
      setPageState({ phase: 'preview', config: currentConfig });
      console.error('Refinement failed:', err);
    }
  };

  const handleCreate = async () => {
    if (pageState.phase !== 'preview') return;
    const currentConfig = pageState.config;
    setNameError(undefined);
    setPageState({ phase: 'creating', config: currentConfig });
    try {
      const archetype = await createArchetype(tenantId, {
        ...currentConfig,
        model: currentConfig.model,
        runtime: currentConfig.runtime,
        notification_channel: notificationChannel || null,
      });
      setPageState({ phase: 'success', archetype });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409') || msg.includes('ROLE_NAME_TAKEN')) {
        setPageState({ phase: 'preview', config: currentConfig });
        setNameError('This name is already taken. Please choose a different name.');
      } else {
        setPageState({ phase: 'error', message: msg });
      }
    }
  };

  const state = pageState;

  const pageTitle = (): string | null => {
    switch (state.phase) {
      case 'generating':
        return 'Generating Configuration…';
      case 'preview':
      case 'creating':
        return 'Review Configuration';
      case 'success':
        return null;
      default:
        return 'Create New Employee';
    }
  };

  const title = pageTitle();

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
        {title && <h1 className="text-lg font-semibold">{title}</h1>}
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

      {state.phase === 'generating' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground text-center">
            Analyzing your description and generating a complete employee configuration…
          </p>
        </div>
      )}

      {(state.phase === 'preview' || state.phase === 'creating') && (
        <div className="space-y-4">
          <CreateEmployeePreview
            config={state.config}
            onConfigChange={(newConfig) => setPageState({ phase: 'preview', config: newConfig })}
            tenantId={tenantId}
            nameError={nameError}
            notificationChannel={notificationChannel}
            onNotificationChannelChange={setNotificationChannel}
          />

          {state.phase === 'preview' && (
            <div className="border-t pt-4">
              {refinementCount > 0 && (
                <p className="text-xs text-muted-foreground mb-2">Refinement {refinementCount}/3</p>
              )}
              {refinementCount < 3 ? (
                <div className="flex gap-2">
                  <Input
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="Want to adjust anything? Tell me what to change..."
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && refinementInput.trim()) {
                        void handleRefine();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRefine()}
                    disabled={!refinementInput.trim()}
                  >
                    Refine
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Maximum refinements reached. You can edit fields directly above.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setPageState({ phase: 'idle' });
                setNameError(undefined);
              }}
              disabled={state.phase === 'creating'}
            >
              Back
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={state.phase === 'creating' || !isValidSlug(state.config.role_name)}
            >
              {state.phase === 'creating' ? 'Creating…' : 'Create Employee'}
            </Button>
          </div>
        </div>
      )}

      {state.phase === 'success' && (
        <CreateEmployeeNextSteps
          archetype={state.archetype}
          tenantId={tenantId}
          onClose={() => navigate('/dashboard/employees')}
        />
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
