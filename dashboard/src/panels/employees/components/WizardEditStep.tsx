import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CollapsibleSection } from '@/panels/employees/components/CollapsibleSection';
import { InputSchemaEditor } from '@/panels/employees/components/InputSchemaEditor';
import type {
  GenerateArchetypeResponse,
  SlackChannel,
  InputSchemaItem,
  GitHubRepo,
} from '@/lib/types';

export interface EditedFields {
  identity: string;
  execution_steps: string;
  delivery_steps: string;
  role_name: string;
  approval_required: boolean;
  trigger_type: 'manual' | 'scheduled' | 'webhook';
  temperature: number;
}

interface WizardEditStepProps {
  editedFields: EditedFields;
  setEditedFields: Dispatch<SetStateAction<EditedFields>>;
  inputSchemaItems: InputSchemaItem[];
  setInputSchemaItems: (items: InputSchemaItem[]) => void;
  config: GenerateArchetypeResponse | null;
  repos: GitHubRepo[];
  reposLoading: boolean;
  reposError: string | null;
  githubConnected: boolean | null;
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  slackChannels: SlackChannel[];
  slackLoading: boolean;
  slackError: string | undefined;
  notificationChannel: string;
  setNotificationChannel: (ch: string) => void;
  onPreview: () => void;
  onBack: () => void;
}

export function WizardEditStep({
  editedFields,
  setEditedFields,
  inputSchemaItems,
  setInputSchemaItems,
  config,
  repos,
  reposLoading,
  reposError,
  githubConnected,
  repoUrl,
  setRepoUrl,
  slackChannels,
  slackLoading,
  slackError,
  notificationChannel,
  setNotificationChannel,
  onPreview,
  onBack,
}: WizardEditStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review and edit the generated configuration. These fields become your employee's instruction
        manual.
      </p>

      <CollapsibleSection title="Core" defaultOpen={true}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Employee Name</label>
            <p className="text-xs text-muted-foreground">
              A unique identifier for this employee (lowercase, hyphens only). Used in URLs and API
              calls.
            </p>
            <Input
              value={editedFields.role_name}
              onChange={(e) => setEditedFields((f) => ({ ...f, role_name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Identity</label>
            <p className="text-xs text-muted-foreground">
              Describe who this employee is — their personality, background, and expertise. This
              shapes how they think and communicate. Don't include step-by-step instructions here.
            </p>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[180px] resize-y"
              value={editedFields.identity}
              onChange={(e) => setEditedFields((f) => ({ ...f, identity: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Execution Steps</label>
            <p className="text-xs text-muted-foreground">
              The numbered steps this employee follows when doing their job. Be specific — these go
              directly into the employee's instruction manual.
            </p>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[200px] resize-y"
              value={editedFields.execution_steps}
              onChange={(e) => setEditedFields((f) => ({ ...f, execution_steps: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Trigger Inputs</label>
            <p className="text-xs text-muted-foreground">
              Information this employee needs each time it runs. The AI detected these from your
              description — add, edit, or remove as needed.
            </p>
            <InputSchemaEditor
              items={inputSchemaItems}
              instructions={editedFields.execution_steps}
              onChange={setInputSchemaItems}
            />
          </div>

          {config?.overview && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Overview</label>
              <div className="rounded-md border bg-muted/10 px-4 py-3 space-y-2">
                {[
                  { label: 'Role', value: config.overview.role },
                  { label: 'Trigger', value: config.overview.trigger },
                  { label: 'Workflow', value: config.overview.workflow.join(' → ') },
                  { label: 'Tools', value: config.overview.tools_used },
                  { label: 'Output', value: config.overview.output },
                  { label: 'Approval', value: config.overview.approval },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <p className="text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Delivery" defaultOpen={true}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Delivery Steps</label>
            <p className="text-xs text-muted-foreground">
              How this employee delivers their completed work (e.g., posting to Slack, sending a
              message). Only needed when approval is required — leave empty for auto-complete
              employees.
            </p>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[150px] resize-y"
              value={editedFields.delivery_steps}
              onChange={(e) => setEditedFields((f) => ({ ...f, delivery_steps: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="approval-toggle"
                checked={editedFields.approval_required}
                onChange={(e) =>
                  setEditedFields((f) => ({ ...f, approval_required: e.target.checked }))
                }
                className="h-4 w-4"
              />
              <label htmlFor="approval-toggle" className="text-sm font-medium">
                Requires approval
              </label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              When enabled, a team member must review and approve the employee's work before it's
              delivered.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Code Repository" defaultOpen={false}>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Select the repository this employee will work in. Optional — the employee can still run
            without a repository selected.
          </p>
          {githubConnected === null ? (
            <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
          ) : githubConnected ? (
            reposLoading ? (
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            ) : reposError ? (
              <p className="text-xs text-destructive">{reposError}</p>
            ) : (
              <SearchableSelect
                options={repos.map((r) => ({ value: r.html_url, label: r.full_name }))}
                value={repoUrl}
                onValueChange={setRepoUrl}
                placeholder="Select a repository..."
                searchPlaceholder="Search repositories..."
              />
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Connect GitHub in Settings → Integrations to enable repository selection.
            </p>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Settings" defaultOpen={false}>
        <div className="space-y-4">
          {config && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Selected Model</label>
              <div className="rounded-md border bg-muted/10 px-3 py-2 space-y-0.5">
                <p className="text-sm font-medium">
                  {config.modelRecommendation?.recommended?.displayName ?? config.model}
                </p>
                <p className="text-xs text-muted-foreground">
                  {config.modelRecommendation?.recommended
                    ? 'Recommended based on your employee type'
                    : 'Default model'}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Creativity</label>
            <p className="text-xs text-muted-foreground">
              Higher values produce more varied responses. Lower values are more focused and
              predictable.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={editedFields.temperature}
                onChange={(e) =>
                  setEditedFields((f) => ({ ...f, temperature: parseFloat(e.target.value) }))
                }
                className="flex-1 h-2 accent-primary"
              />
              <span className="text-sm font-mono w-8 text-right">
                {editedFields.temperature.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Focused</span>
              <span>Balanced</span>
              <span>Creative</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Trigger</label>
            <SearchableSelect
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'webhook', label: 'Webhook' },
              ]}
              value={editedFields.trigger_type}
              onValueChange={(v) =>
                setEditedFields((f) => ({
                  ...f,
                  trigger_type: v as 'manual' | 'scheduled' | 'webhook',
                }))
              }
              placeholder="Select trigger type"
            />
            <p className="text-xs text-muted-foreground">
              How this employee gets started — manually by a team member, on a schedule, or when
              something happens (webhook).
            </p>
          </div>

          <div className="space-y-1.5">
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
                Slack isn't connected yet — enter a channel ID manually.
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
        </div>
      </CollapsibleSection>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          ← Back to Describe
        </Button>
        <Button onClick={onPreview}>Preview AGENTS.md →</Button>
      </div>
    </div>
  );
}
