import { useCallback } from 'react';
import { usePoll } from './use-poll';
import { gatewayFetch } from '../lib/gateway';
import type { Execution } from '../lib/types';

export function useExecution(taskId: string, tenantId: string, enabled = true) {
  const fetchFn = useCallback(async () => {
    if (!taskId || !tenantId) return null;
    const rows = await gatewayFetch<Execution[]>(
      `/admin/tenants/${tenantId}/executions?task_id=${taskId}&limit=1`,
    );
    return rows[0] ?? null;
  }, [taskId, tenantId]);

  const { data, loading, error, refresh } = usePoll<Execution | null>(fetchFn, undefined, enabled);
  return { execution: data ?? null, loading, error, refresh };
}
