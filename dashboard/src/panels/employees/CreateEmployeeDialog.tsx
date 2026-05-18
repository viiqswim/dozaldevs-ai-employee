import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { generateArchetype, createArchetype, refineArchetype } from '@/lib/gateway';
import { Input } from '@/components/ui/input';
import type { GenerateArchetypeResponse, Archetype } from '@/lib/types';
import { CreateEmployeePreview } from './CreateEmployeePreview';
import { CreateEmployeeNextSteps } from './CreateEmployeeNextSteps';

interface CreateEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onCreated: () => void;
}

type DialogState =
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

export function CreateEmployeeDialog({
  open,
  onOpenChange,
  tenantId,
  onCreated,
}: CreateEmployeeDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: 'idle' });
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [notificationChannel, setNotificationChannel] = useState('');
  const [refinementCount, setRefinementCount] = useState(0);
  const [refinementInput, setRefinementInput] = useState('');
  const [originalDescription, setOriginalDescription] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDialogState({ phase: 'idle' });
      setDescription('');
      setNameError(undefined);
      setNotificationChannel('');
      setRefinementCount(0);
      setRefinementInput('');
      setOriginalDescription('');
    }
    onOpenChange(nextOpen);
  };

  const handleGenerate = async () => {
    setOriginalDescription(description);
    setRefinementCount(0);
    setRefinementInput('');
    setDialogState({ phase: 'generating' });
    try {
      const config = await generateArchetype(tenantId, description);
      setDialogState({ phase: 'preview', config });
    } catch (err) {
      setDialogState({
        phase: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleRefine = async () => {
    if (dialogState.phase !== 'preview' || !refinementInput.trim() || refinementCount >= 3) return;
    const currentConfig = dialogState.config;
    const instruction = refinementInput.trim();
    setDialogState({ phase: 'generating' });
    try {
      const refined = await refineArchetype(
        tenantId,
        originalDescription,
        currentConfig,
        instruction,
      );
      setDialogState({ phase: 'preview', config: refined });
      setRefinementCount((c) => c + 1);
      setRefinementInput('');
    } catch (err) {
      setDialogState({ phase: 'preview', config: currentConfig });
      console.error('Refinement failed:', err);
    }
  };

  const handleCreate = async () => {
    if (dialogState.phase !== 'preview') return;
    const currentConfig = dialogState.config;
    setNameError(undefined);
    setDialogState({ phase: 'creating', config: currentConfig });
    try {
      const archetype = await createArchetype(tenantId, {
        ...currentConfig,
        model: currentConfig.model,
        runtime: currentConfig.runtime,
        notification_channel: notificationChannel || null,
      });
      setDialogState({ phase: 'success', archetype });
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409') || msg.includes('ROLE_NAME_TAKEN')) {
        setDialogState({ phase: 'preview', config: currentConfig });
        setNameError('This name is already taken. Please choose a different name.');
      } else {
        setDialogState({ phase: 'error', message: msg });
      }
    }
  };

  const state = dialogState;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {state.phase === 'idle' && (
          <>
            <DialogHeader>
              <DialogTitle>Create New Employee</DialogTitle>
              <DialogDescription>
                Describe what you want your AI employee to do. Be specific about its tasks,
                schedule, and any tools it should use.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[120px] resize-none"
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
          </>
        )}

        {state.phase === 'generating' && (
          <>
            <DialogHeader>
              <DialogTitle>Generating Employee Configuration</DialogTitle>
              <DialogDescription>This may take up to 30 seconds...</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Analyzing your description and generating a complete employee configuration...
              </p>
            </div>
          </>
        )}

        {(state.phase === 'preview' || state.phase === 'creating') && (
          <>
            <DialogHeader>
              <DialogTitle>Review Configuration</DialogTitle>
              <DialogDescription>
                Review and adjust the generated employee configuration before creating.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[55vh] pr-1">
              <CreateEmployeePreview
                config={state.config}
                onConfigChange={(newConfig) =>
                  setDialogState({ phase: 'preview', config: newConfig })
                }
                tenantId={tenantId}
                nameError={nameError}
                notificationChannel={notificationChannel}
                onNotificationChannelChange={setNotificationChannel}
              />
            </div>

            {state.phase === 'preview' && (
              <div className="border-t pt-3 mt-2">
                {refinementCount > 0 && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Refinement {refinementCount}/3
                  </p>
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
                  setDialogState({ phase: 'idle' });
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
          </>
        )}

        {state.phase === 'success' && (
          <CreateEmployeeNextSteps
            archetype={state.archetype}
            tenantId={tenantId}
            onClose={() => handleOpenChange(false)}
          />
        )}

        {state.phase === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Generation Failed</DialogTitle>
              <DialogDescription>{state.message}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogState({ phase: 'idle' })}>
                Try Again
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
