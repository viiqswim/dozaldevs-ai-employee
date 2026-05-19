import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmployeeOverview } from '@/components/EmployeeOverview';
import { MarkdownEditorField } from '@/components/MarkdownEditorField';
import { InputSchemaEditor } from '@/components/InputSchemaEditor';
import { postgrestFetch } from '@/lib/postgrest';
import { patchArchetype, refineArchetype, createArchetype } from '@/lib/gateway';
import { useTenant } from '@/hooks/use-tenant';
import type { Archetype, GenerateArchetypeResponse, InputSchemaItem } from '@/lib/types';
import { toast } from 'sonner';

type EditState =
  | { phase: 'loading' }
  | { phase: 'ready'; archetype: Archetype }
  | { phase: 'refining' }
  | { phase: 'finalizing' }
  | { phase: 'error'; message: string };

export function EditEmployeePage() {
  const { archetypeId } = useParams<{ archetypeId: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [editState, setEditState] = useState<EditState>({ phase: 'loading' });
  const [refinementInput, setRefinementInput] = useState('');
  const [refinementCount, setRefinementCount] = useState(0);

  useEffect(() => {
    if (!archetypeId) return;
    postgrestFetch<Archetype>('archetypes', {
      id: `eq.${archetypeId}`,
      select: '*',
    })
      .then((result) => {
        if (!result.length || result[0].status !== 'draft') {
          navigate(`/dashboard/employees/${archetypeId}`, { replace: true });
          return;
        }
        setEditState({ phase: 'ready', archetype: result[0] });
      })
      .catch((err) => {
        setEditState({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, [archetypeId, navigate]);

  if (editState.phase === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (editState.phase === 'error') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-destructive">{editState.message}</p>
      </div>
    );
  }

  if (editState.phase === 'refining') {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Refining draft…</p>
      </div>
    );
  }

  if (editState.phase === 'finalizing') {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Creating employee…</p>
      </div>
    );
  }

  const { archetype } = editState;

  const patch = async (data: Parameters<typeof patchArchetype>[2]) => {
    try {
      const updated = await patchArchetype(tenantId, archetypeId!, data);
      setEditState({ phase: 'ready', archetype: updated });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const currentConfig: GenerateArchetypeResponse = {
    role_name: archetype.role_name ?? '',
    instructions: archetype.instructions ?? '',
    agents_md: archetype.agents_md ?? '',
    system_prompt: archetype.system_prompt ?? '',
    delivery_instructions: archetype.delivery_instructions ?? null,
    deliverable_type: archetype.deliverable_type ?? null,
    model: (archetype.model ?? 'minimax/minimax-m2.7') as 'minimax/minimax-m2.7',
    runtime: (archetype.runtime ?? 'opencode') as 'opencode',
    risk_model: {
      approval_required: archetype.risk_model?.approval_required ?? false,
      timeout_hours: archetype.risk_model?.timeout_hours ?? 2,
    },
    concurrency_limit: archetype.concurrency_limit,
    trigger_sources: archetype.trigger_sources ?? { type: 'manual' },
    tool_registry: archetype.tool_registry ?? { tools: [] },
    overview: archetype.overview ?? {
      role: '',
      trigger: '',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    },
    input_schema: archetype.input_schema ?? [],
  };

  const handleRefine = async () => {
    if (refinementCount >= 3 || !refinementInput.trim()) return;
    if (archetype.input_schema && archetype.input_schema.length > 0) {
      const confirmed = window.confirm('Regenerating will replace the current inputs. Continue?');
      if (!confirmed) return;
    }
    setEditState({ phase: 'refining' });
    try {
      const refined = await refineArchetype(
        tenantId,
        archetype.instructions ?? '',
        currentConfig,
        refinementInput.trim(),
      );
      const newArchetype = await createArchetype(tenantId, {
        ...refined,
        status: 'draft',
        parent_draft_id: archetypeId,
        notification_channel: archetype.notification_channel ?? null,
      });
      await patchArchetype(tenantId, archetypeId!, { status: 'superseded' });
      setRefinementCount((c) => c + 1);
      navigate(`/dashboard/employees/${newArchetype.id}/edit`);
    } catch (err) {
      setEditState({ phase: 'ready', archetype });
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFinalize = async () => {
    if (
      !archetype.role_name?.trim() ||
      !archetype.instructions?.trim() ||
      !archetype.agents_md?.trim()
    ) {
      toast.error('Role name, trigger prompt, and employee brain are required');
      return;
    }
    setEditState({ phase: 'finalizing' });
    try {
      await patchArchetype(tenantId, archetypeId!, { status: 'active' });
      navigate(`/dashboard/employees/${archetypeId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409') || msg.includes('ROLE_NAME_TAKEN')) {
        setEditState({ phase: 'ready', archetype });
        toast.error(
          'This name is already taken by an active employee. Change the role name first.',
        );
      } else {
        setEditState({ phase: 'error', message: msg });
      }
    }
  };

  const handleSaveAdvanced = () => {
    void patch({
      instructions: archetype.instructions,
      agents_md: archetype.agents_md,
      delivery_instructions: archetype.delivery_instructions,
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-muted-foreground hover:text-foreground"
        >
          <Link to="/dashboard/employees">← Employees</Link>
        </Button>
        <Input
          className="max-w-xs text-base font-semibold"
          value={archetype.role_name ?? ''}
          placeholder="Role name"
          onChange={(e) =>
            setEditState({
              phase: 'ready',
              archetype: { ...archetype, role_name: e.target.value },
            })
          }
          onBlur={(e) => {
            void patch({ role_name: e.target.value });
          }}
        />
        <Badge variant="outline" className="text-muted-foreground">
          Draft
        </Badge>
      </div>

      <EmployeeOverview overview={archetype.overview} />

      <div className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Configuration</h3>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="approval-toggle"
            checked={archetype.risk_model?.approval_required ?? false}
            onChange={(e) => {
              const newRiskModel = {
                approval_required: e.target.checked,
                timeout_hours: archetype.risk_model?.timeout_hours ?? 2,
              };
              setEditState({
                phase: 'ready',
                archetype: { ...archetype, risk_model: newRiskModel },
              });
              void patch({ risk_model: newRiskModel });
            }}
            className="h-4 w-4"
          />
          <label htmlFor="approval-toggle" className="text-sm">
            Require approval before delivery
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notification Channel
            </label>
            <Input
              value={archetype.notification_channel ?? ''}
              placeholder="#channel-name"
              onChange={(e) =>
                setEditState({
                  phase: 'ready',
                  archetype: { ...archetype, notification_channel: e.target.value },
                })
              }
              onBlur={(e) => {
                void patch({ notification_channel: e.target.value || null });
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Concurrency Limit
            </label>
            <Input
              type="number"
              min={1}
              max={10}
              value={archetype.concurrency_limit}
              onChange={(e) =>
                setEditState({
                  phase: 'ready',
                  archetype: { ...archetype, concurrency_limit: Number(e.target.value) },
                })
              }
              onBlur={(e) => {
                void patch({ concurrency_limit: Number(e.target.value) });
              }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Detected Inputs</h3>
        <p className="text-xs text-muted-foreground">
          Inputs auto-detected from your description. Review and edit before activating.
        </p>
        <InputSchemaEditor
          value={archetype.input_schema ?? []}
          onChange={(schema: InputSchemaItem[]) => {
            setEditState({
              phase: 'ready',
              archetype: { ...archetype, input_schema: schema },
            });
            void patch({ input_schema: schema });
          }}
        />
      </div>

      <details className="group rounded-lg border border-border">
        <summary className="flex cursor-pointer select-none list-none items-center justify-between p-4 text-sm font-semibold">
          <span>Advanced Configuration</span>
          <span className="text-muted-foreground transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="space-y-6 border-t border-border p-4">
          <div className="space-y-1">
            <MarkdownEditorField
              label="Trigger Prompt"
              value={archetype.instructions ?? ''}
              onChange={(val) =>
                setEditState({
                  phase: 'ready',
                  archetype: { ...archetype, instructions: val },
                })
              }
              minHeight={300}
            />
            <p className="text-xs text-muted-foreground">
              The message sent to the AI when a task starts
            </p>
          </div>

          <div className="space-y-1">
            <MarkdownEditorField
              label="Employee Brain"
              value={archetype.agents_md ?? ''}
              onChange={(val) =>
                setEditState({
                  phase: 'ready',
                  archetype: { ...archetype, agents_md: val },
                })
              }
              minHeight={300}
            />
            <p className="text-xs text-muted-foreground">
              The full workflow, rules, and tools the AI follows
            </p>
          </div>

          <div className="space-y-1">
            <MarkdownEditorField
              label="Delivery Instructions"
              value={archetype.delivery_instructions ?? ''}
              onChange={(val) =>
                setEditState({
                  phase: 'ready',
                  archetype: { ...archetype, delivery_instructions: val || null },
                })
              }
              minHeight={200}
            />
            <p className="text-xs text-muted-foreground">
              How the AI delivers results after approval
            </p>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleSaveAdvanced}>
              Save Advanced Configuration
            </Button>
          </div>
        </div>
      </details>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Refine</h3>
          <span className="text-xs text-muted-foreground">
            {refinementCount}/3 refinements used
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Describe what you want to change. A new draft will be created and this one will be
          superseded.
        </p>
        <Input
          value={refinementInput}
          onChange={(e) => setRefinementInput(e.target.value)}
          placeholder="e.g., Make it send messages every hour instead of daily"
          disabled={refinementCount >= 3}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefine()}
          disabled={refinementCount >= 3 || !refinementInput.trim()}
        >
          Refine
        </Button>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link to="/dashboard/employees">Back to Employees</Link>
        </Button>
        <Button
          onClick={() => void handleFinalize()}
          disabled={
            !archetype.role_name?.trim() ||
            !archetype.instructions?.trim() ||
            !archetype.agents_md?.trim()
          }
        >
          Create Employee
        </Button>
      </div>
    </div>
  );
}
