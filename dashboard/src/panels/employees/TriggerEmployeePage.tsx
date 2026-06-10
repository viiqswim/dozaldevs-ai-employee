import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { gatewayFetch, triggerEmployee } from '@/lib/gateway';
import { useTenant } from '@/hooks/use-tenant';
import { usePoll } from '@/hooks/use-poll';
import type { Archetype, InputSchemaItem } from '@/lib/types';
import { InputSchemaFormField } from '@/components/ui/input-schema-form-field';

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'success'; taskId: string }
  | { phase: 'error'; message: string };

export function TriggerEmployeePage() {
  const { archetypeId } = useParams<{ archetypeId: string }>();
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  const fetchArchetype = useCallback(
    () =>
      gatewayFetch<Archetype[]>(
        `/admin/tenants/${tenantId}/archetypes?id=${archetypeId ?? ''}`,
      ).then((arr) => arr[0] ?? null),
    [archetypeId, tenantId],
  );

  const { data: archetype, error: fetchError, loading } = usePoll<Archetype | null>(fetchArchetype);

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ phase: 'idle' });

  useEffect(() => {
    if (archetype && !initialized) {
      const init: Record<string, string> = {};
      (archetype.input_schema ?? [])
        .filter((item) => item.frequency === 'every_run')
        .forEach((item) => {
          init[item.key] = item.default_value ?? '';
        });
      setFormValues(init);
      setInitialized(true);
    }
  }, [archetype, initialized]);

  const everyRunInputs: InputSchemaItem[] = (archetype?.input_schema ?? []).filter(
    (item) => item.frequency === 'every_run',
  );

  const setFieldValue = (key: string, val: string) => {
    setFormValues((prev) => ({ ...prev, [key]: val }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleRun = async () => {
    if (!archetype?.role_name) return;
    setSubmitState({ phase: 'submitting' });
    setFieldErrors({});

    const inputs = everyRunInputs.length > 0 ? { ...formValues } : undefined;

    try {
      const result = await triggerEmployee(tenantId, archetype.role_name, false, inputs);
      setSubmitState({ phase: 'success', taskId: result.task_id });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('Gateway error 422')) {
          const jsonStart = err.message.lastIndexOf(': {');
          if (jsonStart !== -1) {
            try {
              const bodyStr = err.message.slice(jsonStart + 2);
              const body = JSON.parse(bodyStr) as { error: string; missing?: string[] };
              if (body.error === 'MISSING_REQUIRED_INPUTS' && Array.isArray(body.missing)) {
                const errors: Record<string, string> = {};
                body.missing.forEach((key) => {
                  errors[key] = 'This field is required';
                });
                setFieldErrors(errors);
                setSubmitState({ phase: 'idle' });
                return;
              }
            } catch (_parseError) {
              void _parseError;
            }
          }
        }
        setSubmitState({ phase: 'error', message: err.message });
      } else {
        setSubmitState({ phase: 'error', message: String(err) });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center p-6 text-sm text-muted-foreground">Loading employee…</div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Failed to load employee</p>
          <p className="mt-1 text-destructive/80">{fetchError.message}</p>
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

  const roleName = archetype.role_name ?? archetype.id;
  const isSubmitting = submitState.phase === 'submitting';

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center gap-4">
        <Link
          to={`/dashboard/employees/${archetypeId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to {roleName}
        </Link>
        <h1 className="text-lg font-semibold">Run {roleName}</h1>
      </div>

      {submitState.phase === 'success' && (
        <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">Task created</p>
          <p className="mt-1 font-mono text-xs text-green-700 dark:text-green-400">
            {submitState.taskId}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/dashboard/tasks/${submitState.taskId}`)}
            >
              View Task
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSubmitState({ phase: 'idle' })}>
              Run Again
            </Button>
          </div>
        </div>
      )}

      {submitState.phase === 'error' && (
        <div className="mb-6 rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Failed to run</p>
          <p className="mt-1 text-destructive/80">{submitState.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setSubmitState({ phase: 'idle' })}
          >
            Try Again
          </Button>
        </div>
      )}

      {submitState.phase !== 'success' && (
        <>
          {everyRunInputs.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  No inputs required — this employee is ready to run.
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={isSubmitting || !archetype.role_name}
                  onClick={() => void handleRun()}
                >
                  {isSubmitting ? 'Starting…' : 'Run'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {everyRunInputs.map((item) => (
                <InputSchemaFormField
                  key={item.key}
                  item={item}
                  value={formValues[item.key] ?? ''}
                  onChange={(val) => setFieldValue(item.key, val)}
                  fieldError={fieldErrors[item.key]}
                />
              ))}
              <div className="flex justify-end pt-2">
                <Button
                  disabled={isSubmitting || !archetype.role_name}
                  onClick={() => void handleRun()}
                >
                  {isSubmitting ? 'Starting…' : 'Run Employee'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
