import type { PostgRESTClient } from './postgrest-client.js';

export interface CompletionParams {
  taskId: string;
  executionId: string;
  prUrl: string | null;
}

export interface CompletionEventParams {
  taskId: string;
  executionId: string;
  prUrl: string | null;
}

export interface FullCompletionParams {
  taskId: string;
  executionId: string;
  prUrl: string | null;
}

export interface CompletionResult {
  supabaseWritten: boolean;
  inngestSent: boolean;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS_MS = [1000, 2000, 4000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes task completion data to Supabase in three sequential steps.
 * Returns true if the critical PATCH (step 1) succeeds, false if it fails.
 * Steps 2 and 3 are non-critical: failures are logged but do not change the return value.
 */
export async function writeCompletionToSupabase(
  params: CompletionParams,
  postgrestClient: PostgRESTClient,
): Promise<boolean> {
  const { taskId, executionId, prUrl } = params;

  // Step 1 (CRITICAL): PATCH tasks — determines whether work is considered written
  try {
    const result = await postgrestClient.patch('tasks', `id=eq.${taskId}`, {
      status: 'Submitting',
      updated_at: new Date().toISOString(),
    });
    if (result === null) {
      console.warn(`[completion] PATCH tasks failed (null response) for task ${taskId}`);
      return false;
    }
  } catch (error) {
    console.warn(
      `[completion] PATCH tasks error for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }

  // Step 2: POST deliverables — non-critical
  try {
    const deliveryType = prUrl !== null ? 'pull_request' : 'no_changes';
    await postgrestClient.post('deliverables', {
      execution_id: executionId,
      delivery_type: deliveryType,
      external_ref: prUrl,
      status: 'submitted',
    });
  } catch (error) {
    console.warn(
      `[completion] POST deliverables error for execution ${executionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 3: POST task_status_log — non-critical
  try {
    await postgrestClient.post('task_status_log', {
      task_id: taskId,
      from_status: 'Executing',
      to_status: 'Submitting',
      actor: 'machine',
    });
  } catch (error) {
    console.warn(
      `[completion] POST task_status_log error for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return true;
}

/**
 * Sends the engineering/task.completed event to Inngest via HTTP POST.
 * Uses a deterministic event ID (taskId + executionId, no Date.now()) to ensure
 * idempotency — safe for watchdog retries.
 * Retries up to MAX_ATTEMPTS times with exponential backoff. Never throws.
 */
export async function sendCompletionEvent(params: CompletionEventParams): Promise<boolean> {
  const { taskId, executionId, prUrl } = params;

  const baseUrl = process.env.INNGEST_BASE_URL ?? 'http://localhost:8288';
  const eventKey = process.env.INNGEST_EVENT_KEY ?? 'local';
  const url = `${baseUrl}/e/${eventKey}`;

  const payload = {
    name: 'engineering/task.completed',
    id: `task-${taskId}-completion-${executionId}`,
    data: { taskId, executionId, prUrl },
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Sleep before retry (not before the first attempt)
    if (attempt > 0) {
      await sleep(BACKOFF_DELAYS_MS[attempt - 1]);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return true;
      }

      console.warn(
        `[completion] Inngest event send returned HTTP ${response.status} (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
      );
    } catch (error) {
      console.warn(
        `[completion] Inngest event send failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.warn(
    `[completion] Failed to send Inngest event for task ${taskId} after ${MAX_ATTEMPTS} attempts`,
  );
  return false;
}

/**
 * Orchestrates the completion flow with hard Supabase-first ordering (SPOF mitigation).
 * Supabase is written BEFORE the Inngest event is sent — if Inngest fails, the persisted
 * status allows a watchdog to recover without losing the work. Never throws.
 */
export async function runCompletionFlow(
  params: FullCompletionParams,
  postgrestClient: PostgRESTClient,
): Promise<CompletionResult> {
  // Step 1: Write to Supabase FIRST (hard ordering requirement — SPOF mitigation)
  const supabaseWritten = await writeCompletionToSupabase(params, postgrestClient);

  if (!supabaseWritten) {
    return { supabaseWritten: false, inngestSent: false };
  }

  // Step 2: Send Inngest event SECOND (only after Supabase write is confirmed)
  const inngestSent = await sendCompletionEvent(params);

  return { supabaseWritten: true, inngestSent };
}
