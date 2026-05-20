import { useCallback } from 'react';
import { usePoll } from './use-poll';
import { postgrestFetch } from '../lib/postgrest';
import type { FeedbackEvent } from '../lib/types';

export function useFeedbackEvents(taskId: string) {
  const fetchFn = useCallback(async () => {
    return postgrestFetch<FeedbackEvent>('feedback_events', {
      task_id: `eq.${taskId}`,
      select: 'id,task_id,event_type,actor_id,created_at',
      order: 'created_at.desc',
    });
  }, [taskId]);

  const { data, loading, error, refresh } = usePoll<FeedbackEvent[]>(fetchFn);
  return { events: data ?? [], loading, error, refresh };
}
