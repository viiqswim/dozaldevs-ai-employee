import { useState, useEffect } from 'react';
import { gatewayFetch } from '../lib/gateway';
import type { ExecutionWithTranscript } from '../lib/types';

export function useExecutionTranscript(executionId: string | null, tenantId: string) {
  const [transcript, setTranscript] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!executionId || !tenantId) return;
    setLoading(true);
    gatewayFetch<ExecutionWithTranscript[]>(
      `/admin/tenants/${tenantId}/executions?id=${executionId}`,
    )
      .then((rows) => {
        setTranscript(rows[0]?.session_transcript ?? null);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }, [executionId, tenantId]);

  return { transcript, loading, error };
}
