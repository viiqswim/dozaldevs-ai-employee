import { useState, useEffect } from 'react';
import { fetchBrainPreview } from '@/lib/gateway';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import type { BrainPreviewResponse, BrainPreviewEnvVar, Archetype } from '@/lib/types';

interface BrainPreviewTabProps {
  archetype: Archetype;
  tenantId: string;
}

function sourceBadgeClass(source: BrainPreviewEnvVar['source']): string {
  switch (source) {
    case 'platform':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'tenant_secret':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'tenant_config':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'lifecycle':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'raw_event':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'harness':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

function sourceLabel(source: BrainPreviewEnvVar['source']): string {
  switch (source) {
    case 'platform':
      return 'Platform';
    case 'tenant_secret':
      return 'Tenant Secrets';
    case 'tenant_config':
      return 'Tenant Config';
    case 'lifecycle':
      return 'Lifecycle';
    case 'raw_event':
      return 'Webhook (Conditional)';
    case 'harness':
      return 'Harness Internal';
  }
}

function IsSetIndicator({ isSet }: { isSet: boolean }) {
  return (
    <span
      className={isSet ? 'text-green-600 font-medium text-xs' : 'text-muted-foreground text-xs'}
    >
      {isSet ? '✓ SET' : '— NOT SET'}
    </span>
  );
}

interface PromptSectionProps {
  title: string;
  content: string;
  rawState: boolean;
  onToggleRaw: () => void;
  badge?: React.ReactNode;
}

function PromptSection({ title, content, rawState, onToggleRaw, badge }: PromptSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            {badge}
          </div>
          <Button variant="outline" size="sm" onClick={onToggleRaw}>
            {rawState ? 'Rendered' : 'Raw'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rawState ? (
          <pre className="font-mono text-sm bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
            {content}
          </pre>
        ) : (
          <MarkdownPreview content={content} />
        )}
      </CardContent>
    </Card>
  );
}

const SOURCE_ORDER: BrainPreviewEnvVar['source'][] = [
  'platform',
  'tenant_secret',
  'tenant_config',
  'lifecycle',
  'raw_event',
  'harness',
];

function groupEnvVars(
  envVars: BrainPreviewEnvVar[],
): Partial<Record<BrainPreviewEnvVar['source'], BrainPreviewEnvVar[]>> {
  return envVars.reduce<Partial<Record<BrainPreviewEnvVar['source'], BrainPreviewEnvVar[]>>>(
    (acc, v) => {
      if (!acc[v.source]) acc[v.source] = [];
      acc[v.source]!.push(v);
      return acc;
    },
    {},
  );
}

export function BrainPreviewTab({ archetype, tenantId }: BrainPreviewTabProps) {
  const [data, setData] = useState<BrainPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executionRaw, setExecutionRaw] = useState(false);
  const [deliveryRaw, setDeliveryRaw] = useState(false);
  const [agentsMdTab, setAgentsMdTab] = useState<'platform' | 'tenant' | 'employee' | 'full'>(
    'full',
  );

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchBrainPreview(tenantId, archetype.id)
      .then((result) => {
        if (result === null) {
          setError('Brain preview not available for this employee.');
        } else {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tenantId, archetype.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading brain preview...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error ?? 'Failed to load brain preview.'}
      </div>
    );
  }

  const grouped = groupEnvVars(data.env_vars);

  const toolsByService = data.tools.reduce<Record<string, typeof data.tools>>((acc, t) => {
    if (!acc[t.service]) acc[t.service] = [];
    acc[t.service].push(t);
    return acc;
  }, {});

  const rulesBadge =
    data.employee_rules.length > 0 ? (
      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">
        {data.employee_rules.length} rule{data.employee_rules.length !== 1 ? 's' : ''} injected
      </Badge>
    ) : null;

  return (
    <div className="space-y-4">
      <PromptSection
        title="Execution Prompt"
        content={data.execution_prompt}
        rawState={executionRaw}
        onToggleRaw={() => setExecutionRaw((r) => !r)}
        badge={rulesBadge}
      />

      <Card>
        <details>
          <summary className="flex cursor-pointer select-none items-center justify-between p-6 pb-3">
            <CardTitle className="text-base">Delivery Prompt</CardTitle>
            <span className="text-xs text-muted-foreground">click to expand</span>
          </summary>
          <div className="px-6 pb-6">
            {data.delivery_prompt === null ? (
              <p className="text-muted-foreground text-sm">No delivery instructions configured</p>
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setDeliveryRaw((r) => !r)}>
                    {deliveryRaw ? 'Rendered' : 'Raw'}
                  </Button>
                </div>
                {deliveryRaw ? (
                  <pre className="font-mono text-sm bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                    {data.delivery_prompt}
                  </pre>
                ) : (
                  <MarkdownPreview content={data.delivery_prompt} />
                )}
              </>
            )}
          </div>
        </details>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AGENTS.md</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={agentsMdTab}
            onValueChange={(v) => setAgentsMdTab(v as 'platform' | 'tenant' | 'employee' | 'full')}
          >
            <TabsList>
              <TabsTrigger value="full">Full</TabsTrigger>
              <TabsTrigger value="platform">Platform</TabsTrigger>
              <TabsTrigger value="tenant">Tenant</TabsTrigger>
              <TabsTrigger value="employee">Employee</TabsTrigger>
            </TabsList>

            <TabsContent value="full">
              <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                {data.agents_md.full || ''}
              </pre>
            </TabsContent>

            <TabsContent value="platform">
              {data.agents_md.layers.platform ? (
                <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                  {data.agents_md.layers.platform}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  Not configured for this employee
                </p>
              )}
            </TabsContent>

            <TabsContent value="tenant">
              {data.agents_md.layers.tenant ? (
                <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                  {data.agents_md.layers.tenant}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  Not configured for this employee
                </p>
              )}
            </TabsContent>

            <TabsContent value="employee">
              {data.agents_md.layers.employee ? (
                <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                  {data.agents_md.layers.employee}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  Not configured for this employee
                </p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Environment Variables</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {SOURCE_ORDER.map((source) => {
              const vars = grouped[source];
              if (!vars || vars.length === 0) return null;
              return (
                <div key={source}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {sourceLabel(source)}
                    </span>
                    <Badge className={`text-xs ${sourceBadgeClass(source)}`}>{vars.length}</Badge>
                  </div>
                  {source === 'raw_event' && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Only injected when triggered with webhook payload data
                    </p>
                  )}
                  <dl className="space-y-1">
                    {vars.map((v) => (
                      <div
                        key={v.name}
                        className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/40"
                      >
                        <span className="font-mono text-sm">{v.name}</span>
                        <IsSetIndicator isSet={v.is_set} />
                      </div>
                    ))}
                  </dl>
                  <Separator className="mt-4" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available Tools &amp; Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {Object.entries(toolsByService).map(([service, tools]) => (
              <div key={service}>
                <p className="mb-2 text-sm font-semibold capitalize">{service}</p>
                <ul className="space-y-1">
                  {tools.map((t) => (
                    <li key={t.name} className="flex items-start gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0">
                        {t.name}
                      </span>
                      <span className="text-muted-foreground">—</span>
                      <span className="text-muted-foreground">{t.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {data.skills.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="mb-2 text-sm font-semibold">Pre-loaded Skills</p>
                  <ul className="space-y-1">
                    {data.skills.map((skill) => (
                      <li key={skill.name} className="flex items-start gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0">
                          {skill.name}
                        </span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-muted-foreground">{skill.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {data.tools.length === 0 && data.skills.length === 0 && (
              <p className="text-sm text-muted-foreground">No tools or skills configured</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Runtime Config &amp; Output Contract</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-semibold">Runtime Config</p>
              <dl className="space-y-2">
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="font-mono text-xs">{data.config.model}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd className="font-mono text-xs">{data.config.runtime}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">OpenCode Version</dt>
                  <dd className="font-mono text-xs">{data.config.opencode_version}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Bash Timeout</dt>
                  <dd className="font-mono text-xs">{data.config.bash_timeout_ms}ms</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Permissions</dt>
                  <dd className="font-mono text-xs">{data.config.permissions}</dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold">Output Contract</p>
              {data.output_contract.required_files.length === 0 ? (
                <p className="text-sm text-muted-foreground">No required files specified</p>
              ) : (
                <ul className="space-y-2">
                  {data.output_contract.required_files.map((f) => (
                    <li key={f.path} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{f.path}</span>
                        {f.required ? (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">
                            required
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">
                            optional
                          </Badge>
                        )}
                      </div>
                      {f.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
