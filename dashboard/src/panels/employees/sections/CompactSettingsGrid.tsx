import { useEffect, useReducer, useState } from 'react';
import { useSlackChannels } from '@/hooks/use-slack-channels';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { patchArchetype } from '@/lib/gateway';
import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';
import { FormState, FormAction, initForm, formReducer } from './compact-settings-form';

interface CompactSettingsGridProps {
  archetype: Archetype;
  mode: ProfileMode;
  onSaved: () => void;
  tenantId: string;
}

export function CompactSettingsGrid({
  archetype,
  mode,
  onSaved,
  tenantId,
}: CompactSettingsGridProps) {
  const [editing, setEditing] = useState(mode === 'edit' || mode === 'create');
  const [saving, setSaving] = useState(false);
  const [form, dispatch] = useReducer(formReducer, archetype, initForm);

  const {
    channels: slackChannels,
    loading: slackLoading,
    error: slackError,
  } = useSlackChannels(tenantId);

  useEffect(() => {
    if (!editing) {
      dispatch({ type: 'RESET', archetype });
    }
  }, [archetype, editing]);

  const resolveChannelName = (channelId: string | null | undefined) => {
    if (!channelId) return '—';
    const found = slackChannels.find((ch) => ch.id === channelId);
    return found ? `#${found.name}` : channelId;
  };

  const handleSave = async () => {
    setSaving(true);
    dispatch({ type: 'SET_SAVE_ERROR', value: null });
    const changes: Partial<Archetype & { risk_model?: Record<string, unknown> }> = {};

    if (form.notificationChannel !== (archetype.notification_channel ?? ''))
      changes.notification_channel = form.notificationChannel || null;
    if (form.concurrencyLimit !== archetype.concurrency_limit)
      changes.concurrency_limit = form.concurrencyLimit;

    const existingApproval = archetype.risk_model?.approval_required ?? false;
    const existingTimeout = archetype.risk_model?.timeout_hours ?? 0;
    if (form.approvalRequired !== existingApproval || form.timeoutHours !== existingTimeout)
      changes.risk_model = {
        approval_required: form.approvalRequired,
        timeout_hours: form.timeoutHours,
      };

    if (form.manualMinutesOverride !== (archetype.estimated_manual_minutes_override ?? null))
      changes.estimated_manual_minutes_override = form.manualMinutesOverride;

    const parsedTemp = parseFloat(form.temperature);
    if (isNaN(parsedTemp) || parsedTemp < 0 || parsedTemp > 2) {
      dispatch({ type: 'SET_SAVE_ERROR', value: 'Temperature must be between 0.0 and 2.0' });
      setSaving(false);
      return;
    }
    const existingTemp = archetype.temperature ?? 1.0;
    if (parsedTemp !== existingTemp) {
      changes.temperature = parsedTemp;
    }

    if (Object.keys(changes).length === 0) {
      setEditing(false);
      setSaving(false);
      toast.info('No changes to save');
      return;
    }

    try {
      await patchArchetype(tenantId, archetype.id, changes);
      toast.success('Settings saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      dispatch({
        type: 'SET_SAVE_ERROR',
        value: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    dispatch({ type: 'RESET', archetype });
    setEditing(false);
  };

  const editAction = !editing ? (
    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
      Edit
    </Button>
  ) : null;

  return (
    <CollapsibleSection
      id="section-settings"
      title="Settings"
      subtitle="How this employee operates"
      defaultOpen={true}
      actions={editAction}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Approval
            </p>
            {editing ? (
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={form.approvalRequired}
                  onCheckedChange={(v) => dispatch({ type: 'SET_APPROVAL_REQUIRED', value: v })}
                  aria-label="Approval required"
                />
                <span className="text-xs text-muted-foreground">
                  {form.approvalRequired ? 'Required' : 'Auto-approved'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={archetype.risk_model?.approval_required ?? false}
                  disabled
                  aria-label="Approval required"
                />
                {archetype.risk_model?.approval_required ? (
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    Approval Required
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                  >
                    Auto-Approved
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Slack Channel
            </p>
            {editing ? (
              slackLoading ? (
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              ) : slackChannels.length > 0 ? (
                <SearchableSelect
                  options={slackChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` }))}
                  value={form.notificationChannel}
                  onValueChange={(v) => dispatch({ type: 'SET_NOTIFICATION_CHANNEL', value: v })}
                  placeholder="Select a channel..."
                  searchPlaceholder="Search channels..."
                />
              ) : (
                <Input
                  value={form.notificationChannel}
                  onChange={(e) =>
                    dispatch({ type: 'SET_NOTIFICATION_CHANNEL', value: e.target.value })
                  }
                  className="font-mono text-xs"
                  placeholder="#channel-name or channel ID"
                />
              )
            ) : (
              <p className="pt-1 font-mono text-xs">
                {resolveChannelName(archetype.notification_channel)}
              </p>
            )}
            {editing && slackError === 'SLACK_NOT_CONFIGURED' && (
              <p className="text-xs text-muted-foreground">
                Slack isn't connected yet — enter a channel ID manually.
              </p>
            )}
            {editing && slackError && slackError !== 'SLACK_NOT_CONFIGURED' && (
              <p className="text-xs text-muted-foreground">
                Could not load channels — enter a channel ID manually.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Maximum Duration
            </p>
            {editing ? (
              <Input
                type="number"
                min={0}
                value={form.timeoutHours}
                onChange={(e) =>
                  dispatch({ type: 'SET_TIMEOUT_HOURS', value: parseFloat(e.target.value) || 0 })
                }
              />
            ) : (
              <p className="pt-1 text-sm">
                {archetype.risk_model?.timeout_hours != null
                  ? `${archetype.risk_model.timeout_hours} hours`
                  : '—'}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Simultaneous Tasks
            </p>
            {editing ? (
              <Input
                type="number"
                min={1}
                value={form.concurrencyLimit}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_CONCURRENCY_LIMIT',
                    value: parseInt(e.target.value, 10) || 1,
                  })
                }
              />
            ) : (
              <p className="pt-1 text-sm">{archetype.concurrency_limit}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Time Estimate
            </p>
            {editing ? (
              <div className="space-y-1">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={form.manualMinutesOverride ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    dispatch({ type: 'SET_MANUAL_MINUTES_OVERRIDE', value: val });
                  }}
                  placeholder={
                    archetype.estimated_manual_minutes
                      ? `AI estimate: ${archetype.estimated_manual_minutes} min`
                      : 'Not estimated'
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Minutes a human would take. Leave empty to use AI estimate.
                </p>
              </div>
            ) : (
              <p className="pt-1 text-sm">
                {(archetype.estimated_manual_minutes_override ??
                  archetype.estimated_manual_minutes) != null
                  ? `${archetype.estimated_manual_minutes_override ?? archetype.estimated_manual_minutes} min`
                  : 'Not estimated'}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Temperature
            </p>
            {editing ? (
              <div className="space-y-1">
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => {
                    dispatch({ type: 'SET_TEMPERATURE', value: e.target.value });
                    dispatch({ type: 'SET_SAVE_ERROR', value: null });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  0.0 = focused, 2.0 = creative (default: 1.0)
                </p>
              </div>
            ) : (
              <p className="pt-1 text-sm">
                {archetype.temperature != null ? archetype.temperature.toFixed(1) : '1.0 (default)'}
              </p>
            )}
          </div>
        </div>

        {editing && (
          <div className="flex items-center justify-between pt-2">
            <div>
              {form.saveError && <p className="text-xs text-destructive">{form.saveError}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
