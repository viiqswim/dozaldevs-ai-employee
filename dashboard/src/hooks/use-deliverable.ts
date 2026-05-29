import { useCallback } from 'react';
import { usePoll } from './use-poll';
import { postgrestFetch } from '../lib/postgrest';
import type { Deliverable } from '../lib/types';

export function useDeliverable(taskId: string, enabled = true) {
  const fetchFn = useCallback(async () => {
    const rows = await postgrestFetch<Deliverable>('deliverables', {
      external_ref: `eq.${taskId}`,
      select:
        'id,execution_id,external_ref,delivery_type,status,content,metadata,created_at,updated_at',
      order: 'created_at.desc',
      limit: '1',
    });
    return rows[0] ?? null;
  }, [taskId]);

  const { data, loading, error, refresh } = usePoll<Deliverable | null>(
    fetchFn,
    undefined,
    enabled,
  );
  return { deliverable: data ?? null, loading, error, refresh };
}
