import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_INTERVAL_MS } from '../lib/constants';

export interface UsePollResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

export function usePoll<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number = POLL_INTERVAL_MS,
): UsePollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const isFirstFetch = useRef(true);

  const execute = useCallback(async () => {
    if (document.hidden) return;

    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (isFirstFetch.current) {
        isFirstFetch.current = false;
        setLoading(false);
      }
    }
  }, [fetchFn]);

  const refresh = useCallback(() => {
    void execute();
  }, [execute]);

  useEffect(() => {
    void execute();
    const id = setInterval(() => void execute(), intervalMs);
    return () => clearInterval(id);
  }, [execute, intervalMs]);

  return { data, error, loading, refresh };
}
