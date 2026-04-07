/**
 * Plain-fetch polling helper for the USE_FLY_HYBRID dispatch branch.
 * Polls a PostgREST endpoint until the task reaches a terminal status,
 * the poll limit is exhausted, or a break-condition status is detected.
 * Uses plain `fetch` and `setTimeout` (not Inngest step primitives).
 */
import type { Logger } from 'pino';

export interface PollForCompletionOpts {
  taskId: string;
  supabaseUrl: string;
  supabaseKey: string;
  /** Maximum number of poll attempts. Defaults to 40. */
  maxPolls?: number;
  /** Milliseconds between polls. Defaults to 30000. */
  intervalMs?: number;
  logger: Logger;
}

export interface PollForCompletionResult {
  completed: boolean;
  finalStatus: string | null;
}

/**
 * Polls PostgREST for task status until a terminal condition is reached.
 *
 * - Returns `{ completed: true }` when status is `"Submitting"` or `"Done"`.
 * - Returns `{ completed: false }` when status is `"AwaitingInput"` or `"Cancelled"`.
 * - Returns `{ completed: false }` after exhausting `maxPolls` attempts.
 * - On fetch errors, logs a warning and continues polling.
 */
export async function pollForCompletion(
  opts: PollForCompletionOpts,
): Promise<PollForCompletionResult> {
  const { taskId, supabaseUrl, supabaseKey, maxPolls = 40, intervalMs = 30_000, logger } = opts;

  const url = `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`;
  const headers = { apikey: supabaseKey };

  let lastStatus: string | null = null;

  for (let i = 0; i < maxPolls; i++) {
    if (intervalMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }

    try {
      const response = await fetch(url, { headers });
      const rows = (await response.json()) as Array<{ status: string }>;

      if (!Array.isArray(rows) || rows.length === 0) {
        continue;
      }

      const status = rows[0].status;
      lastStatus = status;

      if (status === 'Submitting' || status === 'Done') {
        return { completed: true, finalStatus: status };
      }

      if (status === 'AwaitingInput' || status === 'Cancelled') {
        return { completed: false, finalStatus: status };
      }
    } catch (err) {
      logger.warn({ err, taskId, poll: i }, 'poll-completion: fetch error, continuing');
    }
  }

  return { completed: false, finalStatus: lastStatus };
}
