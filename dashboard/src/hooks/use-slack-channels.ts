import { useEffect, useState } from 'react';
import { fetchSlackChannels } from '@/lib/gateway';
import type { SlackChannel } from '@/lib/types';

interface UseSlackChannelsResult {
  channels: SlackChannel[];
  loading: boolean;
  error: string | undefined;
}

export function useSlackChannels(tenantId: string): UseSlackChannelsResult {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSlackChannels(tenantId)
      .then((result) => {
        if (cancelled) return;
        setChannels(result.channels ?? []);
        if (result.error) setError(result.error);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setChannels([]);
        setError('SLACK_NOT_CONFIGURED');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return { channels, loading, error };
}
