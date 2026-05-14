import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { triggerEmployee } from '@/lib/gateway';
import { GATEWAY_URL } from '@/lib/constants';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import type { Archetype } from '@/lib/types';

// Fixed VLRE test fixtures — do not change
const WEBHOOK_FIXTURES = {
  agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
  lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
  property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
} as const;

interface TriggerOutcome {
  taskId: string;
  statusUrl: string;
  isDryRun: boolean;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-0.5 text-xs font-mono">
      <dt className="min-w-[112px] text-muted-foreground">{label}</dt>
      <dd className="break-all text-foreground">{value}</dd>
    </div>
  );
}

export function TriggerPanel() {
  const { tenantId } = useTenant();

  const [selectedId, setSelectedId] = useState<string>('');
  const [dryRun, setDryRun] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [outcome, setOutcome] = useState<TriggerOutcome | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const [firingWebhook, setFiringWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const fetchArchetypes = useCallback(
    () =>
      postgrestFetch<Archetype>('archetypes', {
        ...scopeByTenant(tenantId),
        select: 'id,role_name,model,runtime,deliverable_type,risk_model,concurrency_limit',
        order: 'role_name.asc',
        limit: '50',
      }),
    [tenantId],
  );

  const {
    data: archetypes,
    error: archetypesError,
    loading: archetypesLoading,
    refresh,
  } = usePoll(fetchArchetypes);

  const selectedArchetype = archetypes?.find((a) => a.id === selectedId) ?? null;
  const isGuestMessaging = selectedArchetype?.role_name === 'guest-messaging';

  const handleSelectChange = (value: string) => {
    setSelectedId(value);
    setOutcome(null);
    setTriggerError(null);
  };

  const handleTrigger = async () => {
    if (!selectedArchetype?.role_name) return;
    setTriggering(true);
    setOutcome(null);
    setTriggerError(null);
    try {
      const result = await triggerEmployee(tenantId, selectedArchetype.role_name, dryRun);
      setOutcome({
        taskId: result.task_id,
        statusUrl: result.status_url,
        isDryRun: dryRun,
      });
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : String(err));
    } finally {
      setTriggering(false);
    }
  };

  const handleFireWebhook = async () => {
    setFiringWebhook(true);
    setWebhookResult(null);
    setWebhookError(null);
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
      setWebhookResult('Webhook fired — check Task Feed for new task');
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : String(err));
    } finally {
      setFiringWebhook(false);
    }
  };

  if (archetypesLoading) {
    return (
      <div className="flex items-center p-6 text-sm text-muted-foreground">
        Loading employees...
      </div>
    );
  }

  if (archetypesError) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Failed to load employees</p>
          <p className="mt-1 text-destructive/80">{archetypesError.message}</p>
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

  if (!archetypes || archetypes.length === 0) {
    return (
      <div className="flex items-center justify-center p-16 text-center">
        <p className="text-muted-foreground">No employees found for this tenant</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Trigger Employee</CardTitle>
            <CardDescription>
              Select an employee archetype and fire a task manually via the admin API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Employee</label>
              <Select value={selectedId} onValueChange={handleSelectChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {archetypes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.role_name ?? a.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              <span>Dry Run (validate only, no task created)</span>
            </label>

            <Button disabled={!selectedId || triggering} onClick={() => void handleTrigger()}>
              {triggering ? 'Triggering...' : dryRun ? 'Dry Run' : 'Trigger'}
            </Button>

            {outcome && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                {outcome.isDryRun ? (
                  <p className="font-semibold">Dry run successful — no task created.</p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-semibold">Task created</p>
                    {outcome.taskId && (
                      <p>
                        ID:{' '}
                        <Link
                          to={`/dashboard/tasks/${outcome.taskId}`}
                          className="font-mono underline underline-offset-2 hover:no-underline"
                        >
                          {outcome.taskId}
                        </Link>
                      </p>
                    )}
                    {outcome.statusUrl && (
                      <p className="font-mono text-xs text-emerald-600">{outcome.statusUrl}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {triggerError && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {triggerError}
              </div>
            )}
          </CardContent>
        </Card>

        {isGuestMessaging && (
          <Card>
            <CardHeader>
              <CardTitle>Simulate Hostfully Webhook</CardTitle>
              <CardDescription>
                Fire a <code className="text-xs">NEW_INBOX_MESSAGE</code> event directly against the
                gateway. No auth required for <code className="text-xs">/webhooks/hostfully</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="rounded-md border bg-muted/40 p-3">
                <FieldRow label="agency_uid" value={WEBHOOK_FIXTURES.agency_uid} />
                <FieldRow label="thread_uid" value={WEBHOOK_FIXTURES.thread_uid} />
                <FieldRow label="lead_uid" value={WEBHOOK_FIXTURES.lead_uid} />
                <FieldRow label="property_uid" value={WEBHOOK_FIXTURES.property_uid} />
                <FieldRow label="message_uid" value="test-msg-<timestamp>" />
                <FieldRow label="event_type" value="NEW_INBOX_MESSAGE" />
              </dl>

              <Button
                variant="secondary"
                disabled={firingWebhook}
                onClick={() => void handleFireWebhook()}
              >
                {firingWebhook ? 'Firing...' : 'Fire Webhook'}
              </Button>

              {webhookResult && <p className="text-sm text-emerald-700">{webhookResult}</p>}

              {webhookError && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                  {webhookError}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
