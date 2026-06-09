import { useCallback } from 'react';
import { usePoll } from './use-poll';
import { gatewayFetch } from '../lib/gateway';
import type { FeedbackEvent } from '../lib/types';

export function useFeedbackEvents(taskId: string, tenantId: string, enabled = true) {
  const fetchFn = useCallback(async () => {
    if (!taskId || !tenantId) return [];
    const all = await gatewayFetch<FeedbackEvent[]>(`/admin/tenants/${tenantId}/feedback-events`);
    return all.filter((e) => e.task_id === taskId);
  }, [taskId, tenantId]);

  const { data, loading, error, refresh } = usePoll<FeedbackEvent[]>(fetchFn, undefined, enabled);
  return { events: data ?? [], loading, error, refresh };
}
