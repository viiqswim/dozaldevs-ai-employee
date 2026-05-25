import { useEffect, useState } from 'react';
import { fetchBrainPreview } from '@/lib/gateway';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { CollapsibleSection } from './components/CollapsibleSection';
import type { BrainPreviewResponse } from '@/lib/types';

interface DebugTabProps {
  archetypeId: string;
  tenantId: string;
}

type ViewMode = 'rendered' | 'source';

const AGENTS_MD_LAYERS: Array<{
  key: keyof BrainPreviewResponse['agents_md']['layers'];
  label: string;
}> = [
  { key: 'platform', label: 'Platform Policy' },
  { key: 'platformRuntime', label: 'Platform Runtime Context' },
  { key: 'tenant', label: 'Tenant Conventions' },
  { key: 'employee', label: 'Employee Instructions' },
  { key: 'rules', label: 'Behavioral Rules (Learned)' },
  { key: 'knowledge', label: 'Employee Knowledge' },
  { key: 'finalReminders', label: 'Final Reminders' },
];

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

export function DebugTab({ archetypeId, tenantId }: DebugTabProps) {
  const [data, setData] = useState<BrainPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promptMode, setPromptMode] = useState<ViewMode>('rendered');
  const [agentsMdMode, setAgentsMdMode] = useState<ViewMode>('rendered');

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
        actions={<ViewToggle mode={promptMode} onChange={setPromptMode} />}
      >
        <ContentView content={data.execution_prompt} mode={promptMode} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Resolved AGENTS.md"
        subtitle="The full AGENTS.md file as the harness constructs it (all 7 layers merged)"
        defaultOpen={true}
        actions={<ViewToggle mode={agentsMdMode} onChange={setAgentsMdMode} />}
      >
        <div className="space-y-4">
          <ContentView content={data.agents_md.full} mode={agentsMdMode} />

          <CollapsibleSection title="Individual Layers" defaultOpen={false}>
            <div className="space-y-3">
              {AGENTS_MD_LAYERS.map(({ key, label }) => {
                const content = data.agents_md.layers[key];
                if (!content) return null;
                return (
                  <CollapsibleSection key={key} title={label} defaultOpen={false}>
                    <MarkdownPreview content={content} />
                  </CollapsibleSection>
                );
              })}
            </div>
          </CollapsibleSection>
        </div>
      </CollapsibleSection>
    </div>
  );
}
