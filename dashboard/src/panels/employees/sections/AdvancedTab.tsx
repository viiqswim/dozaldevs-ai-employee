import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { listModelCatalog, patchArchetype } from '@/lib/gateway';
import { GATEWAY_URL } from '@/lib/constants';
import { computeCostTierLabel } from '@/lib/utils';
import { InputSchemaSection } from './InputSchemaSection';
import { toast } from 'sonner';
import type { Archetype, Tenant, ModelCatalogEntry } from '@/lib/types';

interface AdvancedTabProps {
  archetype: Archetype;
  tenantId: string;
  tenant: Tenant | null;
  onSaved: () => void;
}

export function AdvancedTab({ archetype, tenantId, tenant, onSaved }: AdvancedTabProps) {
  const [catalogModels, setCatalogModels] = useState<ModelCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [modelSaving, setModelSaving] = useState(false);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    listModelCatalog()
      .then((models) => {
        if (cancelled) return;
        setCatalogModels(models);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalogModels([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const jiraWebhookUrl =
    tenant?.slug && archetype.role_name
      ? `${GATEWAY_URL}/webhooks/jira/${tenant.slug}/${archetype.role_name}`
      : null;

  const handleCopyWebhookUrl = async () => {
    if (!jiraWebhookUrl) return;
    await navigator.clipboard.writeText(jiraWebhookUrl);
    setWebhookUrlCopied(true);
    setTimeout(() => setWebhookUrlCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
      <p className="text-xs text-muted-foreground">
        For developers only — most users can ignore this section.
      </p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <dl>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            AI Model
          </dt>
          <dd className="mt-1">
            {catalogLoading ? (
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            ) : (
              <SearchableSelect
                options={(() => {
                  const opts = catalogModels.map((m) => ({
                    value: m.model_id,
                    label: (() => {
                      const tier = computeCostTierLabel(
                        m.input_cost_per_million,
                        m.output_cost_per_million,
                        m.is_free,
                      );
                      return `${m.display_name} (${m.provider}) — ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
                    })(),
                  }));
                  const current = archetype.model;
                  if (current && !opts.find((o) => o.value === current)) {
                    opts.unshift({ value: current, label: `${current} (custom)` });
                  }
                  return opts;
                })()}
                value={archetype.model ?? ''}
                onValueChange={async (modelId) => {
                  if (modelId === archetype.model) return;
                  setModelSaving(true);
                  try {
                    await patchArchetype(tenantId, archetype.id, { model: modelId });
                    toast.success('Model updated');
                    onSaved();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  } finally {
                    setModelSaving(false);
                  }
                }}
                placeholder="Select a model..."
                searchPlaceholder="Search models..."
                disabled={modelSaving}
              />
            )}
          </dd>
        </dl>
        <dl>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Runtime
          </dt>
          <dd className="mt-0.5 text-sm">{archetype.runtime ?? '—'}</dd>
        </dl>
        <dl>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Machine size
          </dt>
          <dd className="mt-0.5 text-sm">{archetype.vm_size ?? '—'}</dd>
        </dl>
        <dl>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Output type
          </dt>
          <dd className="mt-0.5 text-sm">{archetype.deliverable_type ?? '—'}</dd>
        </dl>
      </div>
      <InputSchemaSection
        items={archetype.input_schema ?? []}
        tenantId={tenantId}
        archetypeId={archetype.id}
        instructions={archetype.execution_instructions ?? archetype.instructions ?? ''}
        onSaved={onSaved}
      />
      {jiraWebhookUrl && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Jira Webhook URL
          </dt>
          <dd className="mt-1 space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border bg-muted/30 px-3 py-2 font-mono text-xs break-all">
                {jiraWebhookUrl}
              </code>
              <Button size="sm" variant="outline" onClick={() => void handleCopyWebhookUrl()}>
                {webhookUrlCopied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL as a webhook in your Jira project settings. Select &ldquo;Issue
              Created&rdquo; as the trigger event.
            </p>
          </dd>
        </div>
      )}
    </div>
  );
}
