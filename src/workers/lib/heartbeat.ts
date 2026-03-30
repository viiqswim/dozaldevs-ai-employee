import type { PostgRESTClient } from './postgrest-client.js';

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

export interface EscalateOptions {
  executionId: string | null;
  taskId: string;
  reason: string;
  failedStage?: string;
  errorOutput?: string;
  postgrestClient: PostgRESTClient;
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
      console.warn('[heartbeat] No executionId, skipping DB write');
      return;
    }

    try {
      await postgrestClient.patch('executions', `id=eq.${executionId}`, {
        heartbeat_at: new Date().toISOString(),
        current_stage: currentStage,
      });
    } catch (error) {
      console.warn(
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

/**
 * Escalate a task to human review.
 * Updates task status, logs the transition, and posts to Slack.
 * All steps log errors but never throw — escalation must succeed even if one step fails.
 */
export async function escalate(options: EscalateOptions): Promise<void> {
  const { taskId, reason, failedStage, postgrestClient } = options;

  // Step 1: Log escalation to stdout
  console.warn(`[escalate] Task ${taskId}: ${reason}`);

  // Step 2: PATCH task status to AwaitingInput
  try {
    await postgrestClient.patch('tasks', `id=eq.${taskId}`, {
      status: 'AwaitingInput',
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(
      `[escalate] Failed to update task status for ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 3: Write task_status_log entry
  try {
    await postgrestClient.post('task_status_log', {
      task_id: taskId,
      from_status: 'Executing',
      to_status: 'AwaitingInput',
      actor: 'machine',
    });
  } catch (error) {
    console.warn(
      `[escalate] Failed to write task_status_log for ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 4: Post to Slack
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhookUrl) {
    try {
      const slackMessage = `*[AI Employee]* Task escalated to human review\n*Task ID:* ${taskId}\n*Reason:* ${reason}${failedStage ? `\n*Failed Stage:* ${failedStage}` : ''}`;
      const body = {
        text: slackMessage,
      };

      const response = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.warn(
          `[escalate] Slack webhook returned HTTP ${response.status} for task ${taskId}`,
        );
      }
    } catch (error) {
      console.warn(
        `[escalate] Failed to post to Slack for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
