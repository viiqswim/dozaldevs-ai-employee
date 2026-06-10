import { useCallback } from 'react';
import { usePoll } from './use-poll';
import { gatewayFetch } from '../lib/gateway';
import type { Deliverable } from '../lib/types';

export function useDeliverable(taskId: string, tenantId: string, enabled = true) {
  const fetchFn = useCallback(async () => {
    if (!taskId || !tenantId) return null;
    const rows = await gatewayFetch<Deliverable[]>(
      `/admin/tenants/${tenantId}/deliverables?task_id=${taskId}&limit=1`,
    );
    return rows[0] ?? null;
  }, [taskId, tenantId]);

  const { data, loading, error, refresh } = usePoll<Deliverable | null>(
    fetchFn,
    undefined,
    enabled,
  );
  return { deliverable: data ?? null, loading, error, refresh };
}
