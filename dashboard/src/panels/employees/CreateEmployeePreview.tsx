import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MarkdownEditorField } from '@/components/MarkdownEditorField';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchSlackChannels } from '@/lib/gateway';
import type { GenerateArchetypeResponse, SlackChannel } from '@/lib/types';

interface CreateEmployeePreviewProps {
  config: GenerateArchetypeResponse;
  onConfigChange: (config: GenerateArchetypeResponse) => void;
  tenantId: string;
  nameError?: string;
  notificationChannel: string;
  onNotificationChannelChange: (channel: string) => void;
}

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function CreateEmployeePreview({
  config,
  onConfigChange,
  tenantId,
  nameError,
  notificationChannel,
  onNotificationChannelChange,
}: CreateEmployeePreviewProps) {
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackError, setSlackError] = useState<string | undefined>();
  const [slackLoading, setSlackLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Employee Name
        </label>
        <div className="mt-1 flex items-center gap-2">
          <Input
            value={config.role_name}
            onChange={(e) => {
              const val = e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')
                .replace(/^-+|-+$/g, '');
              onConfigChange({ ...config, role_name: val });
            }}
            className={nameError ? 'border-destructive' : ''}
            placeholder="my-employee-name"
          />
          {SLUG_REGEX.test(config.role_name) ? (
            <span className="text-xs text-green-600 shrink-0">✓</span>
          ) : (
            <span className="text-xs text-destructive shrink-0">✗</span>
          )}
        </div>
        {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What it does
        </label>
        <div className="mt-1">
          <MarkdownPreview content={config.instructions} />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Trigger
        </label>

        <div className="mt-1 flex gap-1">
          {(['manual', 'scheduled', 'webhook'] as const).map((type) => {
            const current = config.trigger_sources?.type ?? 'manual';
            const isActive = current === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  if (type === 'manual') {
                    onConfigChange({ ...config, trigger_sources: { type: 'manual' } });
                  } else if (type === 'scheduled') {
                    onConfigChange({
                      ...config,
                      trigger_sources: { type: 'scheduled', cron: '0 8 * * 1-5' },
                    });
                  } else {
                    onConfigChange({ ...config, trigger_sources: { type: 'webhook' } });
                  }
                }}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            );
          })}
        </div>

        {(config.trigger_sources?.type ?? 'manual') === 'manual' && (
          <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>Triggered via admin API:</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                POST /admin/tenants/:tenantId/employees/
                {config.role_name || '{role_name}'}/trigger
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `POST /admin/tenants/:tenantId/employees/${config.role_name || '{role_name}'}/trigger`,
                  );
                }}
                className="shrink-0 rounded px-2 py-1 text-xs hover:bg-muted"
                title="Copy"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {config.trigger_sources?.type === 'scheduled' && (
          <div className="mt-2 space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">Cron expression</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={config.trigger_sources.cron}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      trigger_sources: {
                        type: 'scheduled',
                        cron: e.target.value,
                        timezone:
                          config.trigger_sources?.type === 'scheduled'
                            ? config.trigger_sources.timezone
                            : undefined,
                      },
                    })
                  }
                  placeholder="0 8 * * 1-5"
                  className="font-mono text-xs"
                />
                <a
                  href="https://crontab.guru"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  crontab.guru ↗
                </a>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Timezone</label>
              <Select
                value={config.trigger_sources.timezone ?? 'UTC'}
                onValueChange={(tz) =>
                  onConfigChange({
                    ...config,
                    trigger_sources: {
                      type: 'scheduled',
                      cron:
                        config.trigger_sources?.type === 'scheduled'
                          ? config.trigger_sources.cron
                          : '0 8 * * 1-5',
                      timezone: tz,
                    },
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'UTC',
                    'America/New_York',
                    'America/Chicago',
                    'America/Los_Angeles',
                    'Europe/London',
                    'Europe/Paris',
                    'Asia/Tokyo',
                  ].map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {config.trigger_sources?.type === 'webhook' && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Triggered by incoming webhook events. Configure your webhook source to POST to the
              trigger endpoint.
            </p>
            <div>
              <label className="text-xs text-muted-foreground">Event type (optional)</label>
              <Input
                value={config.trigger_sources.event_type ?? ''}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    trigger_sources: {
                      type: 'webhook',
                      event_type: e.target.value || undefined,
                    },
                  })
                }
                placeholder="e.g., NEW_INBOX_MESSAGE"
                className="mt-1 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Require Approval
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {config.risk_model.approval_required
              ? 'A Slack notification will be sent for review before any action is taken.'
              : 'Actions will be taken automatically without human review.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.risk_model.approval_required}
          onClick={() =>
            onConfigChange({
              ...config,
              risk_model: {
                ...config.risk_model,
                approval_required: !config.risk_model.approval_required,
              },
            })
          }
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            config.risk_model.approval_required ? 'bg-primary' : 'bg-input'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.risk_model.approval_required ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Notification Channel
        </label>
        <div className="mt-1">
          {slackLoading ? (
            <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
          ) : slackChannels.length > 0 ? (
            <Select value={notificationChannel} onValueChange={onNotificationChannelChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a channel..." />
              </SelectTrigger>
              <SelectContent>
                {slackChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    #{ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={notificationChannel}
              onChange={(e) => onNotificationChannelChange(e.target.value)}
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
        </div>
      </div>

      {config.tool_registry?.tools && config.tool_registry.tools.length > 0 && (
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tools
          </label>
          <div className="mt-2 space-y-2">
            {Object.entries(
              config.tool_registry.tools.reduce<Record<string, string[]>>((acc, toolPath) => {
                const segments = toolPath.split('/');
                const service = segments[2] ?? 'other';
                const toolName = (segments[segments.length - 1] ?? toolPath).replace(/\.ts$/, '');
                if (!acc[service]) acc[service] = [];
                acc[service].push(toolName);
                return acc;
              }, {}),
            ).map(([service, tools]) => (
              <div key={service}>
                <span className="text-xs font-medium text-muted-foreground capitalize">
                  {service}
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-xs font-mono">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground italic">
            These are recommended tools. The employee has access to all available tools.
          </p>
        </div>
      )}

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Max Concurrent Tasks
        </label>
        <Input
          type="number"
          min={1}
          max={20}
          value={config.concurrency_limit}
          onChange={(e) =>
            onConfigChange({
              ...config,
              concurrency_limit: Math.max(1, Math.min(20, Number(e.target.value))),
            })
          }
          className="mt-1 w-24"
        />
      </div>

      <div className="border-t pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{advancedOpen ? '▼' : '▶'}</span>
          <span>Advanced</span>
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground italic">
              These are the generated AI prompts. Edit only if you know what you're doing.
            </p>

            <MarkdownEditorField
              label="Employee Brain (agents_md)"
              value={config.agents_md}
              onChange={(val) => onConfigChange({ ...config, agents_md: val })}
              minHeight={300}
            />

            <MarkdownEditorField
              label="Trigger Instructions"
              value={config.instructions}
              onChange={(val) => onConfigChange({ ...config, instructions: val })}
              minHeight={200}
            />

            {config.risk_model.approval_required && (
              <MarkdownEditorField
                label="Delivery Instructions"
                value={config.delivery_instructions ?? ''}
                onChange={(val) =>
                  onConfigChange({ ...config, delivery_instructions: val || null })
                }
                minHeight={200}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
