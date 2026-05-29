import { useCallback } from 'react';
import { usePoll } from './use-poll';
import { postgrestFetch } from '../lib/postgrest';
import type { Execution } from '../lib/types';

export function useExecution(taskId: string, enabled = true) {
  const fetchFn = useCallback(async () => {
    const rows = await postgrestFetch<Execution>('executions', {
      task_id: `eq.${taskId}`,
      select:
        'id,task_id,runtime_type,status,prompt_tokens,completion_tokens,estimated_cost_usd,heartbeat_at,current_stage,created_at,updated_at',
      order: 'created_at.desc',
      limit: '1',
    });
    return rows[0] ?? null;
  }, [taskId]);

  const { data, loading, error, refresh } = usePoll<Execution | null>(fetchFn, undefined, enabled);
  return { execution: data ?? null, loading, error, refresh };
}
