import { useState, useEffect } from 'react';
import { fetchBrainPreview } from '@/lib/gateway';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
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
  id?: string;
  defaultOpen?: boolean;
}

function PromptSection({
  title,
  content,
  rawState,
  onToggleRaw,
  badge,
  id,
  defaultOpen,
}: PromptSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);
  return (
    <Card id={id}>
      <details open={isOpen}>
        <summary
          className="flex cursor-pointer select-none items-center justify-between p-6 pb-3"
          onClick={(e) => {
            e.preventDefault();
            setIsOpen((o) => !o);
          }}
        >
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            {badge}
          </div>
          <span className="text-xs text-muted-foreground">click to toggle</span>
        </summary>
        <CardContent>
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={onToggleRaw}>
              {rawState ? 'Rendered' : 'Raw'}
            </Button>
          </div>
          {rawState ? (
            <pre className="font-mono text-sm bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
              {content}
            </pre>
          ) : (
            <MarkdownPreview content={content} />
          )}
        </CardContent>
      </details>
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

const SECTION_NAV = [
  { id: 'brain-execution-prompt', label: 'Task Prompt', phase: 'execution' },
  { id: 'brain-agents-md', label: 'AGENTS.md', phase: 'execution' },
  { id: 'brain-env-vars', label: 'Env Vars', phase: 'execution' },
  { id: 'brain-tools', label: 'Tools', phase: 'execution' },
  { id: 'brain-runtime', label: 'Runtime', phase: 'execution' },
  { id: 'brain-delivery-prompt', label: 'Delivery Prompt', phase: 'delivery' },
] as const;

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
  const [agentsMdRaw, setAgentsMdRaw] = useState(true);
  const [agentsMdTab, setAgentsMdTab] = useState<
    'platform' | 'tenant' | 'employee' | 'full' | 'rules' | 'knowledge'
  >('full');
  const [activeSection, setActiveSection] = useState('brain-execution-prompt');

  const handleNavClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const details = el.querySelector('details');
    if (details && !details.open) {
      const summary = details.querySelector('summary');
      if (summary) summary.click();
    }
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { threshold: 0.1 },
    );

    SECTION_NAV.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [data]);

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
      <div className="flex items-center gap-3 pt-2 pb-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Human Configuration
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Task Trigger
              </p>
              {data.humanFields.taskTrigger ? (
                <pre className="font-mono text-xs bg-muted rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                  {data.humanFields.taskTrigger}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not configured</p>
              )}
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Employee Manual
              </p>
              {data.humanFields.employeeManual ? (
                <pre className="font-mono text-xs bg-muted rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                  {data.humanFields.employeeManual.length > 800
                    ? data.humanFields.employeeManual.slice(0, 800) + '\n… (truncated)'
                    : data.humanFields.employeeManual}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not configured</p>
              )}
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                After-Approval Action
              </p>
              {data.humanFields.afterApprovalAction ? (
                <pre className="font-mono text-xs bg-muted rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                  {data.humanFields.afterApprovalAction}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not configured</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pt-4 pb-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Auto-Injected by Platform
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">
                  Security
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium mb-0.5">Security Preamble</p>
                <p className="text-xs text-muted-foreground">
                  {data.autoInjectedSections.securityPreamble.split('\n\n')[1] ??
                    data.autoInjectedSections.securityPreamble}
                </p>
              </div>
            </div>
            <Separator />
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-xs">
                  Output
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium mb-0.5">Output Contract</p>
                <p className="text-xs text-muted-foreground">
                  {data.autoInjectedSections.outputContract}
                </p>
              </div>
            </div>
            <Separator />
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                  Env
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium mb-0.5">Environment Variables</p>
                <p className="text-xs text-muted-foreground">
                  {data.autoInjectedSections.envManifest}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b py-2 -mx-1 px-1">
        <div className="flex items-center gap-1 overflow-x-auto">
          {SECTION_NAV.filter((item) => item.phase === 'execution').map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              data-active={activeSection === item.id ? 'true' : undefined}
              className={`px-3 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
                activeSection === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="w-px h-4 bg-border mx-1 shrink-0" />
          {SECTION_NAV.filter((item) => item.phase === 'delivery').map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              data-active={activeSection === item.id ? 'true' : undefined}
              className={`px-3 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
                activeSection === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex items-center gap-3 pt-6 pb-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Execution Phase
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <PromptSection
        id="brain-execution-prompt"
        defaultOpen={true}
        title="Task Prompt"
        content={data.execution_prompt}
        rawState={executionRaw}
        onToggleRaw={() => setExecutionRaw((r) => !r)}
        badge={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {data.execution_prompt.length.toLocaleString()} chars
            </span>
            {rulesBadge}
          </div>
        }
      />

      <Card id="brain-agents-md">
        <details>
          <summary className="flex cursor-pointer select-none items-center justify-between p-6 pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">AGENTS.md</CardTitle>
              <span className="text-xs text-muted-foreground font-mono">
                {(data.agents_md.full || '').length.toLocaleString()} chars
              </span>
            </div>
            <span className="text-xs text-muted-foreground">click to toggle</span>
          </summary>
          <CardContent>
            <div className="mb-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setAgentsMdRaw((r) => !r)}>
                {agentsMdRaw ? 'Rendered' : 'Raw'}
              </Button>
            </div>
            <Tabs
              value={agentsMdTab}
              onValueChange={(v) =>
                setAgentsMdTab(
                  v as 'platform' | 'tenant' | 'employee' | 'full' | 'rules' | 'knowledge',
                )
              }
            >
              <TabsList>
                <TabsTrigger value="full">Full</TabsTrigger>
                <TabsTrigger value="platform">Platform</TabsTrigger>
                <TabsTrigger value="tenant">Tenant</TabsTrigger>
                <TabsTrigger value="employee">Employee</TabsTrigger>
                <TabsTrigger value="rules">Rules</TabsTrigger>
                <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
              </TabsList>

              <TabsContent value="full">
                {agentsMdRaw ? (
                  <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                    {data.agents_md.full || ''}
                  </pre>
                ) : (
                  <MarkdownPreview content={data.agents_md.full || ''} />
                )}
              </TabsContent>

              <TabsContent value="platform">
                {data.agents_md.layers.platform ? (
                  agentsMdRaw ? (
                    <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                      {data.agents_md.layers.platform}
                    </pre>
                  ) : (
                    <MarkdownPreview content={data.agents_md.layers.platform} />
                  )
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Not configured for this employee
                  </p>
                )}
              </TabsContent>

              <TabsContent value="tenant">
                {data.agents_md.layers.tenant ? (
                  agentsMdRaw ? (
                    <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                      {data.agents_md.layers.tenant}
                    </pre>
                  ) : (
                    <MarkdownPreview content={data.agents_md.layers.tenant} />
                  )
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Not configured for this employee
                  </p>
                )}
              </TabsContent>

              <TabsContent value="employee">
                {data.agents_md.layers.employee ? (
                  agentsMdRaw ? (
                    <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                      {data.agents_md.layers.employee}
                    </pre>
                  ) : (
                    <MarkdownPreview content={data.agents_md.layers.employee} />
                  )
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Not configured for this employee
                  </p>
                )}
              </TabsContent>

              <TabsContent value="rules">
                {data.agents_md.layers.rules ? (
                  agentsMdRaw ? (
                    <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                      {data.agents_md.layers.rules}
                    </pre>
                  ) : (
                    <MarkdownPreview content={data.agents_md.layers.rules} />
                  )
                ) : (
                  <p className="text-muted-foreground text-sm italic">No rules learned yet</p>
                )}
              </TabsContent>

              <TabsContent value="knowledge">
                {data.agents_md.layers.knowledge ? (
                  agentsMdRaw ? (
                    <pre className="font-mono text-xs bg-muted rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                      {data.agents_md.layers.knowledge}
                    </pre>
                  ) : (
                    <MarkdownPreview content={data.agents_md.layers.knowledge} />
                  )
                ) : (
                  <p className="text-muted-foreground text-sm italic">No knowledge base entries</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </details>
      </Card>

      <Card id="brain-env-vars">
        <details>
          <summary className="flex cursor-pointer select-none items-center justify-between p-6 pb-3">
            <CardTitle className="text-base">Environment Variables</CardTitle>
            <span className="text-xs text-muted-foreground">click to toggle</span>
          </summary>
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
        </details>
      </Card>

      <Card id="brain-tools">
        <details>
          <summary className="flex cursor-pointer select-none items-center justify-between p-6 pb-3">
            <CardTitle className="text-base">Available Tools &amp; Skills</CardTitle>
            <span className="text-xs text-muted-foreground">click to toggle</span>
          </summary>
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
                    <p className="mb-2 text-sm font-semibold">On-demand Skills</p>
                    <p className="mb-2 text-xs text-muted-foreground">
                      (agent calls <code>skill(name)</code> to load)
                    </p>
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
        </details>
      </Card>

      <Card id="brain-runtime">
        <details>
          <summary className="flex cursor-pointer select-none items-center justify-between p-6 pb-3">
            <CardTitle className="text-base">Runtime Config &amp; Output Contract</CardTitle>
            <span className="text-xs text-muted-foreground">click to toggle</span>
          </summary>
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
        </details>
      </Card>

      <div className="flex items-center gap-3 pt-6 pb-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Delivery Phase
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card id="brain-delivery-prompt">
        <details>
          <summary className="flex cursor-pointer select-none items-center justify-between p-6 pb-3">
            <CardTitle className="text-base">Delivery Prompt</CardTitle>
            <span className="text-xs text-muted-foreground">click to toggle</span>
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
    </div>
  );
}
