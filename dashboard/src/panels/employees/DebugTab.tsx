import { useEffect, useState } from 'react';
import { fetchBrainPreview } from '@/lib/gateway';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { CollapsibleSection } from './components/CollapsibleSection';
import type { Archetype, BrainPreviewResponse } from '@/lib/types';

interface DebugTabProps {
  archetypeId: string;
  tenantId: string;
  archetype: Archetype;
}

type ViewMode = 'rendered' | 'source';

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
      <button
        type="button"
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          mode === 'rendered'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onChange('rendered')}
      >
        Rendered
      </button>
      <button
        type="button"
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          mode === 'source'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onChange('source')}
      >
        Source
      </button>
    </div>
  );
}

function ContentView({ content, mode }: { content: string; mode: ViewMode }) {
  if (mode === 'source') {
    return (
      <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/30 p-4 rounded-md overflow-auto max-h-[600px]">
        {content}
      </pre>
    );
  }
  return <MarkdownPreview content={content} />;
}

function RawFieldView({ value }: { value: string | null }) {
  if (!value?.trim()) {
    return <p className="text-sm text-muted-foreground italic">Not set</p>;
  }
  return (
    <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/30 p-4 rounded-md overflow-auto max-h-[400px]">
      {value}
    </pre>
  );
}

export function DebugTab({ archetypeId, tenantId, archetype }: DebugTabProps) {
  const [data, setData] = useState<BrainPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promptMode, setPromptMode] = useState<ViewMode>('rendered');
  const [deliveryPromptMode, setDeliveryPromptMode] = useState<ViewMode>('rendered');
  const [compiledAgentsMdMode, setCompiledAgentsMdMode] = useState<ViewMode>('source');

  const fetchData = () => {
    setLoading(true);
    setError(null);
    fetchBrainPreview(tenantId, archetypeId)
      .then((result) => {
        if (result === null) {
          setError('Preview not available for this employee.');
        } else {
          setData(result);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load preview.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, [tenantId, archetypeId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-lg border bg-muted" />
        <div className="h-48 animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-card px-5 py-4 space-y-2">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={fetchData}
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="Execution Prompt"
        subtitle="The exact prompt sent to the AI employee at runtime"
        defaultOpen={true}
        badge={
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            DB: archetypes.execution_instructions
          </code>
        }
        actions={<ViewToggle mode={promptMode} onChange={setPromptMode} />}
      >
        <ContentView content={data.execution_prompt} mode={promptMode} />
      </CollapsibleSection>

      {data.delivery_prompt && (
        <CollapsibleSection
          title="Delivery Prompt"
          subtitle="The prompt sent to the AI employee during the delivery phase (after approval)"
          defaultOpen={true}
          badge={
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              DB: archetypes.delivery_instructions
            </code>
          }
          actions={<ViewToggle mode={deliveryPromptMode} onChange={setDeliveryPromptMode} />}
        >
          <ContentView content={data.delivery_prompt} mode={deliveryPromptMode} />
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Raw Fields (Deprecated)"
        subtitle="Legacy and platform-constant fields — read-only, for debugging only"
        defaultOpen={false}
        badge={
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            deprecated
          </code>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              execution_instructions (platform constant)
            </p>
            <RawFieldView value={archetype.execution_instructions} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              delivery_instructions (platform constant)
            </p>
            <RawFieldView value={archetype.delivery_instructions} />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Compiled AGENTS.md"
        subtitle="The full AGENTS.md assembled from all layers — exact file injected into the worker container. The individual layer breakdown (platform, tenant, employee, rules, knowledge) has been replaced by the unified compiled output."
        defaultOpen={false}
        badge={
          data.compiled_agents_md ? (
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {data.compiled_agents_md.length.toLocaleString()} chars
            </code>
          ) : (
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              not available
            </code>
          )
        }
        actions={
          data.compiled_agents_md ? (
            <ViewToggle mode={compiledAgentsMdMode} onChange={setCompiledAgentsMdMode} />
          ) : undefined
        }
      >
        {data.compiled_agents_md ? (
          <ContentView content={data.compiled_agents_md} mode={compiledAgentsMdMode} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Not available — run the employee once to generate a compiled snapshot.
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}
