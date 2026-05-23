import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useExecutionLogs } from '@/hooks/use-execution-logs';

interface ExecutionLogViewerProps {
  taskId: string;
  tenantId: string;
}

export function ExecutionLogViewer({ taskId, tenantId }: ExecutionLogViewerProps) {
  const { lines, loading, error, completed } = useExecutionLogs(taskId, tenantId, true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  if (loading && lines.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Loading logs…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400 italic py-2">{error}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="bg-zinc-900 text-zinc-100 rounded-lg p-4 font-mono text-xs overflow-auto max-h-96">
        {lines.length === 0 && !loading ? (
          <p className="text-zinc-500 italic">No log output yet…</p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap leading-5">
              {line || '\u00A0'}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {!completed ? (
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Streaming…
          </>
        ) : (
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
            Log complete
          </>
        )}
      </div>
    </div>
  );
}
