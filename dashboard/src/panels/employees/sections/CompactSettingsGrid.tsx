import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { fetchSlackChannels, patchArchetype } from '@/lib/gateway';
import type { Archetype, SlackChannel } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';

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
  const [saveError, setSaveError] = useState<string | null>(null);

  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackError, setSlackError] = useState<string | undefined>();

  const [approvalRequired, setApprovalRequired] = useState(
    archetype.risk_model?.approval_required ?? false,
  );
  const [timeoutHours, setTimeoutHours] = useState(archetype.risk_model?.timeout_hours ?? 0);
  const [notificationChannel, setNotificationChannel] = useState(
    archetype.notification_channel ?? '',
  );
  const [concurrencyLimit, setConcurrencyLimit] = useState(archetype.concurrency_limit);
  const [manualMinutesOverride, setManualMinutesOverride] = useState<number | null>(
    archetype.estimated_manual_minutes_override ?? null,
  );

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

  useEffect(() => {
    if (!editing) {
      setApprovalRequired(archetype.risk_model?.approval_required ?? false);
      setTimeoutHours(archetype.risk_model?.timeout_hours ?? 0);
      setNotificationChannel(archetype.notification_channel ?? '');
      setConcurrencyLimit(archetype.concurrency_limit);
      setManualMinutesOverride(archetype.estimated_manual_minutes_override ?? null);
    }
  }, [archetype, editing]);

  const resolveChannelName = (channelId: string | null | undefined) => {
    if (!channelId) return '—';
    const found = slackChannels.find((ch) => ch.id === channelId);
    return found ? `#${found.name}` : channelId;
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const changes: Partial<Archetype & { risk_model?: Record<string, unknown> }> = {};

    if (notificationChannel !== (archetype.notification_channel ?? ''))
      changes.notification_channel = notificationChannel || null;
    if (concurrencyLimit !== archetype.concurrency_limit)
      changes.concurrency_limit = concurrencyLimit;

    const existingApproval = archetype.risk_model?.approval_required ?? false;
    const existingTimeout = archetype.risk_model?.timeout_hours ?? 0;
    if (approvalRequired !== existingApproval || timeoutHours !== existingTimeout)
      changes.risk_model = { approval_required: approvalRequired, timeout_hours: timeoutHours };

    if (manualMinutesOverride !== (archetype.estimated_manual_minutes_override ?? null))
      changes.estimated_manual_minutes_override = manualMinutesOverride;

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
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setApprovalRequired(archetype.risk_model?.approval_required ?? false);
    setTimeoutHours(archetype.risk_model?.timeout_hours ?? 0);
    setNotificationChannel(archetype.notification_channel ?? '');
    setConcurrencyLimit(archetype.concurrency_limit);
    setManualMinutesOverride(archetype.estimated_manual_minutes_override ?? null);
    setSaveError(null);
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
                  checked={approvalRequired}
                  onCheckedChange={setApprovalRequired}
                  aria-label="Approval required"
                />
                <span className="text-xs text-muted-foreground">
                  {approvalRequired ? 'Required' : 'Auto-approved'}
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
                  value={notificationChannel}
                  onValueChange={setNotificationChannel}
                  placeholder="Select a channel..."
                  searchPlaceholder="Search channels..."
                />
              ) : (
                <Input
                  value={notificationChannel}
                  onChange={(e) => setNotificationChannel(e.target.value)}
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
                Slack not configured for this tenant. Enter a channel ID manually.
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
                value={timeoutHours}
                onChange={(e) => setTimeoutHours(parseFloat(e.target.value) || 0)}
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
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(parseInt(e.target.value, 10) || 1)}
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
                  value={manualMinutesOverride ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    setManualMinutesOverride(val);
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
        </div>

        {editing && (
          <div className="flex items-center justify-between pt-2">
            <div>{saveError && <p className="text-xs text-destructive">{saveError}</p>}</div>
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
