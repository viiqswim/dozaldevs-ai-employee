import { useState, useEffect, useRef } from 'react';
import { GATEWAY_URL } from '../lib/constants';
import { getAccessToken } from '../lib/gateway';
import { parseLine, type ParsedLogEntry } from '../lib/log-parser';

export interface UseExecutionLogsResult {
  entries: ParsedLogEntry[];
  rawLines: string[];
  loading: boolean;
  error: string | null;
  completed: boolean;
}

export function useExecutionLogs(
  taskId: string,
  tenantId: string,
  enabled: boolean,
): UseExecutionLogsResult {
  const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !taskId || !tenantId) return;

    const token = getAccessToken();

    setEntries([]);
    setRawLines([]);
    setLoading(true);
    setError(null);
    setCompleted(false);

    const controller = new AbortController();
    abortRef.current = controller;

    const url = `${GATEWAY_URL}/admin/tenants/${tenantId}/tasks/${taskId}/logs`;

    fetch(url, {
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          setError(`Failed to load logs (${response.status}): ${text}`);
          setLoading(false);
          return;
        }

        if (!response.body) {
          setError('No response body');
          setLoading(false);
          return;
        }

        setLoading(false);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processChunk = async (): Promise<void> => {
          const { value, done } = await reader.read();
          if (done) {
            setCompleted(true);
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            if (trimmed.includes('event: done')) {
              setCompleted(true);
              return;
            }

            const dataMatch = trimmed.match(/^data:\s*(.+)$/m);
            if (dataMatch) {
              try {
                const parsed = JSON.parse(dataMatch[1]) as { line?: string };
                if (parsed.line !== undefined) {
                  const raw = parsed.line as string;
                  setRawLines((prev) => [...prev, raw]);
                  setEntries((prev) => [...prev, parseLine(raw)]);
                }
              } catch (_) {
                void _;
              }
            }
          }

          await processChunk();
        };

        await processChunk();
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load logs');
        setLoading(false);
      });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [enabled, taskId, tenantId]);

  return { entries, rawLines, loading, error, completed };
}
