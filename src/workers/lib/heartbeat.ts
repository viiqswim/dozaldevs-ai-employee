import { createLogger } from '../../lib/logger.js';
import type { PostgRESTClient } from './postgrest-client.js';

const log = createLogger('heartbeat');

export interface HeartbeatOptions {
  executionId: string | null;
  postgrestClient: PostgRESTClient;
  intervalMs?: number; // default: 60000
  currentStage?: string; // initial stage name
}

export interface HeartbeatHandle {
  stop: () => void;
  updateStage: (stage: string) => void;
}

/**
 * Start a 60-second heartbeat timer that periodically updates execution status.
 * Returns a handle to stop the timer and update the current stage.
 */
export function startHeartbeat(options: HeartbeatOptions): HeartbeatHandle {
  const {
    executionId,
    postgrestClient,
    intervalMs = 60000,
    currentStage: initialStage = '',
  } = options;

  let currentStage = initialStage;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const heartbeatFn = async () => {
    if (!executionId) {
      log.warn('[heartbeat] No executionId, skipping DB write');
      return;
    }

    try {
      await postgrestClient.patch('executions', `id=eq.${executionId}`, {
        heartbeat_at: new Date().toISOString(),
        current_stage: currentStage,
      });
    } catch (error) {
      log.warn(
        `[heartbeat] Failed to update execution ${executionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  intervalId = setInterval(heartbeatFn, intervalMs);

  return {
    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    updateStage: (stage: string) => {
      currentStage = stage;
    },
  };
}
