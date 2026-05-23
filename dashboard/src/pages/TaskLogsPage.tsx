import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, Download, Copy, Check, Terminal, Search, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useExecutionLogs } from '@/hooks/use-execution-logs';
import { truncateMessage } from '@/lib/log-parser';
import { useTenant } from '@/hooks/use-tenant';

export function TaskLogsPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { tenantId } = useTenant();

  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());
  const [copiedFormat, setCopiedFormat] = useState<'formatted' | 'raw' | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { entries, rawLines, loading, error, completed } = useExecutionLogs(
    taskId ?? '',
    tenantId,
    true,
  );

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (!showAll) result = result.filter((e) => e.isSignal);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.component.toLowerCase().includes(q) ||
          e.raw.toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, showAll, search]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!isAtBottom && autoScroll) setAutoScroll(false);
  }, [autoScroll]);

  const handleCopy = useCallback(
    async (format: 'formatted' | 'raw') => {
      let text: string;
      if (format === 'formatted') {
        text = filteredEntries
          .map(
            (e) =>
              `${e.timestamp} [${e.level.toUpperCase().padEnd(5)}] ${e.component}: ${e.message}`,
          )
          .join('\n');
      } else {
        text = filteredEntries.map((e) => e.raw).join('\n');
      }
      await navigator.clipboard.writeText(text);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    },
    [filteredEntries],
  );

  const handleDownload = useCallback(() => {
    const blob = new Blob([rawLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-${taskId?.slice(0, 8) ?? 'unknown'}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rawLines, taskId]);

  const errorCount = entries.filter((e) => e.level === 'error').length;
  const warnCount = entries.filter((e) => e.level === 'warn').length;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="px-4 py-3 border-b flex items-center gap-3 bg-background shrink-0">
        <Link
          to={`/dashboard/tasks/${taskId ?? ''}?tenant=${tenantId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Task
        </Link>
        <span className="text-muted-foreground">/</span>
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm font-medium">{taskId?.slice(0, 8) ?? '…'}</span>
          <span className="text-muted-foreground text-sm">— Execution Logs</span>
        </div>
      </div>

      <div className="px-4 py-2 border-b bg-background flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter logs…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button
          variant={showAll ? 'secondary' : 'default'}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'All Lines' : 'Important Only'}
        </Button>

        <Button
          variant={autoScroll ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAutoScroll((v) => !v)}
          title="Auto-scroll to bottom"
        >
          <Pin className={`h-3.5 w-3.5 ${autoScroll ? 'text-primary' : ''}`} />
        </Button>

        <div className="flex items-center border rounded-md overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs rounded-none border-r px-2.5"
            onClick={() => void handleCopy('formatted')}
            title="Copy formatted (for pasting into chat)"
          >
            {copiedFormat === 'formatted' ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Copy</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs rounded-none px-2"
            onClick={() => void handleCopy('raw')}
            title="Copy raw JSON"
          >
            {copiedFormat === 'raw' ? <Check className="h-3.5 w-3.5 text-green-500" /> : 'Raw'}
          </Button>
        </div>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download
        </Button>
      </div>

      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-zinc-900 text-zinc-100 font-mono text-xs"
      >
        {loading && (
          <div className="flex items-center gap-2 px-3 py-4 text-zinc-400">
            <span className="animate-pulse">●</span>
            <span>Connecting to log stream…</span>
          </div>
        )}
        {error && <div className="px-3 py-4 text-red-400">Error: {error}</div>}
        {!loading && !error && filteredEntries.length === 0 && entries.length > 0 && (
          <div className="px-3 py-4 text-zinc-500">No lines match your filter.</div>
        )}
        {!loading && !error && entries.length === 0 && completed && (
          <div className="px-3 py-4 text-zinc-500">No log entries found.</div>
        )}
        {filteredEntries.map((entry, idx) => {
          const { text, truncated } = truncateMessage(entry.message);
          const isExpanded = expandedLines.has(idx);
          return (
            <div key={idx} className="flex gap-2 items-start py-0.5 px-3 hover:bg-zinc-800/50">
              <span className="text-zinc-500 w-24 shrink-0 tabular-nums select-none">
                {entry.timestamp || '——:——:——.———'}
              </span>
              <span
                className={`w-5 shrink-0 font-bold select-none ${
                  entry.level === 'error'
                    ? 'text-red-400'
                    : entry.level === 'warn'
                      ? 'text-amber-400'
                      : 'text-zinc-500'
                }`}
              >
                {entry.level === 'error' ? 'E' : entry.level === 'warn' ? 'W' : 'I'}
              </span>
              <span className="w-16 shrink-0 text-zinc-500 truncate select-none">
                {entry.component}
              </span>
              <span
                className={`flex-1 break-all ${
                  entry.level === 'error'
                    ? 'text-red-300'
                    : entry.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-zinc-100'
                }`}
              >
                {isExpanded ? entry.message : text}
                {truncated && !isExpanded && (
                  <button
                    className="ml-2 text-zinc-500 hover:text-zinc-300 underline"
                    onClick={() => setExpandedLines((prev) => new Set([...prev, idx]))}
                  >
                    Show more
                  </button>
                )}
                {isExpanded && truncated && (
                  <button
                    className="ml-2 text-zinc-500 hover:text-zinc-300 underline"
                    onClick={() =>
                      setExpandedLines((prev) => {
                        const next = new Set(prev);
                        next.delete(idx);
                        return next;
                      })
                    }
                  >
                    Show less
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 px-4 py-2 border-t bg-background flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{filteredEntries.length}</strong> of{' '}
          <strong className="text-foreground">{entries.length}</strong> lines
        </span>
        {errorCount > 0 && (
          <span className="text-red-500">
            ● {errorCount} error{errorCount !== 1 ? 's' : ''}
          </span>
        )}
        {warnCount > 0 && (
          <span className="text-amber-500">
            ● {warnCount} warning{warnCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {completed ? (
            <span className="text-green-600">✓ Log complete</span>
          ) : (
            <>
              <span className="animate-pulse text-primary">●</span>
              <span>Streaming…</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
