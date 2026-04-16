import type { InngestLike } from '../types.js';

export interface SendEventResult {
  success: boolean;
  error?: string;
}

const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000]; // 1s, 2s, 4s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send the engineering/task.received event to Inngest.
 * Retries 3 times with exponential backoff on failure.
 * Returns { success: false, error } instead of throwing.
 */
export async function sendTaskReceivedEvent(params: {
  inngest: InngestLike;
  taskId: string;
  projectId: string;
  repoUrl?: string;
  repoBranch?: string;
  eventId?: string;
}): Promise<SendEventResult> {
  const { inngest, taskId, projectId, repoUrl, repoBranch, eventId } = params;

  const event = {
    name: 'engineering/task.received',
    data: { taskId, projectId, repoUrl, repoBranch },
    ...(eventId ? { id: eventId } : {}),
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await inngest.send(event);
      return { success: true };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't sleep after the last attempt
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BACKOFF_MS[attempt]);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message ?? 'Unknown error sending Inngest event',
  };
}
