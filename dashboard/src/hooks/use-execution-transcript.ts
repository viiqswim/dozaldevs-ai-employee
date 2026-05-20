import { useState, useEffect } from 'react';
import { postgrestFetch } from '../lib/postgrest';
import type { ExecutionWithTranscript } from '../lib/types';

export function useExecutionTranscript(executionId: string | null) {
  const [transcript, setTranscript] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!executionId) return;
    setLoading(true);
    postgrestFetch<ExecutionWithTranscript>('executions', {
      id: `eq.${executionId}`,
      select: 'session_transcript',
      limit: '1',
    })
      .then((rows) => {
        setTranscript(rows[0]?.session_transcript ?? null);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }, [executionId]);

  return { transcript, loading, error };
}
