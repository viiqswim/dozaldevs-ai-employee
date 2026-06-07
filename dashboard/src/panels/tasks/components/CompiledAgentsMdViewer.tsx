import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function CompiledAgentsMdViewer({ content }: { content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-semibold text-foreground">Compiled AGENTS.md</span>
        <span className="ml-1 text-xs text-muted-foreground font-normal">(debug)</span>
      </button>
      {open && (
        <pre className="max-h-[32rem] overflow-auto rounded-md border bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </pre>
      )}
    </div>
  );
}
